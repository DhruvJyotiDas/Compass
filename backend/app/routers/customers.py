from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.customer_agent import customer_card
from app.customer_metrics import engagement_update_sql
from app.database import get_db
from app.models import Customer, Order
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
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Customer).order_by(Customer.created_at.desc()).limit(limit).offset(offset))
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
