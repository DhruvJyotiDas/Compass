"""Compass CRM — FastAPI application entry point."""
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import engine, get_db
from app.models import Base
from app.routers import campaigns, customers, events, pipelines, receipts, segments

log = logging.getLogger("compass")

app = FastAPI(title="Compass CRM", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router)
app.include_router(segments.router)
app.include_router(campaigns.router)
app.include_router(events.router)
app.include_router(pipelines.router)
app.include_router(receipts.router)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Compass CRM started — model: %s", settings.claude_model)


@app.get("/healthz")
async def healthz(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "model": settings.claude_model}


@app.get("/api/meta")
async def meta():
    return {
        "model": settings.claude_model,
        "provider": "Anthropic API",
        "version": "1.0.0",
    }


def _require_admin(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(403, "Forbidden")


@app.post("/admin/seed", dependencies=[Depends(_require_admin)])
async def admin_seed(db: AsyncSession = Depends(get_db)):
    from app.seed.generate import seed
    return await seed(db)


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
