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
        "Generate the segment DSL using ONLY these allowed fields and operators:\n"
        "- last_order_at: days_ago_gt | days_ago_lt  (value = number of days; recency/lapsed)\n"
        "- lifetime_spend: gte | lte  (value = amount in INR ₹, NOT dollars; "
        "this is a fashion store — typical spend 1,000–80,000, high-value ≈ 50,000+)\n"
        "- order_count: gte | lte  (value = integer number of orders)\n"
        "- engagement_score: gte | lte  (value = integer 0–100; engaged/active ≈ 60+, at-risk ≈ <30)\n"
        "- favorite_category: eq | neq  (value MUST be one of exactly: "
        "\"Activewear\", \"Apparel\", \"Accessories\", \"Bags\", \"Sneakers\", \"Beauty\", "
        "\"Footwear\", \"Home & Living\")\n"
        "- name: starts_with | contains  (value = a letter or substring of the customer's name)\n\n"
        "Rules: pick the field that best matches the description (e.g. category words → "
        "favorite_category; 'engaged'/'loyal'/'active' → engagement_score; 'high value'/'big "
        "spender' → lifetime_spend). If the description names a product type not in the category "
        "list, choose the closest listed category. Use at most 4 filters and set logic to AND or "
        "OR. Provide a one-line audience_description."
    )
    output, meta = await complete_json(SYSTEM_PROMPT, user, SegmentDSLOutput, max_tokens=240)
    parsed, valid = safe_validate(SegmentDSLOutput, output)
    return (parsed or _FALLBACK).model_dump(), meta, valid
