"""Conversational assistant endpoint.

`GET /assistant/stream?message=` is an SSE stream that:
  - classifies the message (campaign vs. general answer),
  - emits a `mode` event so the UI knows what's coming,
  - for an ANSWER: streams the reply token-by-token (`token` events) — the "typewriter" effect,
  - for a CAMPAIGN: runs the 4-step pipeline, emitting one `step` event per stage, then a `done`
    event carrying the new campaign_id (the UI links to it for review/approve).

A campaign is ONLY built when the user explicitly asks; otherwise the assistant just answers.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.ai import assistant_agent
from app.ai.client import stream_text
from app.ai.customer_agent import customer_card
from app.ai.pipeline import run_pipeline
from app.ai.segment_agent import generate_segment as ai_generate_segment
from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Customer
from app.routers.pipelines import _build_run, _finalize_campaign
from app.routers.segments import _build_sql, _validate_dsl
from app.schemas import DSLFilter

router = APIRouter(prefix="/assistant", tags=["assistant"])

_CHANNELS = {"email", "sms", "whatsapp"}


_PRONOUNS = {
    "", "this customer", "this", "that customer", "that", "the customer", "customer",
    "him", "her", "them", "this person", "that person", "this particular customer",
    "the person", "they", "he", "she",
}


def _needs_name(name: str | None) -> bool:
    """True when the request refers to a customer but gives no usable name (e.g. 'this customer')."""
    return (name or "").strip().lower() in _PRONOUNS


def _days_since(last_order_at) -> int | None:
    if not last_order_at:
        return None
    return (datetime.now(timezone.utc) - last_order_at.replace(tzinfo=timezone.utc)).days


async def _find_customer(db: AsyncSession, name: str | None):
    """Resolve a free-text customer name to one row (exact match wins, else best ILIKE)."""
    if not name or not name.strip():
        return None
    q = name.strip()
    rows = (await db.execute(text(
        "SELECT id, name, email, phone, favorite_category, order_count, lifetime_spend, "
        "engagement_score, last_order_at, opted_out FROM customers "
        "WHERE name ILIKE :exact OR name ILIKE :like "
        "ORDER BY (name ILIKE :exact) DESC, lifetime_spend DESC LIMIT 1"
    ), {"exact": q, "like": f"%{q}%"})).fetchall()
    return rows[0] if rows else None


async def _customer_history(db: AsyncSession, customer_id: str, channel: str | None, limit: int) -> list[dict]:
    sql = ("SELECT c.channel, c.subject, c.message, c.status, c.created_at, "
           "ca.name AS campaign_name "
           "FROM communications c LEFT JOIN campaigns ca ON ca.id = c.campaign_id "
           "WHERE c.customer_id = :cid")
    params: dict[str, Any] = {"cid": customer_id, "lim": limit}
    if channel in _CHANNELS:
        sql += " AND c.channel = :ch"
        params["ch"] = channel
    sql += " ORDER BY c.created_at DESC LIMIT :lim"
    rows = (await db.execute(text(sql), params)).fetchall()
    return [
        {"channel": r.channel, "subject": r.subject, "message": r.message, "status": r.status,
         "created_at": r.created_at.isoformat() if r.created_at else None,
         "campaign_name": r.campaign_name or "Direct message"}
        for r in rows
    ]


async def _list_customers(db: AsyncSession, message: str, limit: int = 25) -> dict:
    """Translate a 'show me customers …' request into a segment and return real matching rows."""
    dsl, _, _ = await ai_generate_segment(message)
    raw = dsl.get("filters", [])
    if not raw:
        return {"unsupported": True, "filters": [], "count": 0, "customers": [],
                "description": dsl.get("audience_description", "")}
    filters = [DSLFilter(**f) for f in raw]
    _validate_dsl(filters)
    where, params = _build_sql(filters, dsl.get("logic", "AND"))
    count = (await db.execute(text(f"SELECT COUNT(*) FROM customers WHERE {where}"), params)).scalar()
    rows = (await db.execute(text(
        f"SELECT name, email, lifetime_spend, order_count, favorite_category, engagement_score "
        f"FROM customers WHERE {where} ORDER BY lifetime_spend DESC LIMIT {limit}"
    ), params)).fetchall()
    return {
        "unsupported": False,
        "filters": raw,
        "logic": dsl.get("logic", "AND"),
        "description": dsl.get("audience_description", ""),
        "count": count,
        "customers": [
            {"name": r.name, "email": r.email, "lifetime_spend": float(r.lifetime_spend),
             "order_count": r.order_count, "favorite_category": r.favorite_category,
             "engagement_score": r.engagement_score}
            for r in rows
        ],
    }


async def _crm_context(db: AsyncSession) -> str:
    """A compact live snapshot so the assistant can answer questions about the user's own data."""
    row = (await db.execute(text(
        "SELECT COUNT(*) AS total, "
        "COUNT(*) FILTER (WHERE opted_out = false) AS reachable, "
        "ROUND(AVG(engagement_score)) AS avg_eng, "
        "ROUND(AVG(lifetime_spend)) AS avg_spend, "
        "MAX(lifetime_spend) AS max_spend "
        "FROM customers"
    ))).fetchone()
    cats = (await db.execute(text(
        "SELECT favorite_category, COUNT(*) AS c FROM customers "
        "GROUP BY favorite_category ORDER BY c DESC"
    ))).fetchall()
    campaigns = (await db.execute(text("SELECT COUNT(*) FROM campaigns"))).scalar()
    cat_str = ", ".join(f"{r.favorite_category} ({r.c})" for r in cats if r.favorite_category)
    return (
        "LIVE CRM SNAPSHOT (use for any data question):\n"
        f"- Customers: {row.total} total, {row.reachable} reachable (not opted out)\n"
        f"- Engagement: avg {row.avg_eng}/100. Lifetime spend: avg ₹{row.avg_spend}, "
        f"top spender ₹{row.max_spend}\n"
        f"- Favorite categories (count): {cat_str}\n"
        f"- Campaigns created so far: {campaigns}\n"
        "- Segments can target: last-order recency, lifetime spend (₹), order count, "
        "engagement score (0–100), favorite category."
    )


def _transcript(history: str | None, message: str) -> str:
    """Build a compact conversation transcript for the context-aware agents."""
    lines: list[str] = []
    if history:
        try:
            for m in json.loads(history)[-6:]:
                role = "User" if m.get("role") == "user" else "Assistant"
                lines.append(f"{role}: {str(m.get('content', ''))[:600]}")
        except Exception:
            pass
    lines.append(f"User: {message}")
    return "\n".join(lines)


async def _stream_words(text: str):
    """Yield a string word-by-word as SSE token events (typewriter feel)."""
    import asyncio
    for word in text.split(" "):
        yield {"event": "token", "data": json.dumps({"text": word + " "})}
        await asyncio.sleep(0.012)


@router.get("/stream")
async def assistant_stream(message: str, history: str | None = None):
    async def gen():
        async with AsyncSessionLocal() as db:
            try:
                transcript = _transcript(history, message)
                route = await assistant_agent.route_message(transcript)
                action = route.get("action", "answer")

                # ── List customers: return real matching rows ──────────────────────
                if action == "list":
                    yield {"event": "mode", "data": json.dumps({"mode": "list"})}
                    result = await _list_customers(db, message)
                    yield {"event": "customers", "data": json.dumps(result)}
                    yield {"event": "done", "data": json.dumps({"mode": "list"})}
                    return

                # ── History: past messages already sent to one customer ────────────
                if action == "history":
                    name = route.get("customer_name")
                    if _needs_name(name):
                        yield {"event": "mode", "data": json.dumps({"mode": "answer"})}
                        async for ev in _stream_words(
                            "Which customer do you mean? Tell me their name — e.g. “show the last 2 "
                            "emails I sent to Aarav Sharma”."
                        ):
                            yield ev
                        yield {"event": "done", "data": json.dumps({"mode": "answer"})}
                        return
                    yield {"event": "mode", "data": json.dumps({"mode": "history"})}
                    cust = await _find_customer(db, name)
                    if not cust:
                        yield {"event": "history", "data": json.dumps(
                            {"not_found": True, "customer_name": route.get("customer_name")})}
                    else:
                        channel = (route.get("channel") or "any").lower()
                        limit = max(1, min(int(route.get("limit") or 5), 20))
                        items = await _customer_history(db, str(cust.id), channel, limit)
                        yield {"event": "history", "data": json.dumps(
                            {"customer_id": str(cust.id), "customer_name": cust.name,
                             "channel": channel, "items": items})}
                    yield {"event": "done", "data": json.dumps({"mode": "history"})}
                    return

                # ── Add a customer to the database ─────────────────────────────────
                if action == "add_customer":
                    yield {"event": "mode", "data": json.dumps({"mode": "add_customer"})}
                    name = (route.get("new_name") or route.get("customer_name") or "").strip()
                    if not name:
                        async for ev in _stream_words(
                            "Sure — what's the customer's name? You can also include their email and "
                            "phone, e.g. “add customer Rahul Sharma, rahul@email.com, 9876543210”."
                        ):
                            yield ev
                        yield {"event": "done", "data": json.dumps({"mode": "answer"})}
                        return
                    cust = Customer(
                        external_id=f"chat_{uuid.uuid4().hex[:16]}",
                        name=name,
                        email=route.get("new_email"),
                        phone=route.get("new_phone"),
                    )
                    db.add(cust)
                    await db.commit()
                    await db.refresh(cust)
                    yield {"event": "customer_added", "data": json.dumps(
                        {"id": str(cust.id), "name": cust.name, "email": cust.email,
                         "phone": cust.phone})}
                    yield {"event": "done", "data": json.dumps({"mode": "add_customer"})}
                    return

                # ── Profile + suggested personalized message (ready to send) ───────
                if action == "profile":
                    name = route.get("customer_name")
                    if _needs_name(name):
                        yield {"event": "mode", "data": json.dumps({"mode": "answer"})}
                        async for ev in _stream_words(
                            "Whose profile would you like to see? Tell me the customer's name and I'll "
                            "pull it up with a personalized message you can send."
                        ):
                            yield ev
                        yield {"event": "done", "data": json.dumps({"mode": "answer"})}
                        return
                    yield {"event": "mode", "data": json.dumps({"mode": "profile"})}
                    cust = await _find_customer(db, name)
                    if not cust:
                        yield {"event": "profile", "data": json.dumps(
                            {"not_found": True, "customer_name": route.get("customer_name")})}
                        yield {"event": "done", "data": json.dumps({"mode": "profile"})}
                        return
                    days = _days_since(cust.last_order_at)
                    facts = {
                        "name": cust.name, "favorite_category": cust.favorite_category,
                        "order_count": cust.order_count, "lifetime_spend": float(cust.lifetime_spend),
                        "days_since_last": days if days is not None else 0,
                        "engagement_score": cust.engagement_score,
                    }
                    card, _, _ = await customer_card(facts)
                    draft, _, _ = await assistant_agent.personalized_message(
                        {**facts, "brand_name": settings.brand_name, "channel": "email"})
                    yield {"event": "profile", "data": json.dumps({
                        "customer": {
                            "id": str(cust.id), "name": cust.name, "email": cust.email,
                            "phone": cust.phone, "favorite_category": cust.favorite_category,
                            "order_count": cust.order_count, "lifetime_spend": float(cust.lifetime_spend),
                            "engagement_score": cust.engagement_score, "days_since_last": days,
                            "opted_out": cust.opted_out,
                        },
                        "card": card,
                        "draft": {"channel": draft.get("channel", "email"),
                                  "subject": draft.get("subject"), "body": draft.get("body", "")},
                    })}
                    yield {"event": "done", "data": json.dumps({"mode": "profile"})}
                    return

                # ── Campaign: gather a brief first; only build once we know the offer ──
                if action == "campaign":
                    brief = await assistant_agent.campaign_brief(transcript)
                    if not brief.get("ready"):
                        # Multi-turn: ask what to offer / who to target (don't build yet).
                        yield {"event": "mode", "data": json.dumps({"mode": "answer"})}
                        question = brief.get("question") or (
                            "What would you like to offer your customers — a discount, free "
                            "shipping, a free gift, or early access? And who should we target?")
                        async for ev in _stream_words(question):
                            yield ev
                        yield {"event": "done", "data": json.dumps({"mode": "answer"})}
                        return

                    yield {"event": "mode", "data": json.dumps({"mode": "campaign"})}
                    goal = brief.get("goal") or message
                    offer = brief.get("offer")
                    pipeline_id = str(uuid.uuid4())
                    steps_data: dict[str, Any] = {}
                    async for event in run_pipeline(goal, offer=offer):
                        if event["step"] == "done":
                            break
                        steps_data[event["step"]] = event
                        db.add(_build_run(pipeline_id, goal, event))
                        await db.commit()
                        yield {"event": "step", "data": json.dumps(event)}
                    campaign = await _finalize_campaign(db, pipeline_id, goal, steps_data)
                    yield {"event": "done", "data": json.dumps(
                        {"mode": "campaign", "pipeline_id": pipeline_id,
                         "campaign_id": campaign.id, "campaign_name": campaign.name})}
                    return

                # ── General answer: stream tokens ──────────────────────────────────
                yield {"event": "mode", "data": json.dumps({"mode": "answer"})}
                system = assistant_agent.ANSWER_SYSTEM + "\n\n" + await _crm_context(db)
                async for delta in stream_text(system, transcript):
                    yield {"event": "token", "data": json.dumps({"text": delta})}
                yield {"event": "done", "data": json.dumps({"mode": "answer"})}
            except Exception as exc:
                yield {"event": "error", "data": json.dumps({"detail": str(exc)})}

    return EventSourceResponse(gen())
