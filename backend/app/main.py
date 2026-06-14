"""Compass CRM — FastAPI application entry point."""
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import engine, get_db
from app.models import Base
from app.routers import campaigns, customers, events, pipelines, receipts, segments
from app.routers import (
    accounts,
    activities,
    auth_router,
    contacts,
    dashboard,
    deal_pipelines,
    deals,
    leads,
    notes,
    search,
    users,
)
from app.routers import (
    cases,
    invoices,
    price_books,
    products,
    purchase_orders,
    quotes,
    sales_orders,
    sla_policies,
    solutions,
)
from app.routers import (
    assignment_rules,
    scoring_rules,
    workflow_rules,
)
from app.routers import (
    custom_fields,
    email_templates,
    goals,
    import_export,
    marketing_campaigns,
    reports,
    web_forms,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("compass")

app = FastAPI(title="Compass CRM", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Rate limiting wiring
app.state.limiter = receipts.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Legacy AI-campaign modules (set aside, kept intact) ──────────────────────
app.include_router(customers.router)
app.include_router(segments.router)
app.include_router(campaigns.router)
app.include_router(events.router)
app.include_router(events.global_router)
app.include_router(pipelines.router)
app.include_router(receipts.router)

# ── CRM core modules ─────────────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(leads.router)
app.include_router(accounts.router)
app.include_router(contacts.router)
app.include_router(deal_pipelines.router)
app.include_router(deals.router)
app.include_router(activities.router)
app.include_router(notes.router)
app.include_router(search.router)
app.include_router(dashboard.router)

# ── P2 — Sales Documents ──────────────────────────────────────────────────────
app.include_router(products.router)
app.include_router(price_books.router)
app.include_router(quotes.router)
app.include_router(sales_orders.router)
app.include_router(invoices.router)
app.include_router(purchase_orders.router)

# ── P3 — Support ──────────────────────────────────────────────────────────────
app.include_router(sla_policies.router)
app.include_router(cases.router)
app.include_router(solutions.router)

# ── P4 — Workflow Automation ──────────────────────────────────────────────────
app.include_router(workflow_rules.router)
app.include_router(assignment_rules.router)
app.include_router(scoring_rules.router)

# ── P5 — Reports & Goals ──────────────────────────────────────────────────────
app.include_router(reports.router)
app.include_router(goals.router)

# ── P6 — Marketing ────────────────────────────────────────────────────────────
app.include_router(email_templates.router)
app.include_router(marketing_campaigns.router)

# ── P7 — Custom Fields, Web Forms, Import/Export ──────────────────────────────
app.include_router(custom_fields.router)
app.include_router(web_forms.router)
app.include_router(import_export.router)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Compass CRM started — model: %s · cors: %s", settings.gemma_model, settings.cors_origins)


@app.get("/healthz")
async def healthz(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "model": settings.gemma_model}


@app.get("/api/meta")
async def meta(db: AsyncSession = Depends(get_db)):
    """Expose model + cumulative cache savings to the UI."""
    cache_stats_sql = text("""
        SELECT
            COALESCE(SUM((output->'_meta'->>'cache_read_tokens')::int), 0) AS cache_hits,
            COALESCE(SUM((output->'_meta'->>'input_tokens')::int), 0) AS total_input,
            COUNT(*) AS total_calls
        FROM ai_runs
        WHERE output ? '_meta'
    """)
    try:
        row = (await db.execute(cache_stats_sql)).fetchone()
        cache_hits = row.cache_hits or 0
        total_input = row.total_input or 0
        total_calls = row.total_calls or 0
        cache_hit_rate = round(cache_hits / max(total_input + cache_hits, 1) * 100, 1)
    except Exception:
        cache_hits = total_input = total_calls = 0
        cache_hit_rate = 0.0

    return {
        "model": settings.gemma_model,
        "provider": "Anthropic API",
        "version": "1.0.0",
        "cache_hit_rate_pct": cache_hit_rate,
        "total_ai_calls": total_calls,
        "tokens_saved": cache_hits,
    }


def _require_admin(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(403, "Forbidden")


@app.post("/admin/seed", dependencies=[Depends(_require_admin)])
async def admin_seed(db: AsyncSession = Depends(get_db)):
    from app.seed.generate import seed
    return await seed(db)


@app.post("/admin/seed-crm", dependencies=[Depends(_require_admin)])
async def admin_seed_crm(db: AsyncSession = Depends(get_db)):
    from app.seed.crm import seed_crm
    return await seed_crm(db)


@app.post("/admin/demo-reset", dependencies=[Depends(_require_admin)])
async def demo_reset(db: AsyncSession = Depends(get_db)):
    """Reset all campaign/communication data while keeping customers+orders."""
    await db.execute(text("DELETE FROM communication_events"))
    await db.execute(text("DELETE FROM outbox_jobs"))
    await db.execute(text("DELETE FROM communications"))
    await db.execute(text("DELETE FROM ai_runs"))
    await db.execute(text("DELETE FROM campaigns"))
    await db.execute(text("UPDATE orders SET attributed_communication_id = NULL"))
    await db.commit()
    return {"status": "reset", "message": "All campaign data cleared, customers/orders intact."}
