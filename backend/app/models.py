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
    campaign_id = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=False), ForeignKey("customers.id"), nullable=False)
    channel = Column(String(32), nullable=False)  # whatsapp|email|sms
    message = Column(Text)
    subject = Column(String(512))
    variant = Column(String(8))  # A|B
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
