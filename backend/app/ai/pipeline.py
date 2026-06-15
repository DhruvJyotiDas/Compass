"""Pipeline orchestrator — sequences the named agents into the Growth-Assistant flow.

This module is intentionally thin: each step lives in its own agent (planner, segment_agent,
campaign_agent, insight_agent). `run_pipeline` streams step events; `run_insights` runs step 5.
The public signatures are unchanged so `routers/pipelines.py` and `routers/campaigns.py` keep working.
"""
import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from app.ai import campaign_agent, planner, segment_agent
from app.ai.insight_agent import analyze as _analyze


async def run_pipeline(
    goal_text: str,
    audience_summary: dict | None = None,
    offer: str | None = None,
) -> AsyncGenerator[dict, None]:
    """Yield step events: {pipeline_id, step, output, meta, valid}.

    Step 1 (intent) runs first; steps 2 (segment) and 3 (plan) depend only on intent so they run
    CONCURRENTLY; step 4 (copy) needs the plan. `offer` is the incentive gathered in conversation —
    threaded into plan + copy so the campaign isn't always a generic discount.
    """
    pipeline_id = str(uuid.uuid4())
    context: dict[str, Any] = {}

    # ── Step 1: Intent ────────────────────────────────────────────────────────
    intent, meta, valid = await planner.classify_intent(goal_text)
    # Persist the conversational offer on the intent so it survives onto the campaign record;
    # the approve step reads it back to fill {{discount}}/{{percentage}} tokens at send time.
    if offer:
        intent = {**intent, "offer": offer}
    context["intent"] = intent
    yield {"pipeline_id": pipeline_id, "step": "intent", "output": intent, "meta": meta, "valid": valid}

    # ── Steps 2 + 3 in parallel (both depend only on intent) ──────────────────
    seg_task = asyncio.create_task(segment_agent.generate_segment(goal_text, intent))
    plan_task = asyncio.create_task(
        campaign_agent.design_plan(goal_text, intent, audience_summary, offer))

    dsl, meta, valid = await seg_task
    context["segment_dsl"] = dsl
    yield {"pipeline_id": pipeline_id, "step": "segment_dsl", "output": dsl, "meta": meta, "valid": valid}

    plan, meta, valid = await plan_task
    context["plan"] = plan
    yield {"pipeline_id": pipeline_id, "step": "campaign_plan", "output": plan, "meta": meta, "valid": valid}

    # ── Step 4: Message Copy ──────────────────────────────────────────────────
    copy, meta, valid = await campaign_agent.write_copy(
        plan, dsl.get("audience_description", ""), offer=offer)
    context["message_variants"] = copy["variants"]
    yield {"pipeline_id": pipeline_id, "step": "message_copy",
           "output": {"variants": copy["variants"]}, "meta": meta, "valid": valid}

    yield {"pipeline_id": pipeline_id, "step": "done", "output": context, "meta": {"latency_ms": 0}, "valid": True}


async def run_insights(campaign_id: str, stats: dict) -> dict:
    """Step 5: post-campaign AI insights with citation validation."""
    return await _analyze(stats)
