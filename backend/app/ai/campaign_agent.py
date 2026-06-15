"""Campaign agent — steps 3 & 4: design the campaign plan and write personalized message copy.

Also powers the manual campaign builder's AI buttons (Improve Message / Create Variants) via
`write_copy(..., instruction=...)`.
"""
import json

from app.ai.client import complete_json, safe_validate
from app.ai.prompts import SYSTEM_PROMPT
from app.ai.schemas import CampaignPlanOutput, MessageCopyOutput

_PLAN_FALLBACK = CampaignPlanOutput(
    variants=[
        {"variant_id": "A", "channel": "whatsapp", "split_pct": 50, "name": "WhatsApp Outreach"},
        {"variant_id": "B", "channel": "email", "split_pct": 50, "name": "Email Re-engagement"},
    ],
    ab_test=True, send_window="09:00-21:00 IST", daily_cap=5000,
    rationale="Default balanced split across WhatsApp and Email.",
)

_COPY_FALLBACK = MessageCopyOutput(variants=[
    {"variant_id": "A", "channel": "whatsapp", "subject": None,
     "body": "Hi {{first_name}}! It's been a while — here's {{discount}} off your next order. "
             "Use it before {{expiry}}. — {{brand_name}}",
     "tokens_used": ["{{first_name}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
    {"variant_id": "B", "channel": "email",
     "subject": "{{first_name}}, a little something to welcome you back",
     "body": "Hi {{first_name}},\n\nWe noticed it's been since {{last_order}}. Use {{discount}} at "
             "checkout — valid until {{expiry}}.\n\nWarmly,\n{{brand_name}}",
     "tokens_used": ["{{first_name}}", "{{last_order}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
])


async def design_plan(
    goal_text: str, intent: dict, audience_summary: dict | None = None, offer: str | None = None,
) -> tuple[dict, dict, bool]:
    """Return (plan_dict, meta, valid)."""
    aud = audience_summary or {"count": "unknown", "avg_spend": "unknown"}
    offer_line = f"Offer/incentive to promote: {offer}\n" if offer else ""
    user = (
        f"Goal: {goal_text}\n"
        f"Intent: {json.dumps(intent)}\n"
        f"{offer_line}"
        f"Audience summary (aggregates only, NO PII): {json.dumps(aud)}\n\n"
        "Design the campaign plan: pick 1-2 channels with an A/B split summing to 100%, include "
        "guardrails (send window, daily cap), and a short rationale."
    )
    output, meta = await complete_json(SYSTEM_PROMPT, user, CampaignPlanOutput, max_tokens=320)
    parsed, valid = safe_validate(CampaignPlanOutput, output)
    return (parsed or _PLAN_FALLBACK).model_dump(), meta, valid


async def write_copy(
    plan: dict, audience_description: str, brand: str = "a D2C fashion/lifestyle brand (India)",
    instruction: str | None = None, offer: str | None = None,
) -> tuple[dict, dict, bool]:
    """Return ({"variants": [...]}, meta, valid). `instruction` powers Improve/Rewrite actions."""
    extra = f"\nAdditional instruction from the marketer: {instruction}" if instruction else ""
    # The offer drives the copy — without it the model defaults to a generic discount.
    offer_line = (
        f"The offer/incentive to promote is: {offer}. Build the message around THIS offer "
        f"(do not invent a discount unless the offer is a discount).\n"
        if offer else
        "No specific offer was given — keep the copy about re-engagement/value, not a discount.\n"
    )
    discount_tok = "{{discount}} (only if the offer is a percentage discount), " if offer else ""
    user = (
        f"Plan: {json.dumps(plan)}\n"
        f"Audience: {audience_description}\n"
        f"Brand: {brand}.\n{offer_line}{extra}\n"
        "Write personalised message copy for each variant. Available tokens: "
        f"{{{{first_name}}}}, {{{{last_order}}}}, {discount_tok}{{{{expiry}}}}, {{{{brand_name}}}}. "
        "WhatsApp: max 300 chars, no subject. Email: subject + body."
    )
    output, meta = await complete_json(SYSTEM_PROMPT, user, MessageCopyOutput, max_tokens=420)
    parsed, valid = safe_validate(MessageCopyOutput, output)
    result = (parsed or _COPY_FALLBACK).model_dump()
    return {"variants": result["variants"]}, meta, valid
