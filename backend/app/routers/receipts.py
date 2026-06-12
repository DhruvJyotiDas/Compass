"""Receipt API — idempotent HMAC-signed callback ingestion from channel service."""
import asyncio
import hashlib
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models import EVENT_RANK, Communication, CommunicationEvent
from app.routers.events import broadcast
from app.schemas import ReceiptPayload

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/receipts", tags=["receipts"])

# Track duplicate rejections per campaign in memory for the chaos panel
_dup_counter: dict[str, int] = {}


def _verify_hmac(body: bytes, signature: str) -> bool:
    expected = hmac.new(
        settings.channel_hmac_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    try:
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


@router.post("")
@limiter.limit("500/minute")
async def ingest_receipt(
    request: Request,
    x_signature: str = Header(..., alias="X-Signature"),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()

    if not _verify_hmac(body, x_signature):
        raise HTTPException(401, "Invalid HMAC signature")

    payload = ReceiptPayload.model_validate_json(body)

    # Replay protection: reject callbacks with timestamps older than configured max age
    if payload.timestamp is not None:
        age_seconds = (datetime.now(timezone.utc) - payload.timestamp).total_seconds()
        if age_seconds > settings.hmac_max_age_seconds:
            raise HTTPException(401, "Callback timestamp expired (replay protection)")

    # Fetch communication + campaign
    result = await db.execute(
        select(Communication).where(Communication.id == payload.communication_id)
    )
    comm = result.scalar_one_or_none()
    if not comm:
        raise HTTPException(404, "Communication not found")

    campaign_id = str(comm.campaign_id)

    # Idempotent insert — ON CONFLICT DO NOTHING
    stmt = (
        insert(CommunicationEvent)
        .values(
            communication_id=payload.communication_id,
            event_type=payload.event_type,
            channel_msg_id=payload.channel_msg_id,
            received_at=payload.timestamp or datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(constraint="uq_event_comm_type")
        .returning(CommunicationEvent.id)
    )
    result = await db.execute(stmt)
    inserted = result.fetchone()

    if not inserted:
        # Duplicate — track for chaos panel
        _dup_counter[campaign_id] = _dup_counter.get(campaign_id, 0) + 1
        await db.rollback()
        # Still broadcast duplicate event to chaos panel
        await broadcast(campaign_id, "dup_rejected", {
            "communication_id": payload.communication_id,
            "event_type": payload.event_type,
            "dup_count": _dup_counter.get(campaign_id, 0),
        })
        return {"status": "duplicate_rejected", "dup_count": _dup_counter.get(campaign_id, 0)}

    # Update communication status by precedence rank
    new_rank = EVENT_RANK.get(payload.event_type, 0)
    current_rank = EVENT_RANK.get(comm.status, 0)

    if payload.event_type == "failed":
        if comm.status == "pending":
            comm.status = "failed"
    elif new_rank > current_rank:
        comm.status = payload.event_type

    await db.commit()

    # Attribution: if clicked, check for orders within 72h (fresh session — request session closes when handler returns)
    if payload.event_type == "clicked":
        click_at = payload.timestamp or datetime.now(timezone.utc)
        asyncio.create_task(_attribute_orders(str(comm.id), str(comm.customer_id), click_at))

    # Broadcast to SSE subscribers
    from app.models import Customer
    cust_result = await db.execute(select(Customer.name).where(Customer.id == comm.customer_id))
    cust_name = cust_result.scalar_one_or_none() or "Customer"

    await broadcast(campaign_id, "event", {
        "communication_id": str(comm.id),
        "event_type": payload.event_type,
        "customer_name": cust_name,
        "channel": comm.channel,
        "timestamp": (payload.timestamp or datetime.now(timezone.utc)).isoformat(),
        "variant": comm.variant,
    })

    return {"status": "ok", "event_type": payload.event_type}


async def _attribute_orders(comm_id: str, customer_id: str, click_at: datetime) -> None:
    """Mark orders placed AFTER click and within 72h as attributed to this communication.

    Uses a fresh session — the request-scoped session is closed by the time this runs.
    """
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    UPDATE orders SET attributed_communication_id = :comm_id
                    WHERE customer_id = :cid
                      AND attributed_communication_id IS NULL
                      AND created_at >= :click_at
                      AND created_at <= :click_at + INTERVAL '72 hours'
                """),
                {"comm_id": comm_id, "cid": customer_id, "click_at": click_at},
            )
            await db.commit()
    except Exception:
        pass
