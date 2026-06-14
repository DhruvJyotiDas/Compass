"""Seed a realistic demo CRM: org, users, pipeline, leads, accounts, contacts, deals, activities."""
import random
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.models import (
    Account,
    Activity,
    Contact,
    Deal,
    Lead,
    Note,
    Organization,
    Pipeline,
    Stage,
    Tag,
    TimelineEvent,
    User,
)
from app.routers.auth_router import DEFAULT_STAGES

fake = Faker()

DEMO_EMAIL = "admin@demo.com"
DEMO_PASSWORD = "password"

INDUSTRIES = ["Technology", "Finance", "Healthcare", "Retail", "Manufacturing", "Education", "Real Estate", "Media"]
SOURCES = ["Web", "Referral", "Cold Call", "Event", "Advertisement", "Partner", "Social Media"]
RATINGS = ["hot", "warm", "cold"]
LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified"]
ACCOUNT_TYPES = ["customer", "prospect", "partner", "vendor"]


async def seed_crm(db: AsyncSession, reset: bool = True) -> dict:
    # Idempotent demo: wipe the demo org if it exists
    existing = (await db.execute(select(Organization).where(Organization.name == "Acme Demo Corp"))).scalar_one_or_none()
    if existing and reset:
        oid = existing.id
        for model in (TimelineEvent, Note, Activity, Deal, Contact, Account, Lead, Tag):
            await db.execute(delete(model).where(model.org_id == oid))
        await db.execute(delete(Stage).where(Stage.pipeline_id.in_(select(Pipeline.id).where(Pipeline.org_id == oid))))
        await db.execute(delete(Pipeline).where(Pipeline.org_id == oid))
        await db.execute(delete(User).where(User.org_id == oid))
        await db.execute(delete(Organization).where(Organization.id == oid))
        await db.commit()

    org = Organization(name="Acme Demo Corp")
    db.add(org)
    await db.flush()

    # Users
    admin = User(org_id=org.id, email=DEMO_EMAIL, name="Dana Admin",
                 hashed_password=hash_password(DEMO_PASSWORD), role="admin", title="VP Sales")
    db.add(admin)
    managers = [
        User(org_id=org.id, email=f"manager{i}@demo.com", name=fake.name(),
             hashed_password=hash_password(DEMO_PASSWORD), role="manager", title="Sales Manager")
        for i in range(1, 3)
    ]
    reps = [
        User(org_id=org.id, email=f"rep{i}@demo.com", name=fake.name(),
             hashed_password=hash_password(DEMO_PASSWORD), role="sales_rep", title="Account Executive")
        for i in range(1, 4)
    ]
    for u in managers + reps:
        db.add(u)
    await db.flush()
    all_users = [admin] + managers + reps
    user_ids = [u.id for u in all_users]

    # Pipeline + stages
    pipeline = Pipeline(org_id=org.id, name="Standard Sales Pipeline", is_default=True)
    db.add(pipeline)
    await db.flush()
    stages = []
    for i, (name, prob, typ) in enumerate(DEFAULT_STAGES):
        s = Stage(pipeline_id=pipeline.id, name=name, sort_order=i, probability=prob, type=typ)
        db.add(s)
        stages.append(s)
    await db.flush()
    open_stages = [s for s in stages if s.type == "open"]

    # Tags
    tag_names = [("VIP", "#ef4444"), ("Enterprise", "#6366f1"), ("SMB", "#10b981"),
                 ("Follow-up", "#f59e0b"), ("Churn-risk", "#ec4899")]
    for n, c in tag_names:
        db.add(Tag(org_id=org.id, name=n, color=c))

    def rand_dt(days_back=120):
        return datetime.now(timezone.utc) - timedelta(days=random.randint(0, days_back), hours=random.randint(0, 23))

    # Leads
    leads = []
    for _ in range(200):
        leads.append(Lead(
            org_id=org.id, owner_id=random.choice(user_ids),
            first_name=fake.first_name(), last_name=fake.last_name(),
            company=fake.company(), title=fake.job()[:120], email=fake.email(),
            phone=fake.phone_number()[:32], source=random.choice(SOURCES),
            status=random.choice(LEAD_STATUSES), rating=random.choice(RATINGS),
            score=random.randint(0, 100), industry=random.choice(INDUSTRIES),
            annual_revenue=random.choice([None, 500000, 1000000, 5000000, 25000000]),
            no_of_employees=random.choice([10, 50, 200, 1000, 5000]),
            city=fake.city(), state=fake.state(), country="USA", created_at=rand_dt(),
        ))
    db.add_all(leads)

    # Accounts
    accounts = []
    for _ in range(80):
        accounts.append(Account(
            org_id=org.id, owner_id=random.choice(user_ids),
            name=fake.company(), industry=random.choice(INDUSTRIES),
            website=fake.url(), phone=fake.phone_number()[:32], email=fake.company_email(),
            type=random.choice(ACCOUNT_TYPES),
            annual_revenue=random.choice([1000000, 5000000, 25000000, 100000000]),
            no_of_employees=random.choice([50, 200, 1000, 5000]),
            billing_city=fake.city(), billing_state=fake.state(), billing_country="USA",
            created_at=rand_dt(),
        ))
    db.add_all(accounts)
    await db.flush()

    # Contacts (linked to accounts)
    contacts = []
    for _ in range(150):
        acc = random.choice(accounts)
        contacts.append(Contact(
            org_id=org.id, owner_id=acc.owner_id, account_id=acc.id,
            first_name=fake.first_name(), last_name=fake.last_name(),
            title=fake.job()[:120], department=random.choice(["Sales", "IT", "Finance", "Ops", "Marketing"]),
            email=fake.email(), phone=fake.phone_number()[:32], mobile=fake.phone_number()[:32],
            source=random.choice(SOURCES), mailing_city=fake.city(), created_at=rand_dt(),
        ))
    db.add_all(contacts)
    await db.flush()

    # Deals
    deals = []
    for _ in range(120):
        acc = random.choice(accounts)
        acc_contacts = [c for c in contacts if c.account_id == acc.id]
        roll = random.random()
        if roll < 0.25:
            stage = next(s for s in stages if s.type == "won")
            status, closed = "won", rand_dt(60)
        elif roll < 0.4:
            stage = next(s for s in stages if s.type == "lost")
            status, closed = "lost", rand_dt(60)
        else:
            stage = random.choice(open_stages)
            status, closed = "open", None
        deals.append(Deal(
            org_id=org.id, owner_id=acc.owner_id, name=f"{acc.name} — {random.choice(['Platform', 'Renewal', 'Expansion', 'Pilot'])}",
            account_id=acc.id, contact_id=acc_contacts[0].id if acc_contacts else None,
            pipeline_id=pipeline.id, stage_id=stage.id,
            amount=random.choice([5000, 12000, 25000, 50000, 120000, 250000]),
            probability=stage.probability, source=random.choice(SOURCES),
            type=random.choice(["new_business", "existing_business", "renewal"]),
            status=status, closed_at=closed,
            close_date=datetime.now(timezone.utc) + timedelta(days=random.randint(-30, 90)),
            created_at=rand_dt(),
        ))
    db.add_all(deals)
    await db.flush()

    # Activities
    act_types = ["task", "call", "meeting"]
    for _ in range(300):
        target = random.choice([("deal", deals), ("contact", contacts), ("lead", leads), ("account", accounts)])
        mod, pool = target
        rec = random.choice(pool)
        completed = random.random() < 0.45
        due = datetime.now(timezone.utc) + timedelta(days=random.randint(-15, 20))
        db.add(Activity(
            org_id=org.id, owner_id=getattr(rec, "owner_id", None) or random.choice(user_ids),
            type=random.choice(act_types),
            subject=random.choice(["Follow up", "Discovery call", "Send proposal", "Demo", "Check-in", "Contract review"]),
            status="completed" if completed else "open",
            priority=random.choice(["low", "normal", "high"]),
            due_date=due, completed_at=due if completed else None,
            related_module=mod, related_id=rec.id, created_at=rand_dt(),
        ))

    await db.commit()
    return {
        "org": org.name,
        "login": {"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        "users": len(all_users),
        "leads": len(leads),
        "accounts": len(accounts),
        "contacts": len(contacts),
        "deals": len(deals),
        "activities": 300,
    }
