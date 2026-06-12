"""
Seed generator: 5,000 customers + 25,000 orders with realistic Indian D2C distributions.
Run via: python -m app.seed.generate
Or via API: POST /admin/seed
"""
import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from app.database import AsyncSessionLocal
from app.models import Customer, Order

fake = Faker("en_IN")
random.seed(42)

TOTAL_CUSTOMERS = 5000
TOTAL_ORDERS = 25000

# Indian first/last names for authenticity
FIRST_NAMES = [
    "Aarav", "Diya", "Vihaan", "Ananya", "Kabir", "Saanvi", "Reyansh", "Ishaan", "Myra", "Aditya",
    "Arjun", "Priya", "Rohan", "Sneha", "Karan", "Pooja", "Vikram", "Nisha", "Rahul", "Anjali",
    "Siddharth", "Meera", "Nikhil", "Deepika", "Ravi", "Kavya", "Suresh", "Lakshmi", "Amit", "Sunita",
    "Aryan", "Kritika", "Mohit", "Divya", "Varun", "Ritika", "Sachin", "Neha", "Tarun", "Shweta",
    "Gaurav", "Preeti", "Harsh", "Rekha", "Manish", "Geeta", "Tushar", "Babita", "Vikas", "Sonal",
]
LAST_NAMES = [
    "Sharma", "Patel", "Gupta", "Singh", "Kumar", "Verma", "Iyer", "Reddy", "Nair", "Joshi",
    "Mehta", "Shah", "Rao", "Mishra", "Tiwari", "Pandey", "Malhotra", "Kapoor", "Bose", "Das",
    "Chaudhary", "Pillai", "Menon", "Rajan", "Krishnan", "Subramaniam", "Agarwal", "Bansal", "Jain", "Garg",
]

NOW = datetime.now(timezone.utc)


def _random_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _random_email(name: str) -> str:
    parts = name.lower().split()
    domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]
    return f"{parts[0]}.{parts[1]}{random.randint(1, 999)}@{random.choice(domains)}"


def _random_phone() -> str:
    return f"+91 {random.randint(70000, 99999)} {random.randint(10000, 99999)}"


def _customer_tier() -> str:
    """Returns: high (20%), mid (60%), low (20%)"""
    r = random.random()
    if r < 0.20:
        return "high"
    elif r < 0.80:
        return "mid"
    return "low"


def _last_order_days_ago(tier: str) -> int | None:
    """Shape distributions so segments are non-empty."""
    r = random.random()
    if tier == "high":
        # High-value: mostly recent, 15% inactive >60 days
        if r < 0.15:
            return random.randint(61, 365)
        return random.randint(1, 60)
    elif tier == "mid":
        # Mid: 30% inactive >60 days
        if r < 0.30:
            return random.randint(61, 500)
        return random.randint(1, 90)
    else:
        # Low: 60% inactive >60 days, 5% never ordered
        if r < 0.05:
            return None
        if r < 0.65:
            return random.randint(61, 730)
        return random.randint(1, 120)


def _order_amount(tier: str) -> float:
    if tier == "high":
        return round(random.uniform(1500, 8000), 2)
    elif tier == "mid":
        return round(random.uniform(500, 3000), 2)
    return round(random.uniform(200, 1200), 2)


def _order_count_for_tier(tier: str) -> int:
    if tier == "high":
        return random.randint(3, 15)
    elif tier == "mid":
        return random.randint(1, 6)
    return random.randint(0, 3)


async def seed(db=None):
    close_db = db is None
    if db is None:
        db = AsyncSessionLocal()

    print("Seeding 5,000 customers…")
    customers = []
    for i in range(TOTAL_CUSTOMERS):
        tier = _customer_tier()
        name = _random_name()
        opted_out = random.random() < 0.03  # 3%
        days_ago = _last_order_days_ago(tier)
        last_order_at = (NOW - timedelta(days=days_ago)) if days_ago is not None else None

        customers.append({
            "external_id": f"cust_{i+1:05d}",
            "name": name,
            "email": _random_email(name),
            "phone": _random_phone(),
            "opted_out": opted_out,
            "_tier": tier,
            "_last_order_at": last_order_at,
        })

    # Batch upsert customers
    for chunk_start in range(0, len(customers), 500):
        chunk = customers[chunk_start:chunk_start + 500]
        stmt = insert(Customer).values([
            {k: v for k, v in c.items() if not k.startswith("_")}
            for c in chunk
        ]).on_conflict_do_nothing(index_elements=["external_id"])
        await db.execute(stmt)
    await db.commit()

    # Fetch customer ids
    from sqlalchemy import select
    result = await db.execute(select(Customer.id, Customer.external_id))
    id_map = {row.external_id: str(row.id) for row in result.fetchall()}

    print("Seeding 25,000 orders…")
    order_records = []
    order_idx = 1

    for i, cust in enumerate(customers):
        tier = cust["_tier"]
        n_orders = _order_count_for_tier(tier)
        if cust["_last_order_at"] is None:
            n_orders = 0

        cust_id = id_map.get(cust["external_id"])
        if not cust_id:
            continue

        for j in range(n_orders):
            if order_idx > TOTAL_ORDERS:
                break
            # Space orders across past 2 years, most recent = last_order_at
            if cust["_last_order_at"] and j == 0:
                order_date = cust["_last_order_at"]
            elif cust["_last_order_at"]:
                days_back = random.randint(1, 730)
                order_date = cust["_last_order_at"] - timedelta(days=days_back)
                order_date = max(order_date, NOW - timedelta(days=730))
            else:
                continue

            order_records.append({
                "external_id": f"ord_{order_idx:06d}",
                "customer_id": cust_id,
                "amount": _order_amount(tier),
                "status": "completed",
                "created_at": order_date,
            })
            order_idx += 1
        if order_idx > TOTAL_ORDERS:
            break

    for chunk_start in range(0, len(order_records), 1000):
        chunk = order_records[chunk_start:chunk_start + 1000]
        stmt = insert(Order).values(chunk).on_conflict_do_nothing(index_elements=["external_id"])
        await db.execute(stmt)
    await db.commit()

    # Recalculate rollups
    print("Recalculating customer rollups…")
    await db.execute(text("""
        UPDATE customers c SET
            order_count    = sub.cnt,
            lifetime_spend = sub.total,
            last_order_at  = sub.latest
        FROM (
            SELECT customer_id,
                   COUNT(*) AS cnt,
                   SUM(amount) AS total,
                   MAX(created_at) AS latest
            FROM orders
            GROUP BY customer_id
        ) sub
        WHERE c.id = sub.customer_id
    """))
    await db.commit()

    # Count results
    from sqlalchemy import func, select as sel
    cust_count = (await db.execute(sel(func.count()).select_from(Customer))).scalar()
    ord_count = (await db.execute(sel(func.count()).select_from(Order))).scalar()
    print(f"Done. {cust_count} customers, {ord_count} orders.")

    if close_db:
        await db.close()

    return {"customers": cust_count, "orders": ord_count}


if __name__ == "__main__":
    asyncio.run(seed())
