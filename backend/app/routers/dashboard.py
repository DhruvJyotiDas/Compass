"""Dashboard KPIs and analytics aggregates."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import scope_to_user
from app.database import get_db
from app.models import Activity, Deal, Lead, Stage, User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)

    # Open pipeline value + count
    open_stmt = scope_to_user(select(func.coalesce(func.sum(Deal.amount), 0), func.count(Deal.id)), Deal, user).where(Deal.status == "open")
    open_value, open_count = (await db.execute(open_stmt)).one()

    # Won this month
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    won_stmt = scope_to_user(select(func.coalesce(func.sum(Deal.amount), 0), func.count(Deal.id)), Deal, user).where(
        Deal.status == "won", Deal.closed_at >= month_start)
    won_value, won_count = (await db.execute(won_stmt)).one()

    lost_count = await db.scalar(scope_to_user(select(func.count(Deal.id)), Deal, user).where(
        Deal.status == "lost", Deal.closed_at >= month_start)) or 0

    # Leads by status
    leads_by_status = (await db.execute(
        scope_to_user(select(Lead.status, func.count(Lead.id)), Lead, user).group_by(Lead.status)
    )).all()

    total_leads = await db.scalar(scope_to_user(select(func.count(Lead.id)), Lead, user)) or 0
    converted_leads = await db.scalar(
        scope_to_user(select(func.count(Lead.id)), Lead, user).where(Lead.converted == True)  # noqa: E712
    ) or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads else 0.0

    # Deals by stage (for funnel) — join stage name
    deals_by_stage = (await db.execute(
        scope_to_user(
            select(Stage.name, func.count(Deal.id), func.coalesce(func.sum(Deal.amount), 0))
            .join(Stage, Deal.stage_id == Stage.id), Deal, user
        ).where(Deal.status == "open").group_by(Stage.name, Stage.sort_order).order_by(Stage.sort_order)
    )).all()

    # Leads by source
    leads_by_source = (await db.execute(
        scope_to_user(select(func.coalesce(Lead.source, "unknown"), func.count(Lead.id)), Lead, user)
        .group_by(Lead.source)
    )).all()

    # Activities due
    today_end = now.replace(hour=23, minute=59, second=59)
    overdue = await db.scalar(scope_to_user(select(func.count(Activity.id)), Activity, user).where(
        Activity.status != "completed", Activity.due_date < now)) or 0
    due_today = await db.scalar(scope_to_user(select(func.count(Activity.id)), Activity, user).where(
        Activity.status != "completed", Activity.due_date >= now, Activity.due_date <= today_end)) or 0

    return {
        "open_pipeline_value": float(open_value or 0),
        "open_deals": int(open_count or 0),
        "won_this_month_value": float(won_value or 0),
        "won_this_month_count": int(won_count or 0),
        "lost_this_month_count": int(lost_count),
        "total_leads": int(total_leads),
        "conversion_rate": conversion_rate,
        "activities_overdue": int(overdue),
        "activities_due_today": int(due_today),
        "leads_by_status": [{"status": s or "new", "count": c} for s, c in leads_by_status],
        "leads_by_source": [{"source": s, "count": c} for s, c in leads_by_source],
        "deals_by_stage": [{"stage": n, "count": c, "value": float(v or 0)} for n, c, v in deals_by_stage],
    }
