"""5-step Gemma AI pipeline — JSON-mode structured output with citation validation."""
import json
import re
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from pydantic import BaseModel, ValidationError

from app.ai.client import MODEL, client
from app.ai.schemas import (
    CampaignPlanOutput,
    InsightsOutput,
    IntentOutput,
    MessageCopyOutput,
    SegmentDSLOutput,
)

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
5. Respond with ONLY a valid JSON object matching the schema given. No markdown, no explanation."""


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw


async def _call_gemma_json(
    user_content: str,
    tool_description: str,
    schema: type[BaseModel],
) -> tuple[dict, dict]:
    """
    Call Gemma via Ollama with JSON mode.
    Returns (output_dict, meta_dict).
    """
    json_schema = schema.model_json_schema()
    schema_str = json.dumps(json_schema, indent=2)

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"Task: {tool_description}\n\n"
        f"JSON schema to follow exactly:\n{schema_str}\n\n"
        f"{user_content}"
    )

    t0 = time.monotonic()
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    raw = (response.choices[0].message.content or "{}").strip()
    output = json.loads(_strip_fences(raw))

    usage = response.usage
    meta = {
        "latency_ms": latency_ms,
        "input_tokens": usage.prompt_tokens if usage else 0,
        "output_tokens": usage.completion_tokens if usage else 0,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
    }
    return output, meta


def _extract_numbers(text: str) -> set[float]:
    return {float(m) for m in re.findall(r"\d+(?:\.\d+)?", text)}


def _validate_citations(findings: list[str], stats: dict) -> bool:
    stat_numbers = _extract_numbers(json.dumps(stats))
    for finding in findings:
        cited = _extract_numbers(finding)
        if not all(c in stat_numbers for c in cited):
            return False
    return True


async def _safe_validate(model_cls, output: dict):
    try:
        return model_cls.model_validate(output), True
    except (ValidationError, Exception):
        return None, False


async def run_pipeline(
    goal_text: str,
    audience_summary: dict | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Yields step events: {pipeline_id, step, output, meta, valid}
    Steps 1-4 run sequentially.
    """
    pipeline_id = str(uuid.uuid4())
    context: dict[str, Any] = {}

    # ── Step 1: Intent ────────────────────────────────────────────────────────
    output, meta = await _call_gemma_json(
        f"Goal: {goal_text}\n\nClassify the marketer's intent and extract campaign parameters.",
        "Classify campaign intent, urgency, channels, audience description, KPIs, and a short campaign name.",
        IntentOutput,
    )
    parsed, valid = await _safe_validate(IntentOutput, output)
    if not valid:
        parsed = IntentOutput(
            intent="win_back_inactive", urgency="medium", channels=["whatsapp", "email"],
            audience_description="Inactive customers", kpis=["open_rate", "conversions"],
            campaign_name="Re-engagement Campaign",
        )
    context["intent"] = parsed.model_dump()
    yield {"pipeline_id": pipeline_id, "step": "intent", "output": context["intent"], "meta": meta, "valid": valid}

    # ── Step 2: Segment DSL ───────────────────────────────────────────────────
    prompt = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(context['intent'])}\n\n"
        "Generate the segment DSL using ONLY the allowed fields: last_order_at, lifetime_spend, order_count. "
        "Use at most 4 filters."
    )
    output, meta = await _call_gemma_json(
        prompt,
        "Define the segment DSL: list of filters with field/op/value, logic operator, and a one-line audience description.",
        SegmentDSLOutput,
    )
    parsed, valid = await _safe_validate(SegmentDSLOutput, output)
    if not valid:
        parsed = SegmentDSLOutput(
            filters=[{"field": "last_order_at", "op": "days_ago_gt", "value": 60}],
            logic="AND",
            audience_description="Customers inactive for 60+ days",
        )
    context["segment_dsl"] = parsed.model_dump()
    yield {"pipeline_id": pipeline_id, "step": "segment_dsl", "output": context["segment_dsl"], "meta": meta, "valid": valid}

    # ── Step 3: Campaign Plan ─────────────────────────────────────────────────
    aud = audience_summary or {"count": "unknown", "avg_spend": "unknown"}
    prompt = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(context['intent'])}\n"
        f"Audience summary (aggregates only, NO PII): {json.dumps(aud)}\n\n"
        "Design the campaign plan: pick 1-2 channels with an A/B split summing to 100%, "
        "include guardrails (send window, daily cap), and a short rationale."
    )
    output, meta = await _call_gemma_json(
        prompt,
        "Define the campaign plan: variants with channel and split_pct (sum to 100), send window, daily cap, rationale.",
        CampaignPlanOutput,
    )
    parsed, valid = await _safe_validate(CampaignPlanOutput, output)
    if not valid:
        parsed = CampaignPlanOutput(
            variants=[
                {"variant_id": "A", "channel": "whatsapp", "split_pct": 50, "name": "WhatsApp Outreach"},
                {"variant_id": "B", "channel": "email", "split_pct": 50, "name": "Email Re-engagement"},
            ],
            ab_test=True, send_window="09:00-21:00 IST", daily_cap=5000,
            rationale="Default balanced split across WhatsApp and Email.",
        )
    context["plan"] = parsed.model_dump()
    yield {"pipeline_id": pipeline_id, "step": "campaign_plan", "output": context["plan"], "meta": meta, "valid": valid}

    # ── Step 4: Message Copy ──────────────────────────────────────────────────
    prompt = (
        f"Plan: {json.dumps(context['plan'])}\n"
        f"Audience: {context['segment_dsl']['audience_description']}\n"
        f"Brand: A D2C fashion/lifestyle brand (India).\n\n"
        "Write personalised message copy for each variant. "
        "Use ONLY these tokens: {{first_name}}, {{last_order}}, {{discount}}, {{expiry}}, {{brand_name}}. "
        "WhatsApp: max 300 chars, no subject. Email: subject + body."
    )
    output, meta = await _call_gemma_json(
        prompt,
        "Write message variants with body, optional subject (email only), and list of tokens used.",
        MessageCopyOutput,
    )
    parsed, valid = await _safe_validate(MessageCopyOutput, output)
    if not valid:
        parsed = MessageCopyOutput(variants=[
            {"variant_id": "A", "channel": "whatsapp", "subject": None,
             "body": "Hi {{first_name}}! It's been a while — we miss you. Here's a special offer just for you. Use code {{discount}} before {{expiry}}.",
             "tokens_used": ["{{first_name}}", "{{discount}}", "{{expiry}}"]},
            {"variant_id": "B", "channel": "email",
             "subject": "{{first_name}}, a little something to welcome you back",
             "body": "Hi {{first_name}},\n\nWe noticed you haven't ordered since {{last_order}}. We'd love to have you back!\n\nUse {{discount}} at checkout — valid until {{expiry}}.\n\nWarm regards,\n{{brand_name}} Team",
             "tokens_used": ["{{first_name}}", "{{last_order}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
        ])
    context["message_variants"] = parsed.model_dump()["variants"]
    yield {"pipeline_id": pipeline_id, "step": "message_copy", "output": {"variants": context["message_variants"]}, "meta": meta, "valid": valid}

    yield {"pipeline_id": pipeline_id, "step": "done", "output": context, "meta": {"latency_ms": 0}, "valid": True}


async def run_insights(campaign_id: str, stats: dict) -> dict:
    """Step 5: Post-campaign AI insights with citation validation."""
    prompt = (
        f"Campaign stats: {json.dumps(stats)}\n\n"
        "Analyse campaign performance and produce findings with a recommended next action and a pre-filled "
        "goal for a follow-up campaign. Every number you cite in findings MUST appear in the stats above."
    )

    for attempt in range(2):
        output, meta = await _call_gemma_json(
            prompt,
            "Produce post-campaign findings (citing real numbers), a next_action, a pre-filled next_goal, confidence, and best_variant.",
            InsightsOutput,
        )
        parsed, valid_schema = await _safe_validate(InsightsOutput, output)
        if valid_schema and parsed:
            valid_citations = _validate_citations(parsed.findings, stats)
            if valid_citations or attempt == 1:
                return {"output": parsed.model_dump(), "valid": valid_citations, "meta": meta}

    sent = stats.get("sent", 0)
    fb = InsightsOutput(
        findings=[f"Campaign reached {sent} customers."],
        next_action="Review delivery rates and plan follow-up.",
        next_goal="Follow up with customers who opened but didn't click",
        confidence="low",
        best_variant=None,
    )
    return {"output": fb.model_dump(), "valid": False, "meta": {"latency_ms": 0, "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_creation_tokens": 0}}
