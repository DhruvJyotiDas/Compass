<div align="center">

# 🧭 Compass

### The AI-native Customer Engagement CRM

**A traditional CRM and an autonomous AI growth marketer — in one product.**
When you want control, operate the CRM by hand. When you want speed, describe a business
goal and watch AI build the audience, the campaign, and the messages for you.

<br/>

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-Qwen3--8B%20(self--hosted)-7C3AED)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📖 Table of Contents

- [What is Compass?](#-what-is-compass)
- [The core idea: two modes, everywhere](#-the-core-idea-two-modes-everywhere)
- [Feature tour](#-feature-tour)
- [Screenshots](#-screenshots)
- [How the AI closed loop works](#-how-the-ai-closed-loop-works)
- [Architecture](#-architecture)
- [The AI layer (swappable, by design)](#-the-ai-layer-swappable-by-design)
- [Tech stack](#-tech-stack)
- [Getting started](#-getting-started)
- [Pointing Compass at your own LLM](#-pointing-compass-at-your-own-llm)
- [Project structure](#-project-structure)
- [API overview](#-api-overview)
- [Engineering highlights](#-engineering-highlights)
- [Roadmap](#-roadmap)
- [Author](#-author)

---

## ✨ What is Compass?

Compass is a customer-engagement CRM with an **AI growth copilot built into every workflow**. It
combines a full, manually-operated CRM (customers, segments, campaigns — plus a complete traditional
sales/finance/support suite) with an **AI layer that can perform the same tasks faster** and explain
every decision it makes.

The product is designed around one feeling:

> _"I can manage everything myself — but an AI marketer is sitting beside me that can analyze,
> create, execute, and improve campaigns."_

The AI never blindly mutates your data. It **proposes**, shows its reasoning, and **waits for your
approval** before anything is launched.

---

## 🎛 The core idea: two modes, everywhere

| | 🖱️ **Manual mode** | 🪄 **AI mode** |
|---|---|---|
| **Audience** | Build a segment with filter rows | Describe it in a sentence → AI compiles a safe segment |
| **Campaign** | Write the campaign and pick channels | AI drafts name, audience, plan, A/B variants & copy |
| **Messages** | Write WhatsApp / SMS / Email copy | AI generates personalized, token-based variants |
| **Insights** | Read the analytics dashboard | AI analyzes results & proposes the *next* campaign |

Both modes operate on the **same data and the same safe execution engine** — AI is an accelerator,
not a separate silo.

---

## 🧩 Feature tour

### 🪄 AI Engagement (the primary workspace)

- **Growth Assistant** — a single input: _"What business outcome do you want?"_ Submit a goal like
  _"Win back premium customers who haven't ordered in 90 days"_ and watch a live reasoning timeline:
  **Understand → Analyze → Find audience → Design campaign → Generate messages**, ending in a fully
  **editable campaign artifact**.
- **Customer Intelligence** — every shopper is scored with an **engagement score (0–100, RFM blend)**
  and a **favorite category**. Open a customer to get an **AI Customer Card**: a natural-language
  summary, **churn-risk** rating, lifetime value, and **next-best-action** suggestions.
- **AI Segment Builder** — keep the manual filter builder *and* add **"Generate with AI"**. The AI
  proposes filters; the backend compiles them into a **safe, parameterized SQL query** (never raw
  LLM SQL) and shows the live audience count plus a **per-customer "why matched"** trace.
- **AI Campaign Builder** — review and edit the AI artifact: **Improve Message**, regenerate variants,
  refine the audience, then **Approve & Launch**. Manual campaign creation is fully supported too.
- **Personalization Engine** — copy is generated with a fixed token allow-list
  (`{{first_name}}`, `{{last_order}}`, `{{discount}}`, `{{expiry}}`, `{{brand_name}}`), substituted
  server-side — so private customer data is never exposed to the model.
- **Communications monitor** — a live execution feed: per-customer **delivery status, retries, and
  dead-letter** state.
- **Analytics & Insights** — a visual **conversion funnel** (Sent → Delivered → Opened → Clicked →
  Purchased), an **AI insights loop** with citation-validated findings and a one-click
  **"Generate Next Campaign"**, plus an **AI Decision History** of every model call (step, latency, model, validity).
- **Quick Demo tour** — an onboarding walkthrough that explains every tab and can run a full demo
  campaign for you in one click.

### 🏢 Traditional CRM (kept fully intact, secondary nav)

Multi-tenant, role-based (Admin / Manager / Sales Rep), org-scoped:

- **Sales** — Leads (capture, score, **convert** → Account + Contact + Deal), Contacts, Accounts,
  **Deals** (drag-and-drop Kanban pipeline), Activities, Notes, Tags, Timelines, global search.
- **Revenue** — Products, Price Books, Quotes, Sales Orders, Invoices, Purchase Orders (auto-numbered, server-side totals).
- **Support & Ops** — Cases (SLA deadlines), Knowledge Base, Workflow automation (rules / assignment /
  scoring), Reports & forecasting, Marketing module, Custom Fields, Web Forms, CSV Import/Export.

---

## 📸 Screenshots

> Drop your captures into `docs/screenshots/` — the paths below are pre-wired.

| Growth Assistant | AI Customer Card |
|:---:|:---:|
| ![Growth Assistant](docs/screenshots/growth.png) | ![Customer Card](docs/screenshots/customer-card.png) |

| AI Segment Builder | Campaign + Live Funnel |
|:---:|:---:|
| ![Segments](docs/screenshots/segments.png) | ![Campaign](docs/screenshots/campaign.png) |

---

## 🔄 How the AI closed loop works

```
  Business goal ("win back lapsed premium customers")
        │
        ▼
  ① Planner agent ........ classifies intent, urgency, channels, KPIs
        ▼
  ② Segment agent ........ proposes a DSL → compiled to SAFE parameterized SQL
        ▼
  ③ Campaign agent ....... designs A/B plan + writes personalized copy
        ▼
  ── editable artifact → human Approve ──
        ▼
  Transactional outbox ... Communications + Jobs written in ONE transaction
        ▼
  Outbox worker .......... SKIP LOCKED · retries w/ backoff · dead-letter queue
        ▼
  Channel service ........ simulates SENT→DELIVERED→OPENED→CLICKED→FAILED
        ▼                  (HMAC-signed receipts, out-of-order & duplicate safe)
  Funnel stats ........... cumulative, event-sourced
        ▼
  ④ Insight agent ........ citation-validated findings + a pre-filled NEXT goal
        ▼
  "Generate Next Campaign" ──► loop back to ①   (a closed learning loop)
```

Every model call is persisted to `ai_runs` (input, output, latency, model, validity) and surfaced
in the **AI Decision History**.

---

## 🏗 Architecture

```
                      ┌─────────────────────────────────────────────┐
   Browser  ──TLS──►  │  Caddy (reverse proxy)                       │
                      └───────────────┬───────────────┬─────────────┘
                                      │               │
                         ┌────────────▼──────┐  ┌──────▼───────────────┐
                         │  Frontend         │  │  Backend API         │
                         │  Next.js 14       │  │  FastAPI (async)     │
                         │  Tailwind+shadcn  │  │  JWT auth · routers  │
                         └───────────────────┘  └───┬───────────┬──────┘
                                                    │           │
                          ┌─────────────────────────▼───┐   ┌───▼──────────────┐
                          │  AI layer (/app/ai)          │   │  PostgreSQL 16   │
                          │  client · planner · segment  │   │  async SQLAlchemy│
                          │  campaign · insight · customer│  └───┬──────────────┘
                          └──────────────┬───────────────┘      │
                                         │                       │
                  ┌──────────────────────▼──────┐   ┌────────────▼─────────────┐
                  │  LLM endpoint               │   │  Outbox worker           │
                  │  Self-hosted Qwen3-8B (vLLM)│   │  (SKIP LOCKED · retries) │
                  │  …or deterministic MOCK     │   └────────────┬─────────────┘
                  └─────────────────────────────┘                │
                                                     ┌────────────▼─────────────┐
                                                     │  Channel service         │
                                                     │  delivery simulator +    │
                                                     │  HMAC-signed receipts    │
                                                     └──────────────────────────┘
```

---

## 🤖 The AI layer (swappable, by design)

All AI features run through a **single inference layer** with specialized agents — switch the
provider with **one environment variable**, no code changes.

```
app/ai/
├── client.py          # the ONLY place that knows where inference lives
│                       #   complete_json(system, user, schema) → (output, meta)
├── mock.py            # deterministic, keyword-aware offline mock (runs with no GPU)
├── prompts.py         # shared system prompt + safety rules
├── planner.py         # ① intent
├── segment_agent.py   # ② goal → safe segment DSL
├── campaign_agent.py  # ③ plan + personalized copy
├── insight_agent.py   # ④ citation-validated post-campaign insights
├── customer_agent.py  # AI Customer Card
└── pipeline.py        # thin orchestrator over the agents
```

- **Provider-agnostic** — any **OpenAI-compatible** endpoint works: a self-hosted, 4-bit quantized
  **Qwen3-8B-Instruct** behind vLLM (the production target), Ollama, TGI, or OpenAI.
- **Runs before the GPU exists** — with no endpoint configured, a **deterministic mock** produces
  schema-valid, keyword-aware output so the entire flow is demoable offline. Every response is tagged
  with its provider, so **nothing is ever passed off as real model output**.
- **Schema-validated** — each agent validates the model's JSON against a Pydantic schema and degrades
  gracefully on malformed output.

---

## 🛠 Tech stack

| Layer | Technology |
|------|-----------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts, Inter, lucide-react |
| **Backend** | FastAPI, Python 3.12, async SQLAlchemy, Pydantic v2, JWT auth (python-jose + passlib/bcrypt) |
| **Database** | PostgreSQL 16 |
| **AI** | OpenAI-compatible client → self-hosted **Qwen3-8B-Instruct (4-bit)** / deterministic mock |
| **Execution** | Transactional outbox worker + standalone channel-service simulator (HMAC receipts) |
| **Infra** | Caddy 2 (TLS reverse proxy), Docker Compose |

---

## 🚀 Getting started

### Option A — Docker Compose (full stack)

```bash
git clone <your-repo-url> compass && cd compass

cp .env.example .env
#   set POSTGRES_PASSWORD, ADMIN_SECRET, JWT_SECRET
#   (optional) set LLM_BASE_URL to your Qwen endpoint — leave blank to use the offline mock

docker compose up -d --build

# Seed demo customers + orders for the AI engagement engine:
curl -X POST http://localhost:8000/admin/seed -H "X-Admin-Secret: dev-admin-secret"

# Seed a demo CRM org (leads/deals/etc.):
curl -X POST http://localhost:8000/admin/seed-crm -H "X-Admin-Secret: dev-admin-secret"

# Open the app, log in: admin@demo.com / password
open http://localhost:3000
```

### Option B — Run on the host (development)

```bash
# 1) Backend
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://compass:<password>@localhost:5432/compass"
.venv/bin/uvicorn app.main:app --port 8000

# 2) Channel-service simulator (so launched campaigns actually "deliver")
cd ../channel-service
CRM_RECEIPT_URL=http://localhost:8000 ../backend/.venv/bin/uvicorn app.main:app --port 8001

# 3) Outbox worker (dispatches approved campaigns to the channel)
cd ../backend
CHANNEL_SERVICE_URL=http://localhost:8001 .venv/bin/python -m app.workers.outbox

# 4) Frontend
cd ../frontend
npm install && npm run build && npm start    # http://localhost:3000
```

> The first time you open the app, a **Quick Demo tour** walks you through every tab and can run a
> full campaign for you. You can replay it anytime from the **"Quick demo"** button in the top bar.

---

## 🔌 Pointing Compass at your own LLM

Switching from the offline mock to a real model is a single environment variable:

```bash
# backend env (.env)
LLM_BASE_URL=http://your-gpu-vm:8000/v1     # any OpenAI-compatible endpoint
LLM_MODEL=Qwen3-8B-Instruct
LLM_API_KEY=sk-no-auth                       # most self-hosted servers ignore this
# LLM_ENABLED=false                          # force the mock even if a URL is set
```

Restart the backend — every agent now uses your model. `GET /api/meta` and `GET /healthz` report the
active provider and model.

---

## 📁 Project structure

```
compass/
├── backend/
│   └── app/
│       ├── ai/                 # swappable LLM client + named agents + mock
│       ├── routers/            # AI engagement (customers, segments, campaigns, pipelines,
│       │                       #   events, receipts) + full CRM (leads, deals, quotes, …)
│       ├── workers/outbox.py   # transactional outbox dispatcher
│       ├── customer_metrics.py # engagement score (RFM) — one definition, reused
│       ├── models.py           # SQLAlchemy models (AI engagement + CRM core)
│       └── seed/               # demo data generators
├── channel-service/            # standalone delivery simulator (lifecycle + HMAC receipts)
├── frontend/
│   └── src/
│       ├── app/(app)/          # auth-guarded pages: growth, customers, segments,
│       │                       #   campaigns, communications, insights + CRM modules
│       ├── components/ai/       # Growth widgets, Welcome tour
│       ├── components/shell/    # sidebar + topbar
│       └── lib/                 # API client, types, auth
├── docker-compose.yml
└── Caddyfile
```

---

## 🌐 API overview

| Area | Endpoints |
|------|-----------|
| **AI pipeline** | `POST /pipelines` · `GET /pipelines/{id}/runs` |
| **Customers** | `GET /customers` · `GET /customers/{id}` · `GET /customers/{id}/ai-card` |
| **Segments** | `POST /segments/compile` · `POST /segments/generate` |
| **Campaigns** | `GET/PATCH /campaigns/{id}` · `POST /campaigns/{id}/approve` · `/improve-copy` · `/stats` · `/insights` · `/communications` |
| **Receipts** | `POST /receipts` (HMAC-signed delivery callbacks) |
| **CRM** | `/auth` · `/leads` · `/accounts` · `/contacts` · `/deals` · `/quotes` · `/invoices` · `/cases` · `/reports` · … |
| **Meta** | `GET /healthz` · `GET /api/meta` (active model/provider + AI call stats) |

Interactive docs at `http://localhost:8000/docs`.

---

## 💡 Engineering highlights

- **Swappable inference, one variable** — a single `complete_json()` entry point routes to a real
  OpenAI-compatible endpoint or a deterministic offline mock; agents never know which.
- **No raw LLM SQL** — the AI proposes a DSL over an allow-list of fields; a fixed registry compiles
  it to a **parameterized** query. The model never touches the database.
- **Zero-PII audience reasoning** — planning/segmentation see aggregates only; personalization uses a
  token allow-list substituted server-side.
- **Transactional outbox + idempotency** — communications and jobs are written in one transaction;
  the worker uses `SELECT … FOR UPDATE SKIP LOCKED` for safe concurrency, with retry/backoff and a
  dead-letter queue. UNIQUE constraints make customer/communication/event handling idempotent, so
  **duplicate and out-of-order delivery receipts are safe**.
- **Citation-validated insights** — every number in an AI finding must appear in the real campaign
  stats before it's accepted, preventing hallucinated metrics.
- **Explainable by default** — per-customer "why matched" traces, a provider tag on every AI response,
  and a full **AI Decision History** persisted to `ai_runs`.

---

## 🗺 Roadmap

- [x] Swappable AI inference layer (Qwen / mock) with named agents
- [x] Customer intelligence (engagement score, AI customer card)
- [x] AI segment builder, campaign builder, insights loop
- [x] Transactional execution engine + delivery simulator
- [x] AI-native UI + onboarding tour, with the full CRM preserved
- [ ] Streaming token-by-token reasoning in the Growth Assistant
- [ ] Authenticated, org-scoped AI engagement endpoints
- [ ] Real channel providers (WhatsApp Business / SMS / SES) behind the same interface
- [ ] Autonomous agent mode (AI proposes campaigns proactively from data drift)

---

## 👤 Author

<div align="center">

**Made with ❤️ by Dhruv Jyoti Das**

Released under the [MIT License](LICENSE).

</div>
