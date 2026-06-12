"""5-step Claude AI pipeline with prompt caching and per-step streaming."""
import json
import re
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from pydantic import ValidationError

from app.ai.client import MODEL, client
from app.ai.schemas import (
    CampaignPlanOutput,
    InsightsOutput,
    IntentOutput,
    MessageCopyOutput,
    SegmentDSLOutput,
)
from app.config import settings

# ── System prompt (cached — sent once, reused across calls) ───────────────────
_SYSTEM_PROMPT = """You are Compass, an AI assistant for a Direct-to-Consumer marketing CRM.
You help brand marketers plan and execute campaigns by analysing their goals and customer data.

Available customer segment fields:
- last_order_at: date of last order (supports ops: days_ago_gt, days_ago_lt)
- lifetime_spend: total INR spent by customer (supports ops: gte, lte)
- order_count: number of orders placed (supports ops: gte, lte)

Rules you must follow:
1. You NEVER see individual customer PII. Audience data is aggregates only.
2. Message copy uses {{token}} placeholders only: {{first_name}}, {{last_order}}, {{discount}}, {{expiry}}, {{brand_name}}.
3. Segment filters must only use the fields listed above.
4. split_pct values across variants must sum exactly to 100.
5. Return valid JSON matching the schema requested. No prose, no markdown fences.
"""

STEPS = ["intent", "segment_dsl", "campaign_plan", "message_copy", "insights"]


def _cache_text(text: str) -> dict:
    return {"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}


async def _call_claude(user_content: str, schema_example: str) -> tuple[str, int]:
    """Call Claude with prompt caching on the system prompt."""
    t0 = time.monotonic()
    response = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=[_cache_text(_SYSTEM_PROMPT)],
        messages=[
            {
                "role": "user",
                "content": f"{user_content}\n\nReturn ONLY valid JSON matching this schema:\n{schema_example}",
            }
        ],
    )
    latency_ms = int((time.monotonic() - t0) * 1000)
    raw = response.content[0].text.strip()
    # Strip any accidental markdown fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw, latency_ms


def _extract_numbers(text: str) -> set[float]:
    return {float(m) for m in re.findall(r"\d+(?:\.\d+)?", text)}


def _validate_citations(findings: list[str], stats: dict) -> bool:
    """Ensure every number in insights findings actually appears in the input stats."""
    stat_numbers = _extract_numbers(json.dumps(stats))
    for finding in findings:
        cited = _extract_numbers(finding)
        if not all(c in stat_numbers for c in cited):
            return False
    return True


async def run_pipeline(
    goal_text: str,
    audience_summary: dict | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Yields step events: {pipeline_id, step, output, latency_ms, valid}
    Steps 1-4 run sequentially. Step 5 (insights) is called separately after dispatch.
    """
    pipeline_id = str(uuid.uuid4())
    context: dict[str, Any] = {}

    # ── Step 1: Intent ────────────────────────────────────────────────────────
    schema = IntentOutput.model_json_schema()
    raw, latency = await _call_claude(
        f"Goal: {goal_text}\n\nClassify the marketer's intent and extract campaign parameters.",
        json.dumps(schema, indent=2),
    )
    try:
        intent_out = IntentOutput.model_validate_json(raw)
        context["intent"] = intent_out.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "intent", "output": context["intent"], "latency_ms": latency, "valid": True}
    except (ValidationError, Exception) as e:
        fallback = IntentOutput(
            intent="win_back_inactive", urgency="medium", channels=["whatsapp", "email"],
            audience_description="Inactive customers", kpis=["open_rate", "conversions"],
            campaign_name="Re-engagement Campaign",
        )
        context["intent"] = fallback.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "intent", "output": context["intent"], "latency_ms": latency, "valid": False}

    # ── Step 2: Segment DSL ───────────────────────────────────────────────────
    prompt = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(context['intent'])}\n\n"
        "Generate the segment DSL using ONLY the allowed fields: last_order_at, lifetime_spend, order_count."
    )
    schema = SegmentDSLOutput.model_json_schema()
    raw, latency = await _call_claude(prompt, json.dumps(schema, indent=2))
    try:
        dsl_out = SegmentDSLOutput.model_validate_json(raw)
        context["segment_dsl"] = dsl_out.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "segment_dsl", "output": context["segment_dsl"], "latency_ms": latency, "valid": True}
    except (ValidationError, Exception):
        fallback = SegmentDSLOutput(
            filters=[{"field": "last_order_at", "op": "days_ago_gt", "value": 60}],
            logic="AND",
            audience_description="Customers inactive for 60+ days",
        )
        context["segment_dsl"] = fallback.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "segment_dsl", "output": context["segment_dsl"], "latency_ms": latency, "valid": False}

    # ── Step 3: Campaign Plan ─────────────────────────────────────────────────
    # Only send aggregates — zero PII
    aud = audience_summary or {"count": "unknown", "avg_spend": "unknown"}
    prompt = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(context['intent'])}\n"
        f"Audience summary (aggregates only): {json.dumps(aud)}\n\n"
        "Design the campaign plan: channels, A/B split, guardrails."
    )
    schema = CampaignPlanOutput.model_json_schema()
    raw, latency = await _call_claude(prompt, json.dumps(schema, indent=2))
    try:
        plan_out = CampaignPlanOutput.model_validate_json(raw)
        context["plan"] = plan_out.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "campaign_plan", "output": context["plan"], "latency_ms": latency, "valid": True}
    except (ValidationError, Exception):
        fallback = CampaignPlanOutput(
            variants=[
                {"variant_id": "A", "channel": "whatsapp", "split_pct": 50, "name": "WhatsApp Outreach"},
                {"variant_id": "B", "channel": "email", "split_pct": 50, "name": "Email Re-engagement"},
            ],
            ab_test=True, send_window="09:00-21:00 IST", daily_cap=5000,
            rationale="Default balanced split across WhatsApp and Email.",
        )
        context["plan"] = fallback.model_dump()
        yield {"pipeline_id": pipeline_id, "step": "campaign_plan", "output": context["plan"], "latency_ms": latency, "valid": False}

    # ── Step 4: Message Copy ──────────────────────────────────────────────────
    # Copywriter sees ZERO individual customer data — only segment description
    prompt = (
        f"Plan: {json.dumps(context['plan'])}\n"
        f"Audience: {context['segment_dsl']['audience_description']}\n"
        f"Brand: A D2C fashion/lifestyle brand (India).\n\n"
        "Write personalised message copy for each variant. "
        "Use ONLY these tokens: {{first_name}}, {{last_order}}, {{discount}}, {{expiry}}, {{brand_name}}. "
        "WhatsApp: max 300 chars. Email: subject + body."
    )
    schema = MessageCopyOutput.model_json_schema()
    raw, latency = await _call_claude(prompt, json.dumps(schema, indent=2))
    try:
        copy_out = MessageCopyOutput.model_validate_json(raw)
        context["message_variants"] = copy_out.model_dump()["variants"]
        yield {"pipeline_id": pipeline_id, "step": "message_copy", "output": {"variants": context["message_variants"]}, "latency_ms": latency, "valid": True}
    except (ValidationError, Exception):
        context["message_variants"] = [
            {"variant_id": "A", "channel": "whatsapp", "subject": None,
             "body": "Hi {{first_name}}! It's been a while — we miss you. Here's a special offer just for you 🎁 Use code {{discount}} before {{expiry}}.",
             "tokens_used": ["{{first_name}}", "{{discount}}", "{{expiry}}"]},
            {"variant_id": "B", "channel": "email",
             "subject": "{{first_name}}, a little something to welcome you back",
             "body": "Hi {{first_name}},\n\nWe noticed you haven't ordered since {{last_order}}. We'd love to have you back!\n\nUse {{discount}} at checkout — valid until {{expiry}}.\n\nWarm regards,\n{{brand_name}} Team",
             "tokens_used": ["{{first_name}}", "{{last_order}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
        ]
        yield {"pipeline_id": pipeline_id, "step": "message_copy", "output": {"variants": context["message_variants"]}, "latency_ms": latency, "valid": False}

    yield {"pipeline_id": pipeline_id, "step": "done", "output": context, "latency_ms": 0, "valid": True}


async def run_insights(campaign_id: str, stats: dict) -> dict:
    """Step 5: Post-campaign AI insights with citation validation."""
    prompt = (
        f"Campaign stats: {json.dumps(stats)}\n\n"
        "Analyse campaign performance and produce findings with a recommended next action. "
        "Every number you cite in findings MUST appear in the stats above."
    )
    schema = InsightsOutput.model_json_schema()

    for attempt in range(2):
        raw, latency = await _call_claude(prompt, json.dumps(schema, indent=2))
        try:
            out = InsightsOutput.model_validate_json(raw)
            valid = _validate_citations(out.findings, stats)
            if valid or attempt == 1:
                return {"output": out.model_dump(), "valid": valid, "latency_ms": latency}
        except (ValidationError, Exception):
            pass

    # Fallback template
    return {
        "output": InsightsOutput(
            findings=[f"Campaign reached {stats.get('sent', 0)} customers."],
            next_action="Review delivery rates and plan follow-up.",
            next_goal="Follow up with customers who opened but didn't click",
            confidence="low",
            best_variant=None,
        ).model_dump(),
        "valid": False,
        "latency_ms": 0,
    }
