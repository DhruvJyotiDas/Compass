from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Customer, Order
from app.schemas import CustomerOut, IngestRequest, IngestResponse

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

    return IngestResponse(customers_upserted=cust_count, orders_upserted=ord_count)


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Customer).order_by(Customer.created_at.desc()).limit(limit).offset(offset))
    return result.scalars().all()
