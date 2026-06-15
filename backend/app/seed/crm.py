"""Seed a realistic demo CRM: org, users, pipeline, leads, accounts, contacts, deals, activities."""
import random
import uuid
from datetime import datetime, timedelta, timezone

from faker import Faker
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.models import (
    Account,
    Activity,
    Case,
    Contact,
    CustomField,
    Deal,
    Invoice,
    Lead,
    Note,
    Organization,
    Pipeline,
    PriceBook,
    PriceBookItem,
    Product,
    PurchaseOrder,
    Quote,
    SalesOrder,
    SLAPolicy,
    Solution,
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
        await db.execute(delete(PriceBookItem).where(
            PriceBookItem.price_book_id.in_(select(PriceBook.id).where(PriceBook.org_id == oid))))
        for model in (
            TimelineEvent, Note, Activity,
            Invoice, SalesOrder, Quote, PurchaseOrder, PriceBook, Product,
            Case, Solution, SLAPolicy,
            Deal, Contact, Account, Lead, Tag,
        ):
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

    await db.flush()

    # ── P2 — Catalog: Products + a default Price Book ──────────────────────────
    PRODUCTS = [
        ("Compass CRM — Starter", "CRM-STR", "Software", 49, 18),
        ("Compass CRM — Professional", "CRM-PRO", "Software", 99, 18),
        ("Compass CRM — Enterprise", "CRM-ENT", "Software", 199, 18),
        ("Onboarding & Setup", "SVC-ONB", "Services", 2500, 18),
        ("Premium Support (Annual)", "SVC-SUP", "Services", 6000, 18),
        ("Data Migration", "SVC-MIG", "Services", 3500, 18),
        ("Analytics Add-on", "ADD-ANL", "Add-on", 39, 18),
        ("AI Growth Assistant Seat", "ADD-AI", "Add-on", 79, 18),
        ("API Access Tier", "ADD-API", "Add-on", 149, 18),
        ("Training Workshop (per day)", "SVC-TRN", "Services", 1800, 18),
    ]
    products = [
        Product(org_id=org.id, name=n, code=c, category=cat, unit_price=price,
                tax_rate=tax, currency="USD", is_active=True, description=f"{n} — billed per month unless noted.")
        for n, c, cat, price, tax in PRODUCTS
    ]
    db.add_all(products)
    await db.flush()

    price_book = PriceBook(org_id=org.id, name="Standard Price Book", is_default=True,
                           is_active=True, description="Default list pricing for all products.")
    db.add(price_book)
    await db.flush()
    for p in products:
        db.add(PriceBookItem(price_book_id=price_book.id, product_id=p.id, price=p.unit_price))

    # Helper: build line items + totals from a random selection of products.
    def build_doc(n_lines=None):
        chosen = random.sample(products, n_lines or random.randint(1, 4))
        items, subtotal = [], 0.0
        for p in chosen:
            qty = random.randint(1, 12)
            unit = float(p.unit_price)
            disc = random.choice([0, 0, 0, 5, 10])
            line_total = round(qty * unit * (1 - disc / 100), 2)
            subtotal += line_total
            items.append({
                "id": uuid.uuid4().hex, "product_id": p.id, "name": p.name,
                "description": p.category, "qty": qty, "unit_price": unit,
                "discount_pct": disc, "total": line_total,
            })
        tax_pct = 18.0
        total = round(subtotal * (1 + tax_pct / 100), 2)
        return items, round(subtotal, 2), tax_pct, total

    accounts_with_contacts = [a for a in accounts if any(c.account_id == a.id for c in contacts)]

    def addr_for(acc):
        return {"billing_city": acc.billing_city, "billing_country": "USA"}

    # ── P2 — Quotes ────────────────────────────────────────────────────────────
    quotes = []
    for i in range(40):
        acc = random.choice(accounts_with_contacts)
        ct = next((c for c in contacts if c.account_id == acc.id), None)
        items, subtotal, tax_pct, total = build_doc()
        created = rand_dt(120)
        quotes.append(Quote(
            org_id=org.id, owner_id=acc.owner_id, quote_number=f"QT-{1001 + i}",
            subject=f"{acc.name} — {random.choice(['New Subscription', 'Renewal', 'Expansion', 'Pilot'])}",
            account_id=acc.id, contact_id=ct.id if ct else None,
            status=random.choice(["draft", "sent", "sent", "accepted", "accepted", "declined", "expired"]),
            valid_until=created + timedelta(days=30),
            line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
            payment_terms="Net 30", created_at=created, **addr_for(acc),
        ))
    db.add_all(quotes)
    await db.flush()

    # ── P2 — Sales Orders (some converted from accepted quotes) ────────────────
    sales_orders = []
    for i in range(35):
        acc = random.choice(accounts_with_contacts)
        ct = next((c for c in contacts if c.account_id == acc.id), None)
        q = next((q for q in quotes if q.account_id == acc.id and q.status == "accepted"), None)
        items, subtotal, tax_pct, total = build_doc()
        created = rand_dt(100)
        sales_orders.append(SalesOrder(
            org_id=org.id, owner_id=acc.owner_id, so_number=f"SO-{2001 + i}",
            subject=f"{acc.name} — Order", account_id=acc.id, contact_id=ct.id if ct else None,
            quote_id=q.id if q else None,
            status=random.choice(["pending", "confirmed", "confirmed", "shipped", "delivered", "delivered"]),
            expected_ship_date=created + timedelta(days=random.randint(3, 21)),
            line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
            payment_terms="Net 30", created_at=created, **addr_for(acc),
        ))
    db.add_all(sales_orders)
    await db.flush()

    # ── P2 — Invoices (some from sales orders) ─────────────────────────────────
    invoices = []
    for i in range(45):
        so = random.choice(sales_orders)
        created = so.created_at + timedelta(days=random.randint(0, 10))
        status = random.choice(["draft", "sent", "sent", "paid", "paid", "paid", "overdue", "void"])
        invoices.append(Invoice(
            org_id=org.id, owner_id=so.owner_id, invoice_number=f"INV-{3001 + i}",
            subject=f"Invoice for {so.subject}", account_id=so.account_id, contact_id=so.contact_id,
            sales_order_id=so.id, status=status,
            due_date=created + timedelta(days=30), payment_terms="Net 30",
            line_items=so.line_items, subtotal=so.subtotal, tax_pct=so.tax_pct,
            total=so.total, currency="USD", created_at=created,
            billing_city=so.billing_city, billing_country="USA",
        ))
    db.add_all(invoices)

    # ── P2 — Purchase Orders (vendor side) ─────────────────────────────────────
    VENDORS = ["CloudHost Inc", "Acme Hardware", "Brightline Marketing", "DataStream Co",
               "OfficeWorks", "SecureNet Ltd", "PixelForge Studios", "LogiShip Freight"]
    purchase_orders = []
    for i in range(20):
        items, subtotal, tax_pct, total = build_doc(random.randint(1, 3))
        vendor = random.choice(VENDORS)
        created = rand_dt(90)
        purchase_orders.append(PurchaseOrder(
            org_id=org.id, owner_id=random.choice(user_ids), po_number=f"PO-{4001 + i}",
            subject=f"{vendor} — Procurement", vendor_name=vendor,
            vendor_email=f"sales@{vendor.split()[0].lower()}.com",
            status=random.choice(["draft", "sent", "sent", "received", "received", "billed", "cancelled"]),
            expected_delivery=created + timedelta(days=random.randint(5, 30)),
            line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
            payment_terms="Net 45", delivery_city=fake.city(), delivery_country="USA",
            created_at=created,
        ))
    db.add_all(purchase_orders)

    # ── P3 — Support: SLA policy, Cases, Solutions ─────────────────────────────
    sla = SLAPolicy(org_id=org.id, name="Standard SLA", is_default=True, is_active=True,
                    description="Default response/resolution targets by priority.")
    db.add(sla)
    await db.flush()

    CASE_SUBJECTS = [
        "Login fails after password reset", "Export to CSV times out", "Webhook not firing on deal won",
        "Billing charged twice this month", "Need help importing contacts", "Dashboard charts not loading",
        "API rate limit too low", "Email templates not saving", "Mobile app crashes on launch",
        "Request: bulk-edit for leads", "SSO with Okta setup", "Duplicate records after import",
    ]
    cases = []
    for i in range(60):
        acc = random.choice(accounts_with_contacts)
        ct = next((c for c in contacts if c.account_id == acc.id), None)
        status = random.choice(["new", "open", "open", "pending_customer", "on_hold", "closed", "closed"])
        priority = random.choice(["low", "medium", "medium", "high", "critical"])
        created = rand_dt(90)
        closed = (created + timedelta(days=random.randint(1, 14))) if status == "closed" else None
        cases.append(Case(
            org_id=org.id, owner_id=acc.owner_id, case_number=f"CASE-{5001 + i}",
            subject=random.choice(CASE_SUBJECTS),
            description=fake.paragraph(nb_sentences=3),
            account_id=acc.id, contact_id=ct.id if ct else None,
            status=status, priority=priority,
            type=random.choice(["question", "problem", "feature_request", "other"]),
            source=random.choice(["email", "phone", "web", "chat"]),
            sla_policy_id=sla.id, resolution="Resolved — see notes." if status == "closed" else None,
            closed_at=closed, created_at=created,
        ))
    db.add_all(cases)

    SOLUTIONS = [
        ("How to reset your password", "Knowledge Base"),
        ("Importing leads from a CSV file", "Onboarding"),
        ("Setting up email templates", "Marketing"),
        ("Configuring SSO with Okta", "Security"),
        ("Understanding deal pipelines and stages", "Sales"),
        ("Troubleshooting webhook delivery", "Integrations"),
        ("Exporting reports and analytics", "Reporting"),
        ("Managing user roles and permissions", "Admin"),
    ]
    for title, cat in SOLUTIONS:
        db.add(Solution(
            org_id=org.id, author_id=admin.id, title=title, category=cat,
            body=fake.paragraph(nb_sentences=6), status="published",
            views=random.randint(20, 800), helpful_votes=random.randint(0, 120),
            created_at=rand_dt(180),
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
        "products": len(products),
        "quotes": len(quotes),
        "sales_orders": len(sales_orders),
        "invoices": len(invoices),
        "purchase_orders": len(purchase_orders),
        "cases": len(cases),
        "solutions": len(SOLUTIONS),
    }


async def seed_crm_modules(db: AsyncSession) -> dict:
    """Idempotently populate the catalog / sales / support / data-tools modules for the
    EXISTING demo org, reusing its real accounts & contacts. Unlike `seed_crm`, this does
    NOT wipe or recreate leads/deals/accounts/contacts — it only fills modules that are
    still empty (products, price books, quotes, sales orders, invoices, purchase orders,
    cases, knowledge base, plus a few custom fields). Safe to run repeatedly.
    """
    org = (await db.execute(
        select(Organization).where(Organization.name == "Acme Demo Corp")
    )).scalar_one_or_none()
    if org is None:
        raise ValueError("Demo org 'Acme Demo Corp' not found — run /admin/seed-crm first.")
    oid = org.id

    users = (await db.execute(select(User).where(User.org_id == oid))).scalars().all()
    if not users:
        raise ValueError("Demo org has no users.")
    admin = next((u for u in users if u.email == DEMO_EMAIL), users[0])
    user_ids = [u.id for u in users]

    accounts = (await db.execute(select(Account).where(Account.org_id == oid))).scalars().all()
    contacts = (await db.execute(select(Contact).where(Contact.org_id == oid))).scalars().all()
    if not accounts:
        raise ValueError("Demo org has no accounts to attach catalog records to.")
    accounts_with_contacts = [a for a in accounts if any(c.account_id == a.id for c in contacts)] or accounts

    async def count(model) -> int:
        return (await db.execute(
            select(func.count()).select_from(model).where(model.org_id == oid)
        )).scalar_one()

    def rand_dt(days_back=120):
        return datetime.now(timezone.utc) - timedelta(days=random.randint(0, days_back), hours=random.randint(0, 23))

    def addr_for(acc):
        return {"billing_city": acc.billing_city, "billing_country": "USA"}

    created: dict[str, int] = {}

    # ── Catalog: Products + default Price Book ──────────────────────────────────
    products = (await db.execute(select(Product).where(Product.org_id == oid))).scalars().all()
    if not products:
        PRODUCTS = [
            ("Compass CRM — Starter", "CRM-STR", "Software", 49, 18),
            ("Compass CRM — Professional", "CRM-PRO", "Software", 99, 18),
            ("Compass CRM — Enterprise", "CRM-ENT", "Software", 199, 18),
            ("Onboarding & Setup", "SVC-ONB", "Services", 2500, 18),
            ("Premium Support (Annual)", "SVC-SUP", "Services", 6000, 18),
            ("Data Migration", "SVC-MIG", "Services", 3500, 18),
            ("Analytics Add-on", "ADD-ANL", "Add-on", 39, 18),
            ("AI Growth Assistant Seat", "ADD-AI", "Add-on", 79, 18),
            ("API Access Tier", "ADD-API", "Add-on", 149, 18),
            ("Training Workshop (per day)", "SVC-TRN", "Services", 1800, 18),
        ]
        products = [
            Product(org_id=oid, name=n, code=c, category=cat, unit_price=price,
                    tax_rate=tax, currency="USD", is_active=True,
                    description=f"{n} — billed per month unless noted.")
            for n, c, cat, price, tax in PRODUCTS
        ]
        db.add_all(products)
        await db.flush()
        created["products"] = len(products)

    if await count(PriceBook) == 0:
        price_book = PriceBook(org_id=oid, name="Standard Price Book", is_default=True,
                               is_active=True, description="Default list pricing for all products.")
        db.add(price_book)
        await db.flush()
        for p in products:
            db.add(PriceBookItem(price_book_id=price_book.id, product_id=p.id, price=p.unit_price))
        created["price_books"] = 1

    def build_doc(n_lines=None):
        chosen = random.sample(products, min(n_lines or random.randint(1, 4), len(products)))
        items, subtotal = [], 0.0
        for p in chosen:
            qty = random.randint(1, 12)
            unit = float(p.unit_price)
            disc = random.choice([0, 0, 0, 5, 10])
            line_total = round(qty * unit * (1 - disc / 100), 2)
            subtotal += line_total
            items.append({
                "id": uuid.uuid4().hex, "product_id": p.id, "name": p.name,
                "description": p.category, "qty": qty, "unit_price": unit,
                "discount_pct": disc, "total": line_total,
            })
        tax_pct = 18.0
        total = round(subtotal * (1 + tax_pct / 100), 2)
        return items, round(subtotal, 2), tax_pct, total

    # ── Quotes ──────────────────────────────────────────────────────────────────
    quotes = (await db.execute(select(Quote).where(Quote.org_id == oid))).scalars().all()
    if not quotes:
        quotes = []
        for i in range(40):
            acc = random.choice(accounts_with_contacts)
            ct = next((c for c in contacts if c.account_id == acc.id), None)
            items, subtotal, tax_pct, total = build_doc()
            cdt = rand_dt(120)
            quotes.append(Quote(
                org_id=oid, owner_id=acc.owner_id, quote_number=f"QT-{1001 + i}",
                subject=f"{acc.name} — {random.choice(['New Subscription', 'Renewal', 'Expansion', 'Pilot'])}",
                account_id=acc.id, contact_id=ct.id if ct else None,
                status=random.choice(["draft", "sent", "sent", "accepted", "accepted", "declined", "expired"]),
                valid_until=cdt + timedelta(days=30),
                line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
                payment_terms="Net 30", created_at=cdt, **addr_for(acc),
            ))
        db.add_all(quotes)
        await db.flush()
        created["quotes"] = len(quotes)

    # ── Sales Orders (some converted from accepted quotes) ──────────────────────
    sales_orders = (await db.execute(select(SalesOrder).where(SalesOrder.org_id == oid))).scalars().all()
    if not sales_orders:
        sales_orders = []
        for i in range(35):
            acc = random.choice(accounts_with_contacts)
            ct = next((c for c in contacts if c.account_id == acc.id), None)
            q = next((q for q in quotes if q.account_id == acc.id and q.status == "accepted"), None)
            items, subtotal, tax_pct, total = build_doc()
            cdt = rand_dt(100)
            sales_orders.append(SalesOrder(
                org_id=oid, owner_id=acc.owner_id, so_number=f"SO-{2001 + i}",
                subject=f"{acc.name} — Order", account_id=acc.id, contact_id=ct.id if ct else None,
                quote_id=q.id if q else None,
                status=random.choice(["pending", "confirmed", "confirmed", "shipped", "delivered", "delivered"]),
                expected_ship_date=cdt + timedelta(days=random.randint(3, 21)),
                line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
                payment_terms="Net 30", created_at=cdt, **addr_for(acc),
            ))
        db.add_all(sales_orders)
        await db.flush()
        created["sales_orders"] = len(sales_orders)

    # ── Invoices (some from sales orders) ───────────────────────────────────────
    if await count(Invoice) == 0 and sales_orders:
        invoices = []
        for i in range(45):
            so = random.choice(sales_orders)
            cdt = so.created_at + timedelta(days=random.randint(0, 10))
            status = random.choice(["draft", "sent", "sent", "paid", "paid", "paid", "overdue", "void"])
            invoices.append(Invoice(
                org_id=oid, owner_id=so.owner_id, invoice_number=f"INV-{3001 + i}",
                subject=f"Invoice for {so.subject}", account_id=so.account_id, contact_id=so.contact_id,
                sales_order_id=so.id, status=status,
                due_date=cdt + timedelta(days=30), payment_terms="Net 30",
                line_items=so.line_items, subtotal=so.subtotal, tax_pct=so.tax_pct,
                total=so.total, currency="USD", created_at=cdt,
                billing_city=so.billing_city, billing_country="USA",
            ))
        db.add_all(invoices)
        created["invoices"] = len(invoices)

    # ── Purchase Orders (vendor side) ───────────────────────────────────────────
    if await count(PurchaseOrder) == 0:
        VENDORS = ["CloudHost Inc", "Acme Hardware", "Brightline Marketing", "DataStream Co",
                   "OfficeWorks", "SecureNet Ltd", "PixelForge Studios", "LogiShip Freight"]
        purchase_orders = []
        for i in range(20):
            items, subtotal, tax_pct, total = build_doc(random.randint(1, 3))
            vendor = random.choice(VENDORS)
            cdt = rand_dt(90)
            purchase_orders.append(PurchaseOrder(
                org_id=oid, owner_id=random.choice(user_ids), po_number=f"PO-{4001 + i}",
                subject=f"{vendor} — Procurement", vendor_name=vendor,
                vendor_email=f"sales@{vendor.split()[0].lower()}.com",
                status=random.choice(["draft", "sent", "sent", "received", "received", "billed", "cancelled"]),
                expected_delivery=cdt + timedelta(days=random.randint(5, 30)),
                line_items=items, subtotal=subtotal, tax_pct=tax_pct, total=total, currency="USD",
                payment_terms="Net 45", delivery_city=fake.city(), delivery_country="USA",
                created_at=cdt,
            ))
        db.add_all(purchase_orders)
        created["purchase_orders"] = len(purchase_orders)

    # ── Support: SLA policy + Cases ─────────────────────────────────────────────
    sla = (await db.execute(select(SLAPolicy).where(SLAPolicy.org_id == oid))).scalars().first()
    if sla is None:
        sla = SLAPolicy(org_id=oid, name="Standard SLA", is_default=True, is_active=True,
                        description="Default response/resolution targets by priority.")
        db.add(sla)
        await db.flush()
        created["sla_policies"] = 1

    if await count(Case) == 0:
        CASE_SUBJECTS = [
            "Login fails after password reset", "Export to CSV times out", "Webhook not firing on deal won",
            "Billing charged twice this month", "Need help importing contacts", "Dashboard charts not loading",
            "API rate limit too low", "Email templates not saving", "Mobile app crashes on launch",
            "Request: bulk-edit for leads", "SSO with Okta setup", "Duplicate records after import",
        ]
        cases = []
        for i in range(60):
            acc = random.choice(accounts_with_contacts)
            ct = next((c for c in contacts if c.account_id == acc.id), None)
            status = random.choice(["new", "open", "open", "pending_customer", "on_hold", "closed", "closed"])
            priority = random.choice(["low", "medium", "medium", "high", "critical"])
            cdt = rand_dt(90)
            closed = (cdt + timedelta(days=random.randint(1, 14))) if status == "closed" else None
            cases.append(Case(
                org_id=oid, owner_id=acc.owner_id, case_number=f"CASE-{5001 + i}",
                subject=random.choice(CASE_SUBJECTS),
                description=fake.paragraph(nb_sentences=3),
                account_id=acc.id, contact_id=ct.id if ct else None,
                status=status, priority=priority,
                type=random.choice(["question", "problem", "feature_request", "other"]),
                source=random.choice(["email", "phone", "web", "chat"]),
                sla_policy_id=sla.id, resolution="Resolved — see notes." if status == "closed" else None,
                closed_at=closed, created_at=cdt,
            ))
        db.add_all(cases)
        created["cases"] = len(cases)

    # ── Knowledge Base (Solutions) ──────────────────────────────────────────────
    if await count(Solution) == 0:
        SOLUTIONS = [
            ("How to reset your password", "Knowledge Base"),
            ("Importing leads from a CSV file", "Onboarding"),
            ("Setting up email templates", "Marketing"),
            ("Configuring SSO with Okta", "Security"),
            ("Understanding deal pipelines and stages", "Sales"),
            ("Troubleshooting webhook delivery", "Integrations"),
            ("Exporting reports and analytics", "Reporting"),
            ("Managing user roles and permissions", "Admin"),
        ]
        for title, cat in SOLUTIONS:
            db.add(Solution(
                org_id=oid, author_id=admin.id, title=title, category=cat,
                body=fake.paragraph(nb_sentences=6), status="published",
                views=random.randint(20, 800), helpful_votes=random.randint(0, 120),
                created_at=rand_dt(180),
            ))
        created["solutions"] = len(SOLUTIONS)

    # ── Data Tools: a few custom fields so the module isn't bare ─────────────────
    EXTRA_FIELDS = [
        ("lead", "budget", "Budget (USD)", "number", []),
        ("lead", "timeframe", "Buying Timeframe", "select", ["This quarter", "Next quarter", "This year", "Unsure"]),
        ("account", "renewal_date", "Renewal Date", "date", []),
        ("account", "tier", "Account Tier", "select", ["Bronze", "Silver", "Gold", "Platinum"]),
        ("contact", "linkedin", "LinkedIn URL", "url", []),
        ("deal", "competitor", "Primary Competitor", "text", []),
        ("case", "severity", "Customer Severity", "select", ["Minor", "Major", "Blocker"]),
    ]
    existing_fields = {
        (cf.module, cf.field_key)
        for cf in (await db.execute(select(CustomField).where(CustomField.org_id == oid))).scalars().all()
    }
    added_fields = 0
    for idx, (module, key, label, ftype, opts) in enumerate(EXTRA_FIELDS):
        if (module, key) in existing_fields:
            continue
        db.add(CustomField(org_id=oid, module=module, field_key=key, label=label,
                           field_type=ftype, options=opts, is_required=False,
                           is_active=True, sort_order=idx))
        added_fields += 1
    if added_fields:
        created["custom_fields"] = added_fields

    await db.commit()
    return {"org": org.name, "seeded": created or "nothing new — all modules already populated"}
