-- Compass CRM — initial schema
-- Run once against a fresh database

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    last_order_at TIMESTAMPTZ,
    order_count INTEGER NOT NULL DEFAULT 0,
    lifetime_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
    opted_out BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_external_id ON customers(external_id);
CREATE INDEX IF NOT EXISTS idx_customers_last_order_at ON customers(last_order_at);
CREATE INDEX IF NOT EXISTS idx_customers_lifetime_spend ON customers(lifetime_spend);
CREATE INDEX IF NOT EXISTS idx_customers_order_count ON customers(order_count);
-- Partial index: every segment query filters opted_out = FALSE
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(id) WHERE opted_out = FALSE;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    attributed_communication_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    goal_text TEXT NOT NULL,
    intent JSONB,
    segment_dsl JSONB,
    plan JSONB,
    message_variants JSONB,
    insights JSONB,
    status TEXT NOT NULL DEFAULT 'draft',
    audience_count INTEGER,
    pipeline_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    channel TEXT NOT NULL,
    message TEXT,
    subject TEXT,
    variant TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_comm_campaign_customer UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_communications_campaign_id ON communications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communications_status ON communications(status);

CREATE TABLE IF NOT EXISTS communication_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    communication_id UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    channel_msg_id TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_event_comm_type UNIQUE (communication_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_events_communication_id ON communication_events(communication_id);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON communication_events(received_at);
-- Composite index for cumulative funnel stats query (event_type filter inside aggregate)
CREATE INDEX IF NOT EXISTS idx_events_type_comm ON communication_events(event_type, communication_id);

CREATE TABLE IF NOT EXISTS outbox_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    communication_id UUID NOT NULL UNIQUE REFERENCES communications(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_jobs(next_attempt_at)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ai_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    pipeline_id UUID,
    step TEXT NOT NULL,
    input JSONB,
    output JSONB,
    valid BOOLEAN DEFAULT TRUE,
    latency_ms INTEGER,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_pipeline_id ON ai_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_campaign_id ON ai_runs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs(created_at DESC);
