"""Conversational assistant brain.

Responsibilities:
  1. `route_message` — decide the user's intent (campaign | list | answer | history | add_customer |
     profile) and extract the entities that action needs (customer name, channel, etc.). A campaign
     is only ever created on an explicit ask.
  2. `campaign_brief` — gather the goal + offer before a campaign is built.
  3. `personalized_message` — draft a ready-to-send, fully-rendered message for ONE customer.
  4. `ANSWER_SYSTEM` — the system prompt for general Q&A. The assistant is general-purpose ("ask
     anything"); a live CRM data snapshot is appended by the router so it can also answer questions
     about the user's own customers, segments and campaigns.
"""
from app.ai.client import complete_json, safe_validate
from app.ai.schemas import (
    AssistantRoute,
    CampaignBriefOutput,
    PersonalizedMessageOutput,
)

_CLASSIFY_SYSTEM = (
    "You route a message inside a marketing CRM assistant. Decide the user's intent and extract any "
    "entities the action needs. Pick ONE action:\n"
    "- \"campaign\" ONLY if the user explicitly asks to create, build, design, draft, launch or send a "
    "marketing campaign / outreach to a GROUP of customers (e.g. 'create a win-back campaign').\n"
    "- \"list\" if the user wants to SEE / SHOW / FIND / LIST customers matching some CRITERIA "
    "(e.g. 'show customers whose name starts with A', 'list high-value sneaker buyers').\n"
    "- \"history\" if the user wants to see PAST MESSAGES already sent to ONE named customer "
    "(e.g. 'show me the last 2 mails I sent to Rahul', 'what SMS did we send Priya?'). Set "
    "customer_name to that person; set channel to email/sms/whatsapp if specified else 'any'; set "
    "limit to the number requested (e.g. 2) if any.\n"
    "- \"add_customer\" if the user wants to ADD / CREATE / SAVE a customer to the database "
    "(e.g. 'add this customer: Rahul Sharma, rahul@x.com, 99999...'). Put the name in new_name and "
    "any email/phone in new_email/new_phone.\n"
    "- \"profile\" if the user wants to SEE ONE named customer's profile / details, or asks what "
    "personalized message to send them (e.g. 'show me Anita's profile and what mail I should send her', "
    "'tell me about customer John'). Set customer_name.\n"
    "- \"answer\" for EVERYTHING else: questions, definitions, analysis, advice, aggregates, chatting.\n"
    "Consider the WHOLE conversation. When unsure, prefer \"answer\" — never build a campaign unless "
    "clearly requested."
)

ANSWER_SYSTEM = (
    "You are Compass, an AI growth assistant embedded in a customer-engagement CRM for a fashion "
    "e-commerce store (currency is Indian Rupees, ₹). You are knowledgeable and helpful: answer "
    "ANY question — about the user's CRM data (using the snapshot below), about marketing/growth "
    "strategy, or general knowledge. Be concise and use Markdown. If the user wants to actually "
    "create or launch a campaign, tell them to ask for that explicitly (e.g. 'build a win-back "
    "campaign for lapsed VIPs') and you'll generate it. Do not invent specific numbers that aren't "
    "in the snapshot; if you don't have the data, say so."
)


_BRIEF_SYSTEM = (
    "You are gathering requirements to build a marketing campaign through a short conversation. "
    "A complete brief needs TWO things: (1) the GOAL/AUDIENCE (who to target and why), and (2) the "
    "OFFER — the concrete incentive to give customers (e.g. a % discount, free shipping, a free "
    "gift, early access to a new drop, loyalty points, a bundle deal).\n"
    "Read the conversation. If the OFFER is still missing, set ready=false and write a short, "
    "friendly 'question' that asks what they'd like to offer (give 3-4 example offers); also ask "
    "about the audience if it's unclear. If you now have BOTH a goal/audience AND an offer, set "
    "ready=true, fill 'goal' (one line including the audience) and 'offer' (the incentive). "
    "NEVER assume a discount unless the user explicitly said so."
)


_VALID_ACTIONS = {"campaign", "list", "answer", "history", "add_customer", "profile"}


async def route_message(transcript: str) -> dict:
    """Return {action, customer_name?, channel?, limit?, new_*?} for the recent conversation."""
    try:
        out, _ = await complete_json(_CLASSIFY_SYSTEM, transcript, AssistantRoute, max_tokens=120)
        action = str(out.get("action", "answer")).strip().lower()
        if action not in _VALID_ACTIONS:
            action = "campaign" if "campaign" in action else "answer"
        out["action"] = action
        return out
    except Exception:
        return {"action": "answer"}  # fail safe — never auto-build a campaign on error


async def campaign_brief(transcript: str) -> dict:
    """Decide whether we have enough to build (goal + offer), else what to ask next."""
    try:
        out, _ = await complete_json(_BRIEF_SYSTEM, transcript, CampaignBriefOutput, max_tokens=220)
        return out
    except Exception:
        return {"ready": False,
                "question": "What would you like to offer your customers — for example a discount, "
                            "free shipping, a free gift, or early access? And who should we target?"}


_PERSONALIZED_SYSTEM = (
    "You are Compass, an AI growth assistant for a fashion e-commerce store (currency ₹). Given ONE "
    "customer's profile, write a single, ready-to-send personalized message to win their next purchase. "
    "Rules: address the customer by their real first name (it is given — do NOT use placeholders like "
    "{{first_name}}); reference what the profile actually shows (favorite category, how long since their "
    "last order, loyalty); keep it warm and concise; sign off as the brand. Default channel is 'email' "
    "with a short subject; if asked for SMS/WhatsApp use that channel and omit the subject. Use ONLY the "
    "facts provided — do not invent orders or personal details."
)


async def personalized_message(facts: dict) -> tuple[dict, dict, bool]:
    """Draft a fully-rendered (no-token) message for one customer. Returns (draft, meta, valid)."""
    user = (
        "Customer profile:\n"
        f"name={facts.get('name', 'Customer')}\n"
        f"favorite_category={facts.get('favorite_category') or 'general'}\n"
        f"order_count={facts.get('order_count', 0)}\n"
        f"lifetime_spend={facts.get('lifetime_spend', 0)}\n"
        f"days_since_last_order={facts.get('days_since_last', 'unknown')}\n"
        f"engagement_score={facts.get('engagement_score', 0)}\n"
        f"brand_name={facts.get('brand_name', 'Compass')}\n"
        f"channel={facts.get('channel', 'email')}\n\n"
        "Write the personalized message now."
    )
    output, meta = await complete_json(_PERSONALIZED_SYSTEM, user, PersonalizedMessageOutput, max_tokens=400)
    parsed, valid = safe_validate(PersonalizedMessageOutput, output)
    if not parsed:
        name = str(facts.get("name", "there")).split()[0]
        brand = facts.get("brand_name", "Compass")
        parsed = PersonalizedMessageOutput(
            channel=facts.get("channel", "email"),
            subject=f"{name}, a little something from {brand}",
            body=(f"Hi {name},\n\nWe'd love to see you back at {brand}. As a thank-you, here's a special "
                  f"offer on your next order — explore what's new whenever you're ready.\n\nWarmly,\n{brand}"),
            rationale="Fallback re-engagement message.",
        )
    return parsed.model_dump(), meta, valid
