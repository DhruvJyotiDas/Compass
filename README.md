# Compass — CRM

A full-featured, Zoho-style sales **CRM**: multi-user with roles, the core sales modules
(Leads, Contacts, Accounts, Deals, Activities), a visual drag-and-drop deal pipeline,
dashboards, global search, notes & timelines — built on FastAPI + Next.js 14 + PostgreSQL.

> **Phase 1 (this build)** ships the working core CRM. Later phases add Products/Quotes/Invoices,
> Cases, Workflow automation, Reports, and re-integrate the original AI campaign engine as the
> Marketing module. See the roadmap below.

## Core features (Phase 1)

- **Auth & roles** — org sign-up, JWT login, three roles (**Admin / Manager / Sales Rep**) with
  per-module permissions and record ownership (reps see their own records; managers/admins see all).
- **Leads** — capture, qualify, score, and **convert** a lead into an Account + Contact + Deal in one click.
- **Contacts & Accounts** — companies and the people in them, fully linked.
- **Deals** — a visual **Kanban pipeline**; drag a deal across stages to update probability/won/lost.
- **Activities** — tasks, calls, and meetings attached to any record, with quick-complete.
- **Per-record tabs** — Overview, Activities, Notes, and an automatic **Timeline** feed.
- **Dashboard** — pipeline value by stage, leads by source/status, conversion rate, overdue tasks.
- **Global search** across leads, contacts, accounts, and deals.

## Architecture

```
Browser → Caddy (TLS)
           ├→ frontend   (Next.js 14 · Tailwind · shadcn/ui · React Query)
           └→ crm-api    (FastAPI · JWT auth · async SQLAlchemy)
           PostgreSQL 16

Legacy AI-campaign services (channel-service, outbox-worker, Ollama) remain in the
compose file, set aside for a later Marketing phase.
```

## Quick start (local dev)

```bash
# 1. Copy env
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, ADMIN_SECRET, JWT_SECRET

# 2. Start everything
docker-compose up -d

# 3. Seed a demo organization with sample CRM data
curl -X POST http://localhost:8000/admin/seed-crm \
  -H "X-Admin-Secret: dev-admin-secret"

# 4. Open http://localhost:3000 and log in:
#    email:    admin@demo.com
#    password: password
```

## Roadmap (later phases)

- **P2 — Inventory/Sales docs:** Products, Price Books, Quotes, Sales Orders, Invoices.
- **P3 — Support:** Cases, Solutions/Knowledge base, SLAs.
- **P4 — Automation:** workflow rules, blueprints, approvals, assignment & scoring rules.
- **P5 — Analytics:** custom report builder, dashboards, forecasting.
- **P6 — Marketing:** email send/track, templates, mass email, and re-integrating the AI
  segmentation/campaign pipeline + AI assists (lead scoring, email drafting).
- **P7 — Customization:** custom fields/modules, web-to-lead forms, CSV import/export.

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
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Query, @dnd-kit, Recharts |
| Backend | FastAPI, Python 3.12, JWT auth (python-jose + passlib/bcrypt) |
| Database | PostgreSQL 16, SQLAlchemy async |
| Proxy | Caddy 2 |
| Deploy | Docker Compose |
