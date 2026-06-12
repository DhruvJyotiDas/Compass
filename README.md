# Compass — AI-Native Mini CRM

An AI-native Mini CRM that helps D2C brands intelligently reach their shoppers. Built for the Xeno Engineering Internship assignment.

## What it does

1. **Ingest** customer and order data (5k customers, 25k orders seeded)
2. **Segment** with an AI-generated, human-editable DSL → parameterized SQL
3. **Campaign pipeline** — speak or type a goal; Claude plans intent → segment → copy in 5 steps
4. **Dispatch** via transactional outbox to a stubbed channel service
5. **Track** delivery/opens/clicks in real-time via SSE + HMAC-signed callbacks
6. **Insights** — AI post-campaign analysis with citation validation

## Architecture

```
Browser → Caddy (TLS)
           ├→ frontend   (Next.js 14)
           └→ crm-api    (FastAPI)
                 │  outbox-worker (same image)
                 │  ← HMAC callbacks ←
                 └→ channel-service (FastAPI)
           PostgreSQL

AI: Claude claude-sonnet-4-6 via Anthropic API (with prompt caching)
Voice: Browser Web Speech API (en-IN)
```

## Quick start (local dev)

```bash
# 1. Copy env
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, POSTGRES_PASSWORD, CHANNEL_HMAC_SECRET

# 2. Start everything
docker-compose up -d

# 3. Seed data
curl -X POST http://localhost:8000/admin/seed \
  -H "X-Admin-Secret: dev-admin-secret"

# 4. Open http://localhost:3000
```

## Production deploy (VPS)

```bash
# On your VPS:
git clone <repo> && cd compass
cp .env.example .env
# Edit .env: set DOMAIN, all secrets, ANTHROPIC_API_KEY

docker-compose up -d

# Caddy auto-provisions Let's Encrypt TLS for your subdomains:
# app.DOMAIN, api.DOMAIN, channel.DOMAIN
```

## Key design decisions

See [DECISIONS.md](DECISIONS.md) for the full decision log.

**Standout technical features:**
- **Idempotency by construction** — three UNIQUE DB constraints handle customer/communication/event deduplication; no application-level dedup needed
- **Prompt caching** — Anthropic's ephemeral cache on 2k-token system prompt; ~80% token savings after first call
- **Zero-PII AI** — planner sees aggregates only; copywriter uses `{{token}}` placeholders, substituted server-side
- **Citation-validated insights** — every number in AI findings is validated against actual campaign stats before accepting
- **Transactional outbox** — communications + jobs created in one DB transaction; worker uses SKIP LOCKED for safe concurrent processing
- **Per-customer "why matched"** — hover any customer to see which DSL conditions matched their data (zero LLM)

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16, SQLAlchemy async |
| AI | Anthropic Claude claude-sonnet-4-6 |
| Proxy | Caddy 2 |
| Deploy | Docker Compose |
