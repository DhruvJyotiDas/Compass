"""Planner agent — step 1: classify the marketer's business goal into structured intent."""
from app.ai.client import complete_json, safe_validate
from app.ai.prompts import SYSTEM_PROMPT
from app.ai.schemas import IntentOutput

_FALLBACK = IntentOutput(
    intent="re_engage", urgency="medium", channels=["whatsapp", "email"],
    audience_description="Customers ready for a relevant nudge",
    kpis=["open_rate", "conversions"], campaign_name="Engagement Campaign",
)


async def classify_intent(goal_text: str) -> tuple[dict, dict, bool]:
    """Return (intent_dict, meta, valid)."""
    output, meta = await complete_json(
        SYSTEM_PROMPT,
        f"Goal: {goal_text}\n\nClassify the marketer's intent and extract campaign parameters "
        "(intent, urgency, channels, audience_description, kpis, a short campaign_name).",
        IntentOutput,
    )
    parsed, valid = safe_validate(IntentOutput, output)
    return (parsed or _FALLBACK).model_dump(), meta, valid
