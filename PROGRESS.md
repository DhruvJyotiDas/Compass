# Compass CRM — Work Log & Context

## What This Project Is

Compass was originally an AI-native campaign/segmentation tool. It was rebuilt from scratch into a full **Zoho-style CRM** (multi-tenant, role-based, with sales, finance, and support modules). The original AI pipeline code is preserved in the repo but not wired into the new UI — it will return as the Marketing module in a later phase.

**Live URL:** `http://163.128.34.20`
**Demo login:** `admin@demo.com` / `password`

---

## Deployment Architecture (current)

All services run directly on the host (no Docker for app services). Only the Postgres container remains in Docker.

| Component | How it runs | Port |
|---|---|---|
| Caddy (reverse proxy) | `systemctl` host service | `:80` (public) |
| Next.js frontend | `npm start` (production build) | `localhost:3000` |
| FastAPI backend | `uvicorn` | `localhost:8088` |
| PostgreSQL | Docker container `compass-pg` | `localhost:5433` |

**Caddy routing** (`/home/ubuntu/Compass/Caddyfile`, copied to `/etc/caddy/Caddyfile`):
- `GET /api/*` → strips `/api` prefix → `localhost:8088`
- Everything else → `localhost:3000`

**Frontend env** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://163.128.34.20/api
```
This is baked into the Next.js build at compile time (`NEXT_PUBLIC_*` vars). After any env change, **must rebuild** with `npm run build` then restart `npm start`.

**To restart services after a reboot:**
```bash
# Backend
cd /home/ubuntu/Compass/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8088 &

# Frontend (from /home/ubuntu/Compass/frontend)
npm start -- -p 3000 &

# Caddy (already a systemd service, auto-restarts)
sudo systemctl start caddy
```

**Old Docker stack** (compass-caddy, compass-frontend, compass-crm-api, compass-channel, compass-postgres, compass-ollama, compass-outbox-worker) was torn down on 2026-06-13. The `docker-compose.yml` still exists but should not be `docker compose up`'d — it would conflict on port 80.

---

## Backend

**Language/framework:** Python 3.12, FastAPI, SQLAlchemy (async), asyncpg, Alembic  
**Location:** `backend/`  
**Entrypoint:** `app/main.py`  
**Database URL (host):** `postgresql+asyncpg://compass:compass@localhost:5433/compass`

### Key files

| File | Purpose |
|---|---|
| `app/models.py` | All SQLAlchemy ORM models (CRM Core section + legacy) |
| `app/auth.py` | JWT creation/verification, `get_current_user`, `require_role` |
| `app/crm_common.py` | Shared helpers (pagination, org-scoping, timeline event writer) |
| `app/crm_schemas.py` | Shared Pydantic base schemas |
| `app/config.py` | Pydantic-settings config (reads `.env`) |
| `app/seed/crm.py` | Demo data seeder — trigger via `POST /admin/seed-crm` |

### Routers (`app/routers/`)

| Router | Prefix | Module |
|---|---|---|
| `auth_router.py` | `/auth` | Login, register org, get current user |
| `users.py` | `/users` | User CRUD within org |
| `leads.py` | `/leads` | Lead CRUD + convert to account/contact/deal |
| `accounts.py` | `/accounts` | Account CRUD |
| `contacts.py` | `/contacts` | Contact CRUD |
| `deal_pipelines.py` | `/deal-pipelines` | Pipeline + stage management (uses `/deal-pipelines` not `/pipelines` — legacy AI router owns that prefix) |
| `deals.py` | `/deals` | Deal CRUD + kanban stage move |
| `activities.py` | `/activities` | Activity log |
| `notes.py` | `/notes` | Notes (polymorphic: attached to any record) |
| `search.py` | `/search` | Global full-text search across all modules |
| `dashboard.py` | `/dashboard` | Summary stats |
| `products.py` | `/products` | Product catalog |
| `price_books.py` | `/price-books` | Named price lists with per-product overrides |
| `quotes.py` | `/quotes` | Quotes (auto-number Q-NNNNN, JSONB line items, server-side totals) |
| `sales_orders.py` | `/sales-orders` | Sales Orders (SO-NNNNN) |
| `invoices.py` | `/invoices` | Invoices (INV-NNNNN) |
| `purchase_orders.py` | `/purchase-orders` | Purchase Orders (PO-NNNNN) |
| `sla_policies.py` | `/sla-policies` | SLA policies (first-response + resolution hours per priority) |
| `cases.py` | `/cases` | Cases (CASE-NNNNN, SLA deadline auto-computed on create) |
| `solutions.py` | `/solutions` | Knowledge Base articles (view count + helpful votes) |

### ORM Models (`app/models.py`)

Legacy (old AI app, kept but unused by new UI): `Customer`, `Order`, `Campaign`, `Communication`, `CommunicationEvent`, `OutboxJob`, `AIRun`

CRM Core: `Organization`, `User`, `Lead`, `Account`, `Contact`, `Pipeline`, `Stage`, `Deal`, `Activity`, `Note`, `Tag`, `RecordTag`, `Attachment`, `TimelineEvent`, `Product`, `PriceBook`, `PriceBookItem`, `Quote`, `SalesOrder`, `Invoice`, `PurchaseOrder`, `SLAPolicy`, `Case`, `Solution`

### Auth & Roles

- JWT tokens, 7-day expiry
- Roles: `admin`, `manager`, `sales_rep`
- Multi-tenant: every record is scoped to `org_id`; users cannot see other orgs' data
- **Gotcha:** `passlib 1.7.4` requires `bcrypt==4.0.1` pinned — bcrypt 4.1+ raises a false "password > 72 bytes" error

---

## Frontend

**Framework:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui  
**Location:** `frontend/`

### Route structure (`src/app/(app)/`)

All routes under `(app)/` are behind the auth guard (layout checks for JWT in localStorage, redirects to `/login` if missing).

| Route | Module |
|---|---|
| `/dashboard` | Summary stats |
| `/leads`, `/leads/[id]` | Leads |
| `/accounts`, `/accounts/[id]` | Accounts |
| `/contacts`, `/contacts/[id]` | Contacts |
| `/deals`, `/deals/[id]` | Deals (kanban view on list) |
| `/activities` | Activity log |
| `/products`, `/products/[id]` | Product catalog |
| `/price-books`, `/price-books/[id]` | Price Books |
| `/quotes`, `/quotes/[id]` | Quotes |
| `/sales-orders`, `/sales-orders/[id]` | Sales Orders |
| `/invoices`, `/invoices/[id]` | Invoices |
| `/purchase-orders`, `/purchase-orders/[id]` | Purchase Orders |
| `/cases`, `/cases/[id]` | Support Cases |
| `/knowledge-base`, `/knowledge-base/[id]` | Knowledge Base |
| `/settings` | User settings |

### Component library (`src/components/`)

**`crm/`** — reusable CRM building blocks:
- `DataTable.tsx` — sortable/paginated table
- `DetailShell.tsx` — record detail layout with tabs
- `KanbanBoard.tsx` — drag-and-drop kanban (used by Deals)
- `LineItemsEditor.tsx` — editable line items with totals (used by Quotes, SO, Invoice, PO)
- `PageHeader.tsx` — page title + action buttons
- `RecordForm.tsx` — generic create/edit form
- `RelatedPanels.tsx` — timeline/notes/activities side panels on detail pages

**`ui/`** — shadcn/ui primitives: `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `sheet`, `table`, `tabs`, `textarea`

**`shell/`** — sidebar nav and app shell

### API client (`src/lib/api.ts`)

Single `API` constant: `process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"`. All fetch calls go through this. The `NEXT_PUBLIC_API_URL` is baked in at build time — changing it requires a rebuild.

---

## Phases Completed

### Phase 1 — CRM Core
Multi-tenant auth (org/user/JWT), roles (admin/manager/sales_rep), modules: Leads (with convert-to-account/contact/deal), Accounts, Contacts, Deals (kanban + stage move), Activities, Notes, Tags, Timeline, global search, dashboard.

### Phase 2 — Finance / Sales Docs
Products (catalog, CRUD), Price Books (named price lists with per-product overrides), Quotes (auto-number Q-NNNNN, JSONB line items, server-side totals), Sales Orders (SO-NNNNN), Invoices (INV-NNNNN), Purchase Orders (PO-NNNNN). All have list + detail pages with `LineItemsEditor` on the "Line Items" tab.

### Phase 3 — Support
SLA Policies (first-response + resolution hours per priority level), Cases (CASE-NNNNN, SLA deadline computed on create, `closed_at` auto-set when status → closed), Knowledge Base / Solutions (view count auto-increments on GET, helpful votes via `POST /solutions/{id}/helpful`).

### Phase 4 — Workflow Automation
- **WorkflowRule** — trigger (on_create / on_update) per module (lead/contact/account/deal/case), optional conditions (12 operators: eq/neq/contains/not_contains/starts_with/ends_with/is_empty/not_empty/gt/lt/gte/lte), ordered actions (field_update / create_task / webhook), active toggle
- **WorkflowLog** — immutable execution log: success / failed / skipped with detail JSON
- **AssignmentRule** — auto-assign newly created records via round_robin (cycles through user list) or criteria (assign to user[0] if conditions match)
- **ScoringRule** — additive score model: each criterion adds/subtracts from `record.score` on create and update
- **Engine** (`app/workflow_engine.py`): condition evaluator + action executors, wired into leads/contacts/deals/cases routers
- **Frontend** Settings page: Workflows tab (builder dialog with dynamic condition rows + action config), Assignment Rules tab (user checklist for assignees), Scoring Rules tab

---

## Remaining Phases (planned)

| Phase | Scope |
|---|---|
| P5 | Reports & forecasting |
| P6 | Marketing module — re-integrate original AI campaign/segmentation pipeline |
| P7 | Custom fields, web forms, import/export |

Full plan file: `~/.claude/plans/adaptive-nibbling-teacup.md`

---

## Known Gotchas & Decisions

- **`/deal-pipelines` prefix** — not `/pipelines` because the legacy AI router in `app/routers/pipelines.py` already owns that path and is still registered in `main.py`.
- **bcrypt pin** — `requirements.txt` pins `bcrypt==4.0.1`; do not upgrade.
- **`NEXT_PUBLIC_API_URL` is build-time** — changing it in `.env.local` requires `npm run build` + restart.
- **Old docker-compose.yml still present** — do not run `docker compose up`; it will fight Caddy on port 80.
- **Ollama** — the config default is `http://ollama:11434` (Docker service name). AI features in the backend won't work until ollama is either run on the host or the URL is updated to the container's IP.
- **Demo seed** — call `POST /admin/seed-crm` with header `X-Admin-Secret: <ADMIN_SECRET>` to reset/re-seed demo data. Demo org: `admin@demo.com` / `password`.
