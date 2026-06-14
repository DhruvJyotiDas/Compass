"""Pydantic schemas for the CRM modules."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int


# ── Auth / Users ──────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    org_name: str
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(ORMModel):
    id: str
    org_id: str
    email: str
    name: str
    role: str
    title: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "sales_rep"
    title: Optional[str] = None
    phone: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ── Lead ──────────────────────────────────────────────────────────────────────

class LeadBase(BaseModel):
    first_name: Optional[str] = None
    last_name: str
    company: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    source: Optional[str] = None
    status: str = "new"
    rating: Optional[str] = None
    score: int = 0
    industry: Optional[str] = None
    annual_revenue: Optional[float] = None
    no_of_employees: Optional[int] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    custom: dict[str, Any] = Field(default_factory=dict)


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    rating: Optional[str] = None
    score: Optional[int] = None
    industry: Optional[str] = None
    annual_revenue: Optional[float] = None
    no_of_employees: Optional[int] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    custom: Optional[dict[str, Any]] = None


class LeadOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    first_name: Optional[str]
    last_name: str
    company: Optional[str]
    title: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    mobile: Optional[str]
    website: Optional[str]
    source: Optional[str]
    status: str
    rating: Optional[str]
    score: int
    industry: Optional[str]
    annual_revenue: Optional[float]
    no_of_employees: Optional[int]
    street: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    zip_code: Optional[str]
    description: Optional[str]
    converted: bool
    converted_at: Optional[datetime]
    converted_account_id: Optional[str]
    converted_contact_id: Optional[str]
    converted_deal_id: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class LeadConvertRequest(BaseModel):
    create_deal: bool = True
    deal_name: Optional[str] = None
    deal_amount: Optional[float] = None


# ── Account ─────────────────────────────────────────────────────────────────

class AccountBase(BaseModel):
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    type: Optional[str] = None
    annual_revenue: Optional[float] = None
    no_of_employees: Optional[int] = None
    parent_account_id: Optional[str] = None
    billing_street: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_country: Optional[str] = None
    billing_zip: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    custom: dict[str, Any] = Field(default_factory=dict)


class AccountCreate(AccountBase):
    pass


class AccountUpdate(AccountBase):
    name: Optional[str] = None
    custom: Optional[dict[str, Any]] = None


class AccountOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    name: str
    industry: Optional[str]
    website: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    type: Optional[str]
    annual_revenue: Optional[float]
    no_of_employees: Optional[int]
    parent_account_id: Optional[str]
    billing_street: Optional[str]
    billing_city: Optional[str]
    billing_state: Optional[str]
    billing_country: Optional[str]
    billing_zip: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── Contact ─────────────────────────────────────────────────────────────────

class ContactBase(BaseModel):
    first_name: Optional[str] = None
    last_name: str
    account_id: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    source: Optional[str] = None
    mailing_street: Optional[str] = None
    mailing_city: Optional[str] = None
    mailing_state: Optional[str] = None
    mailing_country: Optional[str] = None
    mailing_zip: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    custom: dict[str, Any] = Field(default_factory=dict)


class ContactCreate(ContactBase):
    pass


class ContactUpdate(ContactBase):
    last_name: Optional[str] = None
    custom: Optional[dict[str, Any]] = None


class ContactOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    account_id: Optional[str]
    first_name: Optional[str]
    last_name: str
    title: Optional[str]
    department: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    mobile: Optional[str]
    source: Optional[str]
    mailing_street: Optional[str]
    mailing_city: Optional[str]
    mailing_state: Optional[str]
    mailing_country: Optional[str]
    mailing_zip: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── Pipeline / Stage ──────────────────────────────────────────────────────────

class StageOut(ORMModel):
    id: str
    pipeline_id: str
    name: str
    sort_order: int
    probability: int
    type: str


class StageIn(BaseModel):
    name: str
    sort_order: int = 0
    probability: int = 0
    type: str = "open"


class PipelineOut(ORMModel):
    id: str
    org_id: str
    name: str
    is_default: bool
    stages: list[StageOut] = []


class PipelineCreate(BaseModel):
    name: str
    is_default: bool = False
    stages: list[StageIn] = Field(default_factory=list)


# ── Deal ──────────────────────────────────────────────────────────────────────

class DealBase(BaseModel):
    name: str
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    stage_id: Optional[str] = None
    amount: float = 0
    currency: str = "USD"
    close_date: Optional[datetime] = None
    probability: Optional[int] = None
    source: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    custom: dict[str, Any] = Field(default_factory=dict)


class DealCreate(DealBase):
    pass


class DealUpdate(DealBase):
    name: Optional[str] = None
    custom: Optional[dict[str, Any]] = None


class DealOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    name: str
    account_id: Optional[str]
    contact_id: Optional[str]
    pipeline_id: str
    stage_id: str
    amount: Optional[float]
    currency: str
    close_date: Optional[datetime]
    probability: Optional[int]
    source: Optional[str]
    type: Optional[str]
    status: str
    description: Optional[str]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]


class DealStageMove(BaseModel):
    stage_id: str


# ── Activity ────────────────────────────────────────────────────────────────

class ActivityBase(BaseModel):
    type: str = "task"
    subject: str
    status: str = "open"
    priority: str = "normal"
    due_date: Optional[datetime] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    location: Optional[str] = None
    call_type: Optional[str] = None
    call_result: Optional[str] = None
    description: Optional[str] = None
    related_module: Optional[str] = None
    related_id: Optional[str] = None
    owner_id: Optional[str] = None


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(ActivityBase):
    subject: Optional[str] = None
    type: Optional[str] = None
    completed_at: Optional[datetime] = None


class ActivityOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    type: str
    subject: str
    status: str
    priority: str
    due_date: Optional[datetime]
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    location: Optional[str]
    call_type: Optional[str]
    call_result: Optional[str]
    description: Optional[str]
    completed_at: Optional[datetime]
    related_module: Optional[str]
    related_id: Optional[str]
    created_at: datetime


# ── Notes / Tags / Timeline ───────────────────────────────────────────────────

class NoteCreate(BaseModel):
    related_module: str
    related_id: str
    body: str


class NoteOut(ORMModel):
    id: str
    author_id: Optional[str]
    related_module: str
    related_id: str
    body: str
    created_at: datetime


class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class TagOut(ORMModel):
    id: str
    name: str
    color: str


class TagAssign(BaseModel):
    tag_id: str
    module: str
    record_id: str


class TimelineOut(ORMModel):
    id: str
    actor_id: Optional[str]
    module: str
    record_id: str
    verb: str
    meta: dict[str, Any] = {}
    created_at: datetime


# ── Search / Dashboard ────────────────────────────────────────────────────────

class SearchHit(BaseModel):
    module: str
    id: str
    title: str
    subtitle: Optional[str] = None


class SearchResponse(BaseModel):
    hits: list[SearchHit]


# ── P2 — Products ────────────────────────────────────────────────────────────

class ProductBase(BaseModel):
    name: str
    code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit_price: float = 0
    tax_rate: float = 0
    currency: str = "USD"
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    name: Optional[str] = None


class ProductOut(ORMModel):
    id: str
    org_id: str
    name: str
    code: Optional[str]
    category: Optional[str]
    description: Optional[str]
    unit_price: float
    tax_rate: float
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]


# ── P2 — Price Books ──────────────────────────────────────────────────────────

class PriceBookItemIn(BaseModel):
    product_id: str
    price: float


class PriceBookItemOut(ORMModel):
    id: str
    price_book_id: str
    product_id: str
    price: float


class PriceBookBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: bool = False
    is_active: bool = True


class PriceBookCreate(PriceBookBase):
    items: list[PriceBookItemIn] = Field(default_factory=list)


class PriceBookUpdate(PriceBookBase):
    name: Optional[str] = None
    items: Optional[list[PriceBookItemIn]] = None


class PriceBookOut(ORMModel):
    id: str
    org_id: str
    name: str
    description: Optional[str]
    is_default: bool
    is_active: bool
    items: list[PriceBookItemOut] = []
    created_at: datetime
    updated_at: Optional[datetime]


# ── P2 — Line Items (shared) ──────────────────────────────────────────────────

class LineItem(BaseModel):
    id: Optional[str] = None
    product_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    qty: float = 1
    unit_price: float = 0
    discount_pct: float = 0
    total: float = 0


# ── P2 — Quotes ───────────────────────────────────────────────────────────────

class QuoteBase(BaseModel):
    subject: str
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    status: str = "draft"
    valid_until: Optional[datetime] = None
    line_items: list[LineItem] = Field(default_factory=list)
    discount_pct: float = 0
    tax_pct: float = 0
    currency: str = "USD"
    billing_street: Optional[str] = None
    billing_city: Optional[str] = None
    billing_country: Optional[str] = None
    shipping_street: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_country: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None


class QuoteCreate(QuoteBase):
    pass


class QuoteUpdate(QuoteBase):
    subject: Optional[str] = None


class QuoteOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    quote_number: str
    subject: str
    account_id: Optional[str]
    contact_id: Optional[str]
    deal_id: Optional[str]
    status: str
    valid_until: Optional[datetime]
    line_items: list[dict[str, Any]] = []
    subtotal: Optional[float]
    discount_pct: Optional[float]
    tax_pct: Optional[float]
    total: Optional[float]
    currency: str
    billing_street: Optional[str]
    billing_city: Optional[str]
    billing_country: Optional[str]
    shipping_street: Optional[str]
    shipping_city: Optional[str]
    shipping_country: Optional[str]
    payment_terms: Optional[str]
    terms_and_conditions: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── P2 — Sales Orders ─────────────────────────────────────────────────────────

class SalesOrderBase(BaseModel):
    subject: str
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    quote_id: Optional[str] = None
    status: str = "pending"
    expected_ship_date: Optional[datetime] = None
    line_items: list[LineItem] = Field(default_factory=list)
    discount_pct: float = 0
    tax_pct: float = 0
    currency: str = "USD"
    billing_street: Optional[str] = None
    billing_city: Optional[str] = None
    billing_country: Optional[str] = None
    shipping_street: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_country: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None


class SalesOrderCreate(SalesOrderBase):
    pass


class SalesOrderUpdate(SalesOrderBase):
    subject: Optional[str] = None


class SalesOrderOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    so_number: str
    subject: str
    account_id: Optional[str]
    contact_id: Optional[str]
    deal_id: Optional[str]
    quote_id: Optional[str]
    status: str
    expected_ship_date: Optional[datetime]
    line_items: list[dict[str, Any]] = []
    subtotal: Optional[float]
    discount_pct: Optional[float]
    tax_pct: Optional[float]
    total: Optional[float]
    currency: str
    billing_street: Optional[str]
    billing_city: Optional[str]
    billing_country: Optional[str]
    shipping_street: Optional[str]
    shipping_city: Optional[str]
    shipping_country: Optional[str]
    payment_terms: Optional[str]
    terms_and_conditions: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── P2 — Invoices ─────────────────────────────────────────────────────────────

class InvoiceBase(BaseModel):
    subject: str
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    sales_order_id: Optional[str] = None
    status: str = "draft"
    due_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    line_items: list[LineItem] = Field(default_factory=list)
    discount_pct: float = 0
    tax_pct: float = 0
    currency: str = "USD"
    billing_street: Optional[str] = None
    billing_city: Optional[str] = None
    billing_country: Optional[str] = None
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceUpdate(InvoiceBase):
    subject: Optional[str] = None


class InvoiceOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    invoice_number: str
    subject: str
    account_id: Optional[str]
    contact_id: Optional[str]
    deal_id: Optional[str]
    sales_order_id: Optional[str]
    status: str
    due_date: Optional[datetime]
    payment_terms: Optional[str]
    line_items: list[dict[str, Any]] = []
    subtotal: Optional[float]
    discount_pct: Optional[float]
    tax_pct: Optional[float]
    total: Optional[float]
    currency: str
    billing_street: Optional[str]
    billing_city: Optional[str]
    billing_country: Optional[str]
    terms_and_conditions: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── P2 — Purchase Orders ──────────────────────────────────────────────────────

class PurchaseOrderBase(BaseModel):
    subject: str
    vendor_name: Optional[str] = None
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    status: str = "draft"
    expected_delivery: Optional[datetime] = None
    line_items: list[LineItem] = Field(default_factory=list)
    discount_pct: float = 0
    tax_pct: float = 0
    currency: str = "USD"
    delivery_street: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_country: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_and_conditions: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    pass


class PurchaseOrderUpdate(PurchaseOrderBase):
    subject: Optional[str] = None


class PurchaseOrderOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    po_number: str
    subject: str
    vendor_name: Optional[str]
    vendor_email: Optional[str]
    vendor_phone: Optional[str]
    status: str
    expected_delivery: Optional[datetime]
    line_items: list[dict[str, Any]] = []
    subtotal: Optional[float]
    discount_pct: Optional[float]
    tax_pct: Optional[float]
    total: Optional[float]
    currency: str
    delivery_street: Optional[str]
    delivery_city: Optional[str]
    delivery_country: Optional[str]
    payment_terms: Optional[str]
    terms_and_conditions: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


# ── P3 — SLA Policies ─────────────────────────────────────────────────────────

class SLAPolicyBase(BaseModel):
    name: str
    description: Optional[str] = None
    response_low: int = 24
    response_medium: int = 8
    response_high: int = 4
    response_critical: int = 1
    resolution_low: int = 168
    resolution_medium: int = 72
    resolution_high: int = 24
    resolution_critical: int = 4
    is_default: bool = False
    is_active: bool = True


class SLAPolicyCreate(SLAPolicyBase):
    pass


class SLAPolicyUpdate(SLAPolicyBase):
    name: Optional[str] = None


class SLAPolicyOut(ORMModel):
    id: str
    org_id: str
    name: str
    description: Optional[str]
    response_low: int
    response_medium: int
    response_high: int
    response_critical: int
    resolution_low: int
    resolution_medium: int
    resolution_high: int
    resolution_critical: int
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]


# ── P3 — Cases ────────────────────────────────────────────────────────────────

class CaseBase(BaseModel):
    subject: str
    description: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    status: str = "new"
    priority: str = "medium"
    type: Optional[str] = None
    source: Optional[str] = None
    resolution: Optional[str] = None
    sla_policy_id: Optional[str] = None
    owner_id: Optional[str] = None


class CaseCreate(CaseBase):
    pass


class CaseUpdate(CaseBase):
    subject: Optional[str] = None
    closed_at: Optional[datetime] = None
    first_responded_at: Optional[datetime] = None
    sla_first_response_due: Optional[datetime] = None
    sla_resolution_due: Optional[datetime] = None


class CaseOut(ORMModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    case_number: str
    subject: str
    description: Optional[str]
    account_id: Optional[str]
    contact_id: Optional[str]
    status: str
    priority: str
    type: Optional[str]
    source: Optional[str]
    resolution: Optional[str]
    closed_at: Optional[datetime]
    first_responded_at: Optional[datetime]
    sla_policy_id: Optional[str]
    sla_first_response_due: Optional[datetime]
    sla_resolution_due: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]


# ── P3 — Solutions ────────────────────────────────────────────────────────────

class SolutionBase(BaseModel):
    title: str
    body: str
    category: Optional[str] = None
    status: str = "draft"


class SolutionCreate(SolutionBase):
    pass


class SolutionUpdate(SolutionBase):
    title: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None
    helpful_votes: Optional[int] = None
    views: Optional[int] = None


class SolutionOut(ORMModel):
    id: str
    org_id: str
    author_id: Optional[str]
    title: str
    body: str
    category: Optional[str]
    status: str
    views: int
    helpful_votes: int
    created_at: datetime
    updated_at: Optional[datetime]


TokenResponse.model_rebuild()
