from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Customers ────────────────────────────────────────────────────────────────

class CustomerIn(BaseModel):
    external_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    opted_out: bool = False


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    external_id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    last_order_at: Optional[datetime]
    order_count: int
    lifetime_spend: float
    opted_out: bool


class OrderIn(BaseModel):
    external_id: str
    customer_external_id: str
    amount: float
    status: str = "completed"
    created_at: Optional[datetime] = None


class IngestRequest(BaseModel):
    customers: list[CustomerIn] = Field(default_factory=list)
    orders: list[OrderIn] = Field(default_factory=list)


class IngestResponse(BaseModel):
    customers_upserted: int
    orders_upserted: int


# ── Segments ──────────────────────────────────────────────────────────────────

class DSLFilter(BaseModel):
    field: str
    op: str
    value: Any


class SegmentDSL(BaseModel):
    filters: list[DSLFilter]
    logic: str = "AND"


class CompileRequest(BaseModel):
    dsl: SegmentDSL


class CustomerMatchTrace(BaseModel):
    field: str
    op: str
    value: Any
    actual: Any
    matched: bool


class CustomerPreview(BaseModel):
    id: str
    name: str
    email: Optional[str]
    last_order_at: Optional[datetime]
    lifetime_spend: float
    order_count: int
    match_trace: list[CustomerMatchTrace]


class CompileResponse(BaseModel):
    count: int
    sql_preview: str
    sample: list[CustomerPreview]


# ── Campaigns ─────────────────────────────────────────────────────────────────

class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: Optional[str]
    goal_text: str
    intent: Optional[dict]
    segment_dsl: Optional[dict]
    plan: Optional[dict]
    message_variants: Optional[list]
    insights: Optional[dict]
    status: str
    audience_count: Optional[int]
    pipeline_id: Optional[str]
    created_at: datetime


class ApproveRequest(BaseModel):
    segment_dsl: Optional[SegmentDSL] = None  # override if user edited chips


# ── Pipelines ─────────────────────────────────────────────────────────────────

class PipelineRequest(BaseModel):
    goal_text: str


class PipelineStepEvent(BaseModel):
    pipeline_id: str
    step: str
    output: Any
    latency_ms: int
    valid: bool


# ── Receipts ──────────────────────────────────────────────────────────────────

class ReceiptPayload(BaseModel):
    communication_id: str
    event_type: str  # sent|delivered|opened|read|clicked|failed
    timestamp: Optional[datetime] = None
    channel_msg_id: Optional[str] = None


# ── Communications ────────────────────────────────────────────────────────────

class CampaignStats(BaseModel):
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    read: int = 0
    clicked: int = 0
    failed: int = 0
    converted: int = 0
    dup_rejected: int = 0
    dlq_count: int = 0
    total: int = 0


class SSEEvent(BaseModel):
    type: str  # "event" | "stats" | "step_complete" | "insight"
    data: Any
