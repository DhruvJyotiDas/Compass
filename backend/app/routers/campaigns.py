"""Campaign endpoints: create, read, approve (dispatch), insights."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AIRun, Campaign, Communication, OutboxJob
from app.routers.segments import _build_sql
from app.schemas import ApproveRequest, CampaignOut, DSLFilter

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


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
        model="claude-sonnet-4-6",
    )
    db.add(run)
    await db.commit()

    return insight_result["output"]
