import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid():
    return str(uuid.uuid4())


class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    external_id = Column(String(128), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=False)
    email = Column(String(256))
    phone = Column(String(32))
    last_order_at = Column(DateTime(timezone=True))
    order_count = Column(Integer, default=0, nullable=False)
    lifetime_spend = Column(Numeric(12, 2), default=0, nullable=False)
    # ── Customer intelligence (AI engagement layer) ──
    favorite_category = Column(String(64))
    engagement_score = Column(Integer, default=0, nullable=False)  # 0–100 RFM blend
    opted_out = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    orders = relationship("Order", back_populates="customer")
    communications = relationship("Communication", back_populates="customer")


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    external_id = Column(String(128), unique=True, nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=False), ForeignKey("customers.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(String(32), default="completed")
    attributed_communication_id = Column(UUID(as_uuid=False), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Customer", back_populates="orders")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(256))
    goal_text = Column(Text, nullable=False)
    intent = Column(JSONB)
    segment_dsl = Column(JSONB)
    plan = Column(JSONB)
    message_variants = Column(JSONB)
    insights = Column(JSONB)
    status = Column(String(32), default="draft")  # draft|approved|running|completed
    audience_count = Column(Integer)
    pipeline_id = Column(UUID(as_uuid=False))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    communications = relationship("Communication", back_populates="campaign")
    ai_runs = relationship("AIRun", back_populates="campaign")


class Communication(Base):
    __tablename__ = "communications"
    __table_args__ = (UniqueConstraint("campaign_id", "customer_id", name="uq_comm_campaign_customer"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=True)  # null = direct 1:1 message
    customer_id = Column(UUID(as_uuid=False), ForeignKey("customers.id"), nullable=False)
    channel = Column(String(32), nullable=False)  # whatsapp|email|sms
    message = Column(Text)
    subject = Column(String(512))
    variant = Column(String(64))  # variant id from the plan, e.g. "A" or "email_vip_offer"
    status = Column(String(32), default="pending")  # pending|sent|delivered|opened|read|clicked|failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    campaign = relationship("Campaign", back_populates="communications")
    customer = relationship("Customer", back_populates="communications")
    events = relationship("CommunicationEvent", back_populates="communication")
    outbox_job = relationship("OutboxJob", back_populates="communication", uselist=False)


# Event precedence rank — higher = more advanced in lifecycle
EVENT_RANK = {
    "sent": 1,
    "delivered": 2,
    "opened": 3,
    "read": 4,
    "clicked": 5,
    "failed": 0,  # terminal, not superseded by lifecycle events
}


class CommunicationEvent(Base):
    __tablename__ = "communication_events"
    __table_args__ = (
        UniqueConstraint("communication_id", "event_type", name="uq_event_comm_type"),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    communication_id = Column(UUID(as_uuid=False), ForeignKey("communications.id"), nullable=False)
    event_type = Column(String(32), nullable=False)
    channel_msg_id = Column(String(256))
    received_at = Column(DateTime(timezone=True), server_default=func.now())

    communication = relationship("Communication", back_populates="events")


class OutboxJob(Base):
    __tablename__ = "outbox_jobs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    communication_id = Column(UUID(as_uuid=False), ForeignKey("communications.id"), nullable=False, unique=True)
    status = Column(String(32), default="pending")  # pending|processing|done|dead
    attempts = Column(Integer, default=0)
    next_attempt_at = Column(DateTime(timezone=True), server_default=func.now())
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    communication = relationship("Communication", back_populates="outbox_job")


class AIRun(Base):
    __tablename__ = "ai_runs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=True)
    pipeline_id = Column(UUID(as_uuid=False), nullable=True)
    step = Column(String(64), nullable=False)
    input = Column(JSONB)
    output = Column(JSONB)
    valid = Column(Boolean, default=True)
    latency_ms = Column(Integer)
    model = Column(String(128))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    campaign = relationship("Campaign", back_populates="ai_runs")


# ════════════════════════════════════════════════════════════════════════════
#  CRM CORE  (Zoho-style sales CRM — multi-tenant, org-scoped)
# ════════════════════════════════════════════════════════════════════════════

# Module identifiers used by polymorphic relations (notes / tags / activities / timeline)
MODULES = ("lead", "account", "contact", "deal", "activity")

ROLES = ("admin", "manager", "sales_rep")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(256), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users = relationship("User", back_populates="organization")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_user_email"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    email = Column(String(256), nullable=False, index=True)
    hashed_password = Column(String(256), nullable=False)
    name = Column(String(256), nullable=False)
    role = Column(String(32), nullable=False, default="sales_rep")  # admin|manager|sales_rep
    title = Column(String(128))
    phone = Column(String(32))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="users")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    first_name = Column(String(128))
    last_name = Column(String(128), nullable=False)
    company = Column(String(256))
    title = Column(String(128))
    email = Column(String(256), index=True)
    phone = Column(String(32))
    mobile = Column(String(32))
    website = Column(String(256))

    source = Column(String(64))           # web|referral|cold_call|event|advertisement|...
    status = Column(String(32), default="new")   # new|contacted|qualified|unqualified|converted
    rating = Column(String(32))           # hot|warm|cold
    score = Column(Integer, default=0)
    industry = Column(String(128))
    annual_revenue = Column(Numeric(14, 2))
    no_of_employees = Column(Integer)

    street = Column(String(256))
    city = Column(String(128))
    state = Column(String(128))
    country = Column(String(128))
    zip_code = Column(String(32))

    description = Column(Text)
    custom = Column(JSONB, default=dict)

    converted = Column(Boolean, default=False, nullable=False)
    converted_at = Column(DateTime(timezone=True))
    converted_account_id = Column(UUID(as_uuid=False))
    converted_contact_id = Column(UUID(as_uuid=False))
    converted_deal_id = Column(UUID(as_uuid=False))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String(256), nullable=False, index=True)
    industry = Column(String(128))
    website = Column(String(256))
    phone = Column(String(32))
    email = Column(String(256))
    type = Column(String(64))             # customer|prospect|partner|vendor|reseller
    annual_revenue = Column(Numeric(14, 2))
    no_of_employees = Column(Integer)
    parent_account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True)

    billing_street = Column(String(256))
    billing_city = Column(String(128))
    billing_state = Column(String(128))
    billing_country = Column(String(128))
    billing_zip = Column(String(32))

    description = Column(Text)
    custom = Column(JSONB, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    contacts = relationship("Contact", back_populates="account")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)
    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)

    first_name = Column(String(128))
    last_name = Column(String(128), nullable=False)
    title = Column(String(128))
    department = Column(String(128))
    email = Column(String(256), index=True)
    phone = Column(String(32))
    mobile = Column(String(32))
    source = Column(String(64))

    mailing_street = Column(String(256))
    mailing_city = Column(String(128))
    mailing_state = Column(String(128))
    mailing_country = Column(String(128))
    mailing_zip = Column(String(32))

    description = Column(Text)
    custom = Column(JSONB, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    account = relationship("Account", back_populates="contacts")


class Pipeline(Base):
    __tablename__ = "pipelines"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stages = relationship("Stage", back_populates="pipeline", order_by="Stage.sort_order")


class Stage(Base):
    __tablename__ = "stages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    pipeline_id = Column(UUID(as_uuid=False), ForeignKey("pipelines.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    probability = Column(Integer, default=0)   # 0-100
    type = Column(String(16), default="open")  # open|won|lost

    pipeline = relationship("Pipeline", back_populates="stages")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String(256), nullable=False)
    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True, index=True)
    pipeline_id = Column(UUID(as_uuid=False), ForeignKey("pipelines.id"), nullable=False, index=True)
    stage_id = Column(UUID(as_uuid=False), ForeignKey("stages.id"), nullable=False, index=True)

    amount = Column(Numeric(14, 2), default=0)
    currency = Column(String(8), default="USD")
    close_date = Column(DateTime(timezone=True))
    probability = Column(Integer, default=0)
    source = Column(String(64))
    type = Column(String(64))             # new_business|existing_business|renewal
    status = Column(String(16), default="open")  # open|won|lost
    description = Column(Text)
    custom = Column(JSONB, default=dict)

    closed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Activity(Base):
    __tablename__ = "activities"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    type = Column(String(16), nullable=False, default="task")  # task|call|meeting
    subject = Column(String(256), nullable=False)
    status = Column(String(32), default="open")   # open|completed|...
    priority = Column(String(16), default="normal")  # low|normal|high
    due_date = Column(DateTime(timezone=True))
    start_at = Column(DateTime(timezone=True))
    end_at = Column(DateTime(timezone=True))
    location = Column(String(256))
    call_type = Column(String(16))        # inbound|outbound
    call_result = Column(String(128))
    description = Column(Text)
    completed_at = Column(DateTime(timezone=True))

    related_module = Column(String(32), index=True)   # lead|account|contact|deal
    related_id = Column(UUID(as_uuid=False), index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Note(Base):
    __tablename__ = "notes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    related_module = Column(String(32), nullable=False, index=True)
    related_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_tag_org_name"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    color = Column(String(16), default="#6366f1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RecordTag(Base):
    __tablename__ = "record_tags"
    __table_args__ = (
        UniqueConstraint("tag_id", "module", "record_id", name="uq_record_tag"),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tag_id = Column(UUID(as_uuid=False), ForeignKey("tags.id"), nullable=False, index=True)
    module = Column(String(32), nullable=False, index=True)
    record_id = Column(UUID(as_uuid=False), nullable=False, index=True)


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    uploaded_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    related_module = Column(String(32), nullable=False, index=True)
    related_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    filename = Column(String(512), nullable=False)
    content_type = Column(String(128))
    size = Column(Integer)
    storage_path = Column(String(1024), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    actor_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    module = Column(String(32), nullable=False, index=True)
    record_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    verb = Column(String(64), nullable=False)   # created|updated|stage_changed|converted|...
    meta = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ════════════════════════════════════════════════════════════════════════════
#  P2 — SALES DOCUMENTS  (Products · Price Books · Quotes · Orders · Invoices)
# ════════════════════════════════════════════════════════════════════════════

class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    code = Column(String(64))
    category = Column(String(128))
    description = Column(Text)
    unit_price = Column(Numeric(14, 2), default=0)
    tax_rate = Column(Numeric(5, 2), default=0)   # %
    currency = Column(String(8), default="USD")
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PriceBook(Base):
    __tablename__ = "price_books"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    description = Column(Text)
    is_default = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship("PriceBookItem", back_populates="price_book", cascade="all, delete-orphan")


class PriceBookItem(Base):
    __tablename__ = "price_book_items"
    __table_args__ = (UniqueConstraint("price_book_id", "product_id", name="uq_pb_item"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    price_book_id = Column(UUID(as_uuid=False), ForeignKey("price_books.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=False), ForeignKey("products.id"), nullable=False, index=True)
    price = Column(Numeric(14, 2), nullable=False)

    price_book = relationship("PriceBook", back_populates="items")
    product = relationship("Product")


class Quote(Base):
    __tablename__ = "quotes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    quote_number = Column(String(64), nullable=False, index=True)
    subject = Column(String(256), nullable=False)
    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=True)

    status = Column(String(32), default="draft")   # draft|sent|accepted|declined|expired
    valid_until = Column(DateTime(timezone=True))

    # line_items: [{id, product_id, name, description, qty, unit_price, discount_pct, total}]
    line_items = Column(JSONB, default=list)
    subtotal = Column(Numeric(14, 2), default=0)
    discount_pct = Column(Numeric(5, 2), default=0)
    tax_pct = Column(Numeric(5, 2), default=0)
    total = Column(Numeric(14, 2), default=0)
    currency = Column(String(8), default="USD")

    billing_street = Column(String(256))
    billing_city = Column(String(128))
    billing_country = Column(String(128))
    shipping_street = Column(String(256))
    shipping_city = Column(String(128))
    shipping_country = Column(String(128))

    payment_terms = Column(String(128))
    terms_and_conditions = Column(Text)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    so_number = Column(String(64), nullable=False, index=True)
    subject = Column(String(256), nullable=False)
    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=True)
    quote_id = Column(UUID(as_uuid=False), ForeignKey("quotes.id"), nullable=True)

    status = Column(String(32), default="pending")  # pending|confirmed|shipped|delivered|cancelled
    expected_ship_date = Column(DateTime(timezone=True))

    line_items = Column(JSONB, default=list)
    subtotal = Column(Numeric(14, 2), default=0)
    discount_pct = Column(Numeric(5, 2), default=0)
    tax_pct = Column(Numeric(5, 2), default=0)
    total = Column(Numeric(14, 2), default=0)
    currency = Column(String(8), default="USD")

    billing_street = Column(String(256))
    billing_city = Column(String(128))
    billing_country = Column(String(128))
    shipping_street = Column(String(256))
    shipping_city = Column(String(128))
    shipping_country = Column(String(128))

    payment_terms = Column(String(128))
    terms_and_conditions = Column(Text)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    invoice_number = Column(String(64), nullable=False, index=True)
    subject = Column(String(256), nullable=False)
    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    deal_id = Column(UUID(as_uuid=False), ForeignKey("deals.id"), nullable=True)
    sales_order_id = Column(UUID(as_uuid=False), ForeignKey("sales_orders.id"), nullable=True)

    status = Column(String(32), default="draft")   # draft|sent|paid|overdue|void
    due_date = Column(DateTime(timezone=True))
    payment_terms = Column(String(128))

    line_items = Column(JSONB, default=list)
    subtotal = Column(Numeric(14, 2), default=0)
    discount_pct = Column(Numeric(5, 2), default=0)
    tax_pct = Column(Numeric(5, 2), default=0)
    total = Column(Numeric(14, 2), default=0)
    currency = Column(String(8), default="USD")

    billing_street = Column(String(256))
    billing_city = Column(String(128))
    billing_country = Column(String(128))

    terms_and_conditions = Column(Text)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    po_number = Column(String(64), nullable=False, index=True)
    subject = Column(String(256), nullable=False)
    vendor_name = Column(String(256))
    vendor_email = Column(String(256))
    vendor_phone = Column(String(32))

    status = Column(String(32), default="draft")   # draft|sent|received|billed|cancelled
    expected_delivery = Column(DateTime(timezone=True))

    line_items = Column(JSONB, default=list)
    subtotal = Column(Numeric(14, 2), default=0)
    discount_pct = Column(Numeric(5, 2), default=0)
    tax_pct = Column(Numeric(5, 2), default=0)
    total = Column(Numeric(14, 2), default=0)
    currency = Column(String(8), default="USD")

    delivery_street = Column(String(256))
    delivery_city = Column(String(128))
    delivery_country = Column(String(128))

    payment_terms = Column(String(128))
    terms_and_conditions = Column(Text)
    notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ════════════════════════════════════════════════════════════════════════════
#  P3 — SUPPORT  (Cases · Solutions · SLA Policies)
# ════════════════════════════════════════════════════════════════════════════

class SLAPolicy(Base):
    __tablename__ = "sla_policies"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    description = Column(Text)

    # Hours to first response by priority
    response_low = Column(Integer, default=24)
    response_medium = Column(Integer, default=8)
    response_high = Column(Integer, default=4)
    response_critical = Column(Integer, default=1)

    # Hours to resolution by priority
    resolution_low = Column(Integer, default=168)
    resolution_medium = Column(Integer, default=72)
    resolution_high = Column(Integer, default=24)
    resolution_critical = Column(Integer, default=4)

    is_default = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Case(Base):
    __tablename__ = "cases"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    case_number = Column(String(64), nullable=False, index=True)
    subject = Column(String(512), nullable=False)
    description = Column(Text)

    account_id = Column(UUID(as_uuid=False), ForeignKey("accounts.id"), nullable=True, index=True)
    contact_id = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)

    status = Column(String(32), default="new")       # new|open|pending_customer|on_hold|closed
    priority = Column(String(16), default="medium")  # low|medium|high|critical
    type = Column(String(64))                        # question|problem|feature_request|other
    source = Column(String(32))                      # email|phone|web|chat

    resolution = Column(Text)
    closed_at = Column(DateTime(timezone=True))
    first_responded_at = Column(DateTime(timezone=True))

    sla_policy_id = Column(UUID(as_uuid=False), ForeignKey("sla_policies.id"), nullable=True)
    sla_first_response_due = Column(DateTime(timezone=True))
    sla_resolution_due = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sla_policy = relationship("SLAPolicy")


class Solution(Base):
    __tablename__ = "solutions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    title = Column(String(512), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(128))
    status = Column(String(16), default="draft")   # draft|published
    views = Column(Integer, default=0, nullable=False)
    helpful_votes = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ════════════════════════════════════════════════════════════════════════════
#  P4 — WORKFLOW AUTOMATION
# ════════════════════════════════════════════════════════════════════════════

class WorkflowRule(Base):
    __tablename__ = "workflow_rules"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    name = Column(String(256), nullable=False)
    description = Column(Text)
    module = Column(String(32), nullable=False)    # lead|contact|account|deal|case
    trigger = Column(String(32), nullable=False)   # on_create|on_update
    conditions = Column(JSONB, default=list)       # [{field, op, value}]
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    actions = relationship(
        "WorkflowAction",
        back_populates="rule",
        order_by="WorkflowAction.sort_order",
        cascade="all, delete-orphan",
    )


class WorkflowAction(Base):
    __tablename__ = "workflow_actions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    rule_id = Column(UUID(as_uuid=False), ForeignKey("workflow_rules.id"), nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    action_type = Column(String(32), nullable=False)   # field_update|create_task|webhook
    config = Column(JSONB, default=dict)

    rule = relationship("WorkflowRule", back_populates="actions")


class WorkflowLog(Base):
    __tablename__ = "workflow_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    rule_id = Column(UUID(as_uuid=False), ForeignKey("workflow_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    record_module = Column(String(32), nullable=False)
    record_id = Column(UUID(as_uuid=False), nullable=False)
    triggered_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(16), nullable=False, default="success")  # success|failed|skipped
    detail = Column(JSONB, default=dict)


class AssignmentRule(Base):
    __tablename__ = "assignment_rules"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    module = Column(String(32), nullable=False)    # lead|deal|case
    is_active = Column(Boolean, default=True, nullable=False)
    strategy = Column(String(32), default="round_robin")  # round_robin|criteria
    criteria = Column(JSONB, default=list)         # [{field, op, value}] for criteria matching
    assignees = Column(JSONB, default=list)        # [user_id, ...]
    current_index = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ScoringRule(Base):
    __tablename__ = "scoring_rules"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    module = Column(String(32), nullable=False)    # lead|deal
    is_active = Column(Boolean, default=True, nullable=False)
    criteria = Column(JSONB, default=list)         # [{field, op, value, score}]

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ════════════════════════════════════════════════════════════════════════════
#  P5 — REPORTS & FORECASTING
# ════════════════════════════════════════════════════════════════════════════

class Goal(Base):
    __tablename__ = "goals"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, index=True)

    name = Column(String(256), nullable=False)
    metric = Column(String(32), nullable=False)   # revenue_won|deals_won|leads_created|activities_completed
    target_value = Column(Numeric(14, 2), nullable=False)
    period_type = Column(String(16), default="monthly")  # monthly|quarterly|annual
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ════════════════════════════════════════════════════════════════════════════
#  P6 — MARKETING
# ════════════════════════════════════════════════════════════════════════════

class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    name = Column(String(256), nullable=False)
    subject = Column(String(512), nullable=False)
    body = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MarketingCampaign(Base):
    __tablename__ = "marketing_campaigns"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    name = Column(String(256), nullable=False)
    description = Column(Text)
    status = Column(String(32), default="draft")  # draft|running|completed|cancelled

    template_id = Column(UUID(as_uuid=False), ForeignKey("email_templates.id"), nullable=True)
    filter_criteria = Column(JSONB, default=list)  # same format as workflow conditions

    total_recipients = Column(Integer, default=0, nullable=False)
    sent_count = Column(Integer, default=0, nullable=False)
    open_count = Column(Integer, default=0, nullable=False)

    scheduled_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    template = relationship("EmailTemplate")
    recipients = relationship("CampaignRecipient", back_populates="campaign", cascade="all, delete-orphan")


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    campaign_id = Column(UUID(as_uuid=False), ForeignKey("marketing_campaigns.id"), nullable=False, index=True)
    lead_id = Column(UUID(as_uuid=False), ForeignKey("leads.id", ondelete="CASCADE"), nullable=True, index=True)

    status = Column(String(16), default="pending")  # pending|sent|opened|bounced
    sent_at = Column(DateTime(timezone=True))
    opened_at = Column(DateTime(timezone=True))

    campaign = relationship("MarketingCampaign", back_populates="recipients")


# ════════════════════════════════════════════════════════════════════════════
#  P7 — CUSTOMIZATION
# ════════════════════════════════════════════════════════════════════════════

class CustomField(Base):
    __tablename__ = "custom_fields"
    __table_args__ = (UniqueConstraint("org_id", "module", "field_key", name="uq_custom_field"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)

    module = Column(String(32), nullable=False)   # lead|contact|account|deal|case
    field_key = Column(String(64), nullable=False)
    label = Column(String(128), nullable=False)
    field_type = Column(String(32), default="text")  # text|number|date|select|checkbox|url|email|textarea
    options = Column(JSONB, default=list)              # for select type
    is_required = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WebForm(Base):
    __tablename__ = "web_forms"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    org_id = Column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    title = Column(String(256), nullable=False)
    description = Column(Text)
    module = Column(String(32), default="lead")
    fields = Column(JSONB, default=list)   # [{field_key, label, is_required, field_type, options}]
    redirect_url = Column(String(512))
    is_active = Column(Boolean, default=True, nullable=False)
    submission_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
