from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

import uuid

from pydantic import BaseModel

from app.ai.customer_agent import customer_card
from app.config import settings
from app.customer_metrics import engagement_update_sql
from app.database import get_db
from app.personalization import build_context, render
from app.models import Communication, Customer, Order, OutboxJob
from app.schemas import (
    CustomerCardResponse,
    CustomerDetailOut,
    CustomerOrderOut,
    CustomerOut,
    IngestRequest,
    IngestResponse,
)

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("/ingest", response_model=IngestResponse)
async def ingest(body: IngestRequest, db: AsyncSession = Depends(get_db)):
    # Upsert customers
    cust_count = 0
    cust_map: dict[str, str] = {}
    for c in body.customers:
        stmt = (
            insert(Customer)
            .values(
                external_id=c.external_id,
                name=c.name,
                email=c.email,
                phone=c.phone,
                opted_out=c.opted_out,
            )
            .on_conflict_do_update(
                index_elements=["external_id"],
                set_={"name": c.name, "email": c.email, "phone": c.phone, "opted_out": c.opted_out},
            )
            .returning(Customer.id, Customer.external_id)
        )
        result = await db.execute(stmt)
        row = result.fetchone()
        cust_map[c.external_id] = str(row[0])
        cust_count += 1

    # Upsert orders + recalculate customer rollups
    ord_count = 0
    updated_customers: set[str] = set()
    for o in body.orders:
        cid = cust_map.get(o.customer_external_id)
        if not cid:
            # look up in DB
            r = await db.execute(select(Customer.id).where(Customer.external_id == o.customer_external_id))
            row = r.fetchone()
            if not row:
                continue
            cid = str(row[0])

        values: dict = dict(external_id=o.external_id, customer_id=cid, amount=o.amount, status=o.status)
        if o.created_at:
            values["created_at"] = o.created_at

        stmt = (
            insert(Order)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["external_id"])
        )
        result = await db.execute(stmt)
        if result.rowcount:
            ord_count += 1
            updated_customers.add(cid)

    await db.commit()

    # Recalculate rollups for affected customers
    for cid in updated_customers:
        await db.execute(
            text("""
                UPDATE customers SET
                  order_count    = (SELECT COUNT(*) FROM orders WHERE customer_id = :cid),
                  lifetime_spend = (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE customer_id = :cid),
                  last_order_at  = (SELECT MAX(created_at) FROM orders WHERE customer_id = :cid)
                WHERE id = :cid
            """),
            {"cid": cid},
        )
    await db.commit()

    # Recompute engagement scores from the refreshed rollups (RFM blend).
    if updated_customers:
        await db.execute(text(engagement_update_sql()))
        await db.commit()

    return IngestResponse(customers_upserted=cust_count, orders_upserted=ord_count)


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    q: str | None = Query(None, description="Search by name or email (case-insensitive), across all customers"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.email.ilike(like)))
    # Default order surfaces the most valuable/engaged shoppers first (the page is
    # "scored by engagement"), instead of newest-created rows that are mostly zero-spend.
    stmt = stmt.order_by(Customer.engagement_score.desc(), Customer.lifetime_spend.desc())
    result = await db.execute(stmt.limit(limit).offset(offset))
    return result.scalars().all()


def _days_since(last_order_at) -> int | None:
    if not last_order_at:
        return None
    now = datetime.now(timezone.utc)
    return (now - last_order_at.replace(tzinfo=timezone.utc)).days


async def _get_customer(customer_id: str, db: AsyncSession) -> Customer:
    cust = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if not cust:
        raise HTTPException(404, "Customer not found")
    return cust


@router.get("/{customer_id}", response_model=CustomerDetailOut)
async def get_customer(customer_id: str, db: AsyncSession = Depends(get_db)):
    cust = await _get_customer(customer_id, db)
    orders = (await db.execute(
        select(Order).where(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc()).limit(10)
    )).scalars().all()
    return CustomerDetailOut(
        **CustomerOut.model_validate(cust).model_dump(),
        days_since_last=_days_since(cust.last_order_at),
        recent_orders=[CustomerOrderOut.model_validate(o) for o in orders],
    )


@router.get("/{customer_id}/ai-card", response_model=CustomerCardResponse)
async def get_customer_ai_card(customer_id: str, db: AsyncSession = Depends(get_db)):
    """AI Customer Card — summary + churn risk + next-best actions for ONE shopper."""
    cust = await _get_customer(customer_id, db)
    card, meta, valid = await customer_card({
        "name": cust.name,
        "favorite_category": cust.favorite_category,
        "order_count": cust.order_count,
        "lifetime_spend": float(cust.lifetime_spend),
        "days_since_last": _days_since(cust.last_order_at) or 0,
        "engagement_score": cust.engagement_score,
    })
    return CustomerCardResponse(
        summary=card["summary"], churn_risk=card["churn_risk"],
        suggestions=card["suggestions"], provider=meta.get("provider", "unknown"), valid=valid,
    )


@router.get("/{customer_id}/communications")
async def customer_communications(customer_id: str, db: AsyncSession = Depends(get_db)):
    """Every message (campaign + direct) ever sent to this customer, newest first."""
    await _get_customer(customer_id, db)  # 404 if missing
    rows = (await db.execute(text(
        "SELECT c.id, c.channel, c.subject, c.message, c.status, c.variant, c.created_at, "
        "c.campaign_id, ca.name AS campaign_name "
        "FROM communications c LEFT JOIN campaigns ca ON ca.id = c.campaign_id "
        "WHERE c.customer_id = :cid ORDER BY c.created_at DESC"
    ), {"cid": customer_id})).fetchall()
    return [
        {"id": str(r.id), "channel": r.channel, "subject": r.subject, "message": r.message,
         "status": r.status, "variant": r.variant, "created_at": r.created_at,
         "campaign_id": str(r.campaign_id) if r.campaign_id else None,
         "campaign_name": r.campaign_name or ("Direct message" if not r.campaign_id else None)}
        for r in rows
    ]


class DirectMessageRequest(BaseModel):
    channel: str               # email | sms | whatsapp
    subject: str | None = None
    body: str


@router.post("/{customer_id}/message")
async def send_direct_message(
    customer_id: str, body: DirectMessageRequest, db: AsyncSession = Depends(get_db),
):
    """Send a one-off message to a single customer (no campaign). Goes through the outbox→channel."""
    cust = await _get_customer(customer_id, db)
    if cust.opted_out:
        raise HTTPException(400, "Customer has opted out of communications")
    if not body.body.strip():
        raise HTTPException(400, "Message body is required")

    # Fill any {{tokens}} with this customer's real data before queueing (the body is usually
    # already personalized, but this guarantees nothing raw like "{{first_name}}" goes out).
    cust = {"name": cust.name, "last_order_at": cust.last_order_at,
            "favorite_category": cust.favorite_category}
    ctx = build_context(goal=body.body, brand_name=settings.brand_name)
    comm_id = str(uuid.uuid4())
    db.add(Communication(
        id=comm_id, campaign_id=None, customer_id=customer_id,
        channel=body.channel, message=render(body.body, cust, ctx),
        subject=render(body.subject, cust, ctx) if body.channel == "email" else None,
        variant="direct", status="pending",
    ))
    await db.flush()
    db.add(OutboxJob(communication_id=comm_id, status="pending"))
    await db.commit()
    return {"status": "queued", "communication_id": comm_id, "channel": body.channel}
