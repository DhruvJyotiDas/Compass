"""Pydantic output schemas for each Claude pipeline step."""
from typing import Any, Optional
from pydantic import BaseModel, field_validator


# ── Assistant action routing ─────────────────────────────────────────────────────

class ActionOutput(BaseModel):
    action: str  # "campaign" | "list" | "answer"


class AssistantRoute(BaseModel):
    """Richer router: the intent plus any entities the action needs (customer, channel, etc.)."""
    action: str  # campaign | list | answer | history | add_customer | profile
    customer_name: Optional[str] = None   # the customer the request is about ("this customer")
    channel: Optional[str] = None         # email | sms | whatsapp | any  (for history filtering)
    limit: Optional[int] = None           # e.g. "last 2 mails" -> 2
    new_name: Optional[str] = None        # add_customer: full name to create
    new_email: Optional[str] = None       # add_customer: email
    new_phone: Optional[str] = None       # add_customer: phone


class PersonalizedMessageOutput(BaseModel):
    """A ready-to-send, fully-personalized message for ONE customer (no template tokens)."""
    channel: str                      # email | sms | whatsapp
    subject: Optional[str] = None     # email only
    body: str
    rationale: Optional[str] = None   # one line on why this message suits this customer


class CampaignBriefOutput(BaseModel):
    ready: bool                       # true once we know both the goal/audience AND the offer
    question: Optional[str] = None    # if not ready, the clarifying question to ask
    goal: Optional[str] = None        # one-line goal incl. audience
    offer: Optional[str] = None       # the incentive to give customers


# ── Step 1: Intent ─────────────────────────────────────────────────────────────

class IntentOutput(BaseModel):
    intent: str  # e.g. "win_back_inactive"
    urgency: str  # low|medium|high
    channels: list[str]  # ["whatsapp", "email"]
    audience_description: str
    kpis: list[str]
    campaign_name: str


# ── Step 2: Segment DSL ────────────────────────────────────────────────────────

ALLOWED_FIELDS = {
    "last_order_at": ["days_ago_gt", "days_ago_lt"],
    "lifetime_spend": ["gte", "lte"],
    "order_count": ["gte", "lte"],
    "engagement_score": ["gte", "lte"],
    "favorite_category": ["eq", "neq"],
    "name": ["starts_with", "contains"],
}


class DSLFilter(BaseModel):
    field: str
    op: str
    value: Any

    @field_validator("field")
    @classmethod
    def field_allowed(cls, v: str) -> str:
        if v not in ALLOWED_FIELDS:
            raise ValueError(f"field '{v}' not in registry: {list(ALLOWED_FIELDS)}")
        return v

    @field_validator("op")
    @classmethod
    def op_allowed(cls, v: str, info: Any) -> str:
        field = info.data.get("field")
        if field and field in ALLOWED_FIELDS and v not in ALLOWED_FIELDS[field]:
            raise ValueError(f"op '{v}' not valid for field '{field}'")
        return v


class SegmentDSLOutput(BaseModel):
    filters: list[DSLFilter]
    logic: str = "AND"
    audience_description: str

    @field_validator("filters")
    @classmethod
    def max_depth(cls, v: list) -> list:
        if len(v) > 6:
            raise ValueError("max 6 filters")
        return v


# ── Step 3: Campaign Plan ──────────────────────────────────────────────────────

class CampaignVariant(BaseModel):
    variant_id: str  # "A" | "B"
    channel: str     # whatsapp | email | sms
    split_pct: int
    name: str


class CampaignPlanOutput(BaseModel):
    variants: list[CampaignVariant]
    ab_test: bool
    send_window: str  # e.g. "09:00–21:00 IST"
    daily_cap: int
    rationale: str

    @field_validator("variants")
    @classmethod
    def split_sums_100(cls, v: list) -> list:
        total = sum(var.split_pct for var in v)
        if total != 100:
            raise ValueError(f"variant split_pct must sum to 100, got {total}")
        return v


# ── Step 4: Message Copy ───────────────────────────────────────────────────────

class MessageVariant(BaseModel):
    variant_id: str
    channel: str
    subject: Optional[str] = None
    body: str
    tokens_used: list[str]  # e.g. ["{{first_name}}", "{{last_order}}"]


class MessageCopyOutput(BaseModel):
    variants: list[MessageVariant]


# ── Step 5: Insights ───────────────────────────────────────────────────────────

class InsightsOutput(BaseModel):
    findings: list[str]
    next_action: str
    next_goal: str  # pre-filled goal for follow-up campaign
    confidence: str  # low|medium|high
    best_variant: Optional[str] = None


# ── Customer Card (AI customer intelligence) ───────────────────────────────────

class CustomerSuggestion(BaseModel):
    label: str       # short action, e.g. "Send comeback discount"
    rationale: str   # one line why


class CustomerCardOutput(BaseModel):
    summary: str          # 1-2 sentence narrative summary
    churn_risk: str       # low|medium|high
    suggestions: list[CustomerSuggestion]
