"""Campaign endpoints: create, read, edit draft, approve (dispatch), insights."""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AIRun, Campaign, Communication, OutboxJob
from app.routers.segments import _build_sql
from app.schemas import ApproveRequest, CampaignOut, DSLFilter

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignUpdate(BaseModel):
    """Marketer edits to a draft campaign artifact before approval."""
    name: Optional[str] = None
    plan: Optional[dict] = None
    segment_dsl: Optional[dict] = None
    message_variants: Optional[list[Any]] = None


class ImproveCopyRequest(BaseModel):
    instruction: Optional[str] = None


@router.get("", response_model=list[CampaignOut])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).order_by(Campaign.created_at.desc()).limit(50))
    return result.scalars().all()


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Campaign not found")
    return c


@router.patch("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(campaign_id: str, body: CampaignUpdate, db: AsyncSession = Depends(get_db)):
    """Persist marketer edits to a draft campaign (name/plan/segment/messages)."""
    campaign = (await db.execute(select(Campaign).where(Campaign.id == campaign_id))).scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if campaign.status != "draft":
        raise HTTPException(400, f"Cannot edit a {campaign.status} campaign")
    for field in ("name", "plan", "segment_dsl", "message_variants"):
        val = getattr(body, field)
        if val is not None:
            setattr(campaign, field, val)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/{campaign_id}/improve-copy")
async def improve_copy(campaign_id: str, body: ImproveCopyRequest, db: AsyncSession = Depends(get_db)):
    """AI: regenerate message copy for a draft campaign (Improve Message / Create Variants)."""
    from app.ai.campaign_agent import write_copy

    campaign = (await db.execute(select(Campaign).where(Campaign.id == campaign_id))).scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if campaign.status != "draft":
        raise HTTPException(400, f"Cannot edit a {campaign.status} campaign")

    audience = (campaign.segment_dsl or {}).get("audience_description", "the target audience")
    copy, meta, valid = await write_copy(campaign.plan or {}, audience, instruction=body.instruction)
    campaign.message_variants = copy["variants"]
    await db.commit()
    return {"variants": copy["variants"], "provider": meta.get("provider", "unknown"), "valid": valid}


@router.post("/{campaign_id}/approve")
async def approve_campaign(
    campaign_id: str,
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a draft campaign:
    1. Optionally override segment DSL (if marketer edited filter chips)
    2. Count audience, create Communications + OutboxJobs in one transaction
    3. Set status → approved (outbox worker picks up and dispatches)
    """
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if campaign.status not in ("draft",):
        raise HTTPException(400, f"Campaign is already {campaign.status}")

    # Resolve segment DSL
    dsl_data = body.segment_dsl.model_dump() if body.segment_dsl else campaign.segment_dsl
    if not dsl_data or not dsl_data.get("filters"):
        raise HTTPException(400, "No segment DSL found")

    filters = [DSLFilter(**f) for f in dsl_data["filters"]]
    logic = dsl_data.get("logic", "AND")
    where, params = _build_sql(filters, logic)

    # Fetch audience
    audience_sql = text(
        f"SELECT id, name, email FROM customers WHERE {where}"
    )
    rows = (await db.execute(audience_sql, params)).fetchall()
    if not rows:
        raise HTTPException(400, "Segment returned 0 customers — adjust filters")

    # Resolve message variants
    variants = campaign.message_variants or []
    plan = campaign.plan or {}
    plan_variants = plan.get("variants", [])

    def _get_variant(idx: int) -> tuple[str, str, str | None, str]:
        if not plan_variants:
            channel = "whatsapp" if idx % 2 == 0 else "email"
            msg = variants[idx]["body"] if idx < len(variants) else "Hello {{first_name}}!"
            subj = variants[idx].get("subject") if idx < len(variants) else None
            v_id = "A" if idx == 0 else "B"
            return channel, msg, subj, v_id

        pv = plan_variants[idx % len(plan_variants)]
        channel = pv.get("channel", "whatsapp")
        v_id = pv.get("variant_id", "A")
        msg_v = next((v for v in variants if v.get("variant_id") == v_id), None)
        msg = msg_v["body"] if msg_v else "Hello {{first_name}}!"
        subj = msg_v.get("subject") if msg_v else None
        return channel, msg, subj, v_id

    # Create Communications + OutboxJobs in one transaction
    total = len(rows)
    for i, row in enumerate(rows):
        channel, msg, subj, v_id = _get_variant(i % max(len(plan_variants), 1))

        comm = Communication(
            campaign_id=campaign_id,
            customer_id=str(row.id),
            channel=channel,
            message=msg,
            subject=subj,
            variant=v_id,
            status="pending",
        )
        db.add(comm)
        await db.flush()  # get comm.id

        job = OutboxJob(communication_id=comm.id, status="pending")
        db.add(job)

    campaign.status = "approved"
    campaign.audience_count = total
    campaign.segment_dsl = dsl_data
    await db.commit()

    return {"status": "approved", "audience_count": total, "campaign_id": campaign_id}


async def _compute_stats(campaign_id: str, db: AsyncSession) -> dict:
    """Compute cumulative funnel stats from events table, not current status.

    Funnel semantics: a comm that reached 'clicked' should count as
    delivered+opened+clicked, not just clicked.
    """
    stats_sql = text("""
        SELECT
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type IN ('sent','delivered','opened','read','clicked')) AS sent,
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type IN ('delivered','opened','read','clicked')) AS delivered,
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type IN ('opened','read','clicked')) AS opened,
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type IN ('read','clicked')) AS read,
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type = 'clicked') AS clicked,
            COUNT(DISTINCT ce.communication_id) FILTER (WHERE ce.event_type = 'failed') AS failed
        FROM communication_events ce
        JOIN communications c ON c.id = ce.communication_id
        WHERE c.campaign_id = :cid
    """)
    row = (await db.execute(stats_sql, {"cid": campaign_id})).fetchone()

    total_sql = text("SELECT COUNT(*) FROM communications WHERE campaign_id = :cid")
    total = (await db.execute(total_sql, {"cid": campaign_id})).scalar() or 0

    dlq_sql = text(
        "SELECT COUNT(*) FROM outbox_jobs oj "
        "JOIN communications c ON c.id = oj.communication_id "
        "WHERE c.campaign_id = :cid AND oj.status = 'dead'"
    )
    dlq_count = (await db.execute(dlq_sql, {"cid": campaign_id})).scalar() or 0

    # Count attribution conversions
    conv_sql = text(
        "SELECT COUNT(*) FROM orders o "
        "JOIN communications c ON c.id = o.attributed_communication_id "
        "WHERE c.campaign_id = :cid"
    )
    converted = (await db.execute(conv_sql, {"cid": campaign_id})).scalar() or 0

    return {
        "sent": row.sent or 0,
        "delivered": row.delivered or 0,
        "opened": row.opened or 0,
        "read": row.read or 0,
        "clicked": row.clicked or 0,
        "failed": row.failed or 0,
        "converted": converted,
        "dlq_count": dlq_count,
        "total": total,
    }


@router.get("/{campaign_id}/stats")
async def get_stats(campaign_id: str, db: AsyncSession = Depends(get_db)):
    return await _compute_stats(campaign_id, db)


@router.get("/{campaign_id}/communications")
async def list_communications(
    campaign_id: str, limit: int = 100, db: AsyncSession = Depends(get_db)
):
    """Execution monitor feed: per-customer delivery status, retries and DLQ state."""
    sql = text("""
        SELECT c.id, cust.name AS customer_name, c.channel, c.variant, c.status,
               COALESCE(oj.status, 'n/a') AS job_status, COALESCE(oj.attempts, 0) AS attempts
        FROM communications c
        JOIN customers cust ON cust.id = c.customer_id
        LEFT JOIN outbox_jobs oj ON oj.communication_id = c.id
        WHERE c.campaign_id = :cid
        ORDER BY c.created_at DESC
        LIMIT :limit
    """)
    rows = (await db.execute(sql, {"cid": campaign_id, "limit": limit})).fetchall()
    return [
        {"id": str(r.id), "customer_name": r.customer_name, "channel": r.channel,
         "variant": r.variant, "status": r.status, "job_status": r.job_status,
         "attempts": r.attempts}
        for r in rows
    ]


@router.post("/{campaign_id}/insights")
async def generate_insights(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Trigger step-5 insights generation after campaign settles."""
    from app.ai.pipeline import run_insights

    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404)

    stats_result = await _compute_stats(campaign_id, db)

    insight_result = await run_insights(campaign_id, stats_result)
    campaign.insights = insight_result["output"]
    campaign.status = "completed"

    meta = insight_result.get("meta", {})
    run = AIRun(
        campaign_id=campaign_id,
        step="insights",
        input=stats_result,
        output={**insight_result["output"], "_meta": meta},
        valid=insight_result["valid"],
        latency_ms=meta.get("latency_ms", 0),
        model=meta.get("model") or settings.llm_model,
    )
    db.add(run)
    await db.commit()

    return insight_result["output"]
