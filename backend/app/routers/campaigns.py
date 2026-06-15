"""Campaign endpoints: create, read, edit draft, approve (dispatch), insights."""
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AIRun, Campaign, Communication, OutboxJob
from app.personalization import build_context, render
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

    # If the marketer picked a specific subset in the preview, send only to those (still
    # respecting opted_out). Otherwise send to the whole compiled segment.
    cols = "id, name, email, last_order_at, favorite_category"
    if body.customer_ids:
        audience_sql = text(
            f"SELECT {cols} FROM customers WHERE id = ANY(:ids) AND opted_out = FALSE"
        )
        rows = (await db.execute(audience_sql, {"ids": body.customer_ids})).fetchall()
    else:
        audience_sql = text(f"SELECT {cols} FROM customers WHERE {where}")
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

    # Token values shared by every recipient (discount/percentage from the offer, expiry, brand).
    offer = (campaign.intent or {}).get("offer")
    ctx = build_context(offer=offer, goal=campaign.goal_text, brand_name=settings.brand_name)

    # Create Communications + OutboxJobs in bulk (one flush, not one per row — a large
    # audience would otherwise issue thousands of round-trips and time out the request).
    total = len(rows)
    comms, jobs = [], []
    for i, row in enumerate(rows):
        channel, msg, subj, v_id = _get_variant(i % max(len(plan_variants), 1))
        # Fill {{first_name}}, {{discount}}, {{expiry}}… with THIS customer's real data so the
        # message that actually goes out is personalized — never raw template tokens.
        cust = {"name": row.name, "last_order_at": row.last_order_at,
                "favorite_category": row.favorite_category}
        comm_id = str(uuid.uuid4())
        comms.append(Communication(
            id=comm_id,
            campaign_id=campaign_id,
            customer_id=str(row.id),
            channel=channel,
            message=render(msg, cust, ctx),
            subject=render(subj, cust, ctx),
            variant=v_id,
            status="pending",
        ))
        jobs.append(OutboxJob(communication_id=comm_id, status="pending"))
    db.add_all(comms)
    await db.flush()
    db.add_all(jobs)

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
    # Funnel level per communication = the furthest stage it reached, taken from
    # EITHER a delivery event OR the communication's own status. Older demo runs
    # set communication.status without emitting events, so reading events alone
    # left every such campaign with an all-zero funnel.
    stats_sql = text("""
        WITH levels AS (
            SELECT
                c.id,
                GREATEST(
                    CASE c.status
                        WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'opened' THEN 3
                        WHEN 'read' THEN 4 WHEN 'clicked' THEN 5 ELSE 0 END,
                    COALESCE(MAX(CASE ce.event_type
                        WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'opened' THEN 3
                        WHEN 'read' THEN 4 WHEN 'clicked' THEN 5 ELSE 0 END), 0)
                ) AS lvl,
                bool_or(c.status = 'failed' OR ce.event_type = 'failed') AS failed
            FROM communications c
            LEFT JOIN communication_events ce ON ce.communication_id = c.id
            WHERE c.campaign_id = :cid
            GROUP BY c.id, c.status
        )
        SELECT
            COUNT(*) FILTER (WHERE lvl >= 1) AS sent,
            COUNT(*) FILTER (WHERE lvl >= 2) AS delivered,
            COUNT(*) FILTER (WHERE lvl >= 3) AS opened,
            COUNT(*) FILTER (WHERE lvl >= 4) AS read,
            COUNT(*) FILTER (WHERE lvl >= 5) AS clicked,
            COUNT(*) FILTER (WHERE failed) AS failed
        FROM levels
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
        SELECT c.id, c.customer_id, cust.name AS customer_name, c.channel, c.variant, c.status,
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
        {"id": str(r.id), "customer_id": str(r.customer_id), "customer_name": r.customer_name,
         "channel": r.channel, "variant": r.variant, "status": r.status,
         "job_status": r.job_status, "attempts": r.attempts}
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
