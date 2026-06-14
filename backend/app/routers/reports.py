"""Reports & forecasting — aggregation queries across CRM modules."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import scope_to_user
from app.database import get_db
from app.models import Activity, Deal, Lead, Stage, User

router = APIRouter(prefix="/reports", tags=["reports"])


def _period_bounds(period: str, ref: datetime) -> tuple[datetime, datetime]:
    """Return (start, end) for the given period string relative to ref."""
    if period == "this_month":
        start = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month = (start + timedelta(days=32)).replace(day=1)
        return start, next_month
    if period == "last_month":
        first_this = ref.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_start = (first_this - timedelta(days=1)).replace(day=1)
        return last_start, first_this
    if period == "this_quarter":
        q = (ref.month - 1) // 3
        start = ref.replace(month=q * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_month = q * 3 + 4
        if end_month > 12:
            end = start.replace(year=start.year + 1, month=end_month - 12, day=1)
        else:
            end = start.replace(month=end_month, day=1)
        return start, end
    if period == "this_year":
        start = ref.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(year=start.year + 1)
        return start, end
    # last_90_days default
    end = ref
    start = ref - timedelta(days=90)
    return start, end


# ── Pipeline report ───────────────────────────────────────────────────────────

@router.get("/pipeline")
async def pipeline_report(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Current open pipeline value by stage + weighted forecast."""
    rows = (await db.execute(
        scope_to_user(
            select(
                Stage.name,
                Stage.sort_order,
                Stage.probability,
                func.count(Deal.id).label("count"),
                func.coalesce(func.sum(Deal.amount), 0).label("value"),
            )
            .join(Stage, Deal.stage_id == Stage.id),
            Deal, user,
        )
        .where(Deal.status == "open")
        .group_by(Stage.name, Stage.sort_order, Stage.probability)
        .order_by(Stage.sort_order)
    )).all()

    stages = [
        {
            "stage": r.name,
            "probability": r.probability,
            "count": r.count,
            "value": float(r.value or 0),
            "weighted_value": float(r.value or 0) * r.probability / 100,
        }
        for r in rows
    ]
    total_pipeline = sum(s["value"] for s in stages)
    weighted_forecast = sum(s["weighted_value"] for s in stages)

    return {"stages": stages, "total_pipeline": total_pipeline, "weighted_forecast": weighted_forecast}


# ── Lead funnel report ────────────────────────────────────────────────────────

@router.get("/leads")
async def leads_report(
    period: str = Query("last_90_days"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start, end = _period_bounds(period, now)

    by_status = (await db.execute(
        scope_to_user(select(Lead.status, func.count(Lead.id)), Lead, user)
        .where(Lead.created_at >= start, Lead.created_at < end)
        .group_by(Lead.status)
    )).all()

    by_source = (await db.execute(
        scope_to_user(select(func.coalesce(Lead.source, "unknown"), func.count(Lead.id)), Lead, user)
        .where(Lead.created_at >= start, Lead.created_at < end)
        .group_by(Lead.source)
    )).all()

    total = sum(r[1] for r in by_status)
    converted = sum(r[1] for r in by_status if r[0] == "converted")

    return {
        "period": period,
        "total": total,
        "converted": converted,
        "conversion_rate": round(converted / total * 100, 1) if total else 0.0,
        "by_status": [{"status": s or "new", "count": c} for s, c in by_status],
        "by_source": [{"source": s, "count": c} for s, c in by_source],
    }


# ── Activity report ───────────────────────────────────────────────────────────

@router.get("/activities")
async def activities_report(
    period: str = Query("this_month"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start, end = _period_bounds(period, now)

    by_type = (await db.execute(
        scope_to_user(select(Activity.type, Activity.status, func.count(Activity.id)), Activity, user)
        .where(Activity.created_at >= start, Activity.created_at < end)
        .group_by(Activity.type, Activity.status)
    )).all()

    overdue = await db.scalar(
        scope_to_user(select(func.count(Activity.id)), Activity, user)
        .where(Activity.status != "completed", Activity.due_date < now)
    ) or 0

    summary: dict[str, dict] = {}
    for atype, status, count in by_type:
        if atype not in summary:
            summary[atype] = {"type": atype, "total": 0, "completed": 0, "open": 0}
        summary[atype]["total"] += count
        if status == "completed":
            summary[atype]["completed"] += count
        else:
            summary[atype]["open"] += count

    return {"period": period, "overdue": overdue, "by_type": list(summary.values())}


# ── Win / Loss report ─────────────────────────────────────────────────────────

@router.get("/win-loss")
async def win_loss_report(
    period: str = Query("this_quarter"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start, end = _period_bounds(period, now)

    rows = (await db.execute(
        scope_to_user(
            select(
                Deal.status,
                func.count(Deal.id).label("count"),
                func.coalesce(func.sum(Deal.amount), 0).label("value"),
            ),
            Deal, user,
        )
        .where(Deal.status.in_(["won", "lost"]), Deal.closed_at >= start, Deal.closed_at < end)
        .group_by(Deal.status)
    )).all()

    won = next(({"count": r.count, "value": float(r.value or 0)} for r in rows if r.status == "won"),
               {"count": 0, "value": 0.0})
    lost = next(({"count": r.count, "value": float(r.value or 0)} for r in rows if r.status == "lost"),
                {"count": 0, "value": 0.0})
    total_count = won["count"] + lost["count"]
    win_rate = round(won["count"] / total_count * 100, 1) if total_count else 0.0

    return {"period": period, "won": won, "lost": lost, "win_rate": win_rate}


# ── Revenue forecast ──────────────────────────────────────────────────────────

@router.get("/forecast")
async def revenue_forecast(
    months: int = Query(6, ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Monthly revenue: actual won + probability-weighted open pipeline by close month."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    buckets = []
    for i in range(months):
        m_start = (start.replace(day=1) + timedelta(days=32 * i)).replace(day=1)
        m_end = (m_start + timedelta(days=32)).replace(day=1)
        label = m_start.strftime("%b %Y")

        won_val = await db.scalar(
            scope_to_user(select(func.coalesce(func.sum(Deal.amount), 0)), Deal, user)
            .where(Deal.status == "won", Deal.closed_at >= m_start, Deal.closed_at < m_end)
        ) or 0

        open_rows = (await db.execute(
            scope_to_user(
                select(Deal.amount, Deal.probability), Deal, user
            ).where(Deal.status == "open", Deal.close_date >= m_start, Deal.close_date < m_end)
        )).all()
        weighted = sum((float(r.amount or 0) * (r.probability or 0) / 100) for r in open_rows)

        buckets.append({
            "month": label,
            "won": float(won_val),
            "weighted_open": round(weighted, 2),
            "total": round(float(won_val) + weighted, 2),
        })
    return {"months": buckets}
