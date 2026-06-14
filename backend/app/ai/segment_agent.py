"""Segment agent — step 2: translate goal + intent into a safe segment DSL.

The DSL it emits is NEVER executed as raw SQL — `routers/segments.py` compiles it through a fixed
field registry into a parameterized query. This agent only proposes filters over allowed fields.
"""
import json

from app.ai.client import complete_json, safe_validate
from app.ai.prompts import SYSTEM_PROMPT
from app.ai.schemas import SegmentDSLOutput

_FALLBACK = SegmentDSLOutput(
    filters=[{"field": "last_order_at", "op": "days_ago_gt", "value": 60}],
    logic="AND",
    audience_description="Customers inactive for 60+ days",
)


async def generate_segment(goal_text: str, intent: dict | None = None) -> tuple[dict, dict, bool]:
    """Return (segment_dsl_dict, meta, valid)."""
    user = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(intent or {})}\n\n"
        "Generate the segment DSL using ONLY the allowed fields: last_order_at, lifetime_spend, "
        "order_count. Use at most 4 filters. Provide a one-line audience_description."
    )
    output, meta = await complete_json(SYSTEM_PROMPT, user, SegmentDSLOutput)
    parsed, valid = safe_validate(SegmentDSLOutput, output)
    return (parsed or _FALLBACK).model_dump(), meta, valid
