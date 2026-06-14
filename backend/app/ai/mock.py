"""Deterministic offline mock for the LLM layer.

Used when no real endpoint is configured (`settings.use_real_llm == False`). It returns
schema-shaped JSON for every agent so the entire Growth-Assistant flow runs end-to-end without
a GPU. It is *deterministic and keyword-aware* (not random, not a canned single answer): output
varies with the goal/context so demos feel intelligent, while every response is tagged
`provider="mock"` upstream so nothing is passed off as real model output.

When the real Qwen3-8B endpoint is wired in (LLM_BASE_URL), this module is bypassed entirely.
"""
from __future__ import annotations

import re
from typing import Any

# ── Goal → theme classification (cheap keyword heuristics) ──────────────────────

_THEMES = {
    "win_back": ["inactive", "lapsed", "haven't", "havent", "dormant", "churn", "comeback",
                 "recover", "win back", "winback", "re-engage", "reengage", "lost", "away"],
    "vip": ["loyal", "top", "vip", "best", "high value", "high-value", "premium", "reward",
            "spender", "spend", "valuable"],
    "repeat": ["repeat", "again", "more", "upsell", "cross", "cross-sell", "new arrival",
               "recommend", "second", "reorder", "frequency"],
}


def classify_goal(text: str) -> str:
    t = (text or "").lower()
    best, best_hits = "engage", 0
    for theme, kws in _THEMES.items():
        hits = sum(1 for kw in kws if kw in t)
        if hits > best_hits:
            best, best_hits = theme, hits
    return best


# ── Per-theme content ───────────────────────────────────────────────────────────

_INTENT = {
    "win_back": dict(intent="win_back_inactive", urgency="high",
                     audience="Customers who have lapsed and stopped ordering",
                     name="Win-Back Inactive Shoppers"),
    "vip": dict(intent="reward_loyal", urgency="medium",
                audience="High lifetime-value, frequent buyers",
                name="VIP Loyalty Reward"),
    "repeat": dict(intent="drive_repeat_purchase", urgency="medium",
                   audience="Recent one/two-time buyers with upsell potential",
                   name="Repeat-Purchase Nudge"),
    "engage": dict(intent="re_engage", urgency="medium",
                   audience="Customers ready for a relevant nudge",
                   name="Engagement Campaign"),
}

_SEGMENT = {
    "win_back": dict(filters=[{"field": "last_order_at", "op": "days_ago_gt", "value": 60},
                              {"field": "lifetime_spend", "op": "gte", "value": 5000}],
                     desc="High-value customers inactive for 60+ days"),
    "vip": dict(filters=[{"field": "lifetime_spend", "op": "gte", "value": 10000},
                         {"field": "order_count", "op": "gte", "value": 5}],
                desc="Top spenders with 5+ orders"),
    "repeat": dict(filters=[{"field": "order_count", "op": "gte", "value": 1},
                            {"field": "order_count", "op": "lte", "value": 3},
                            {"field": "last_order_at", "op": "days_ago_lt", "value": 45}],
                   desc="Recent 1–3 time buyers (last 45 days)"),
    "engage": dict(filters=[{"field": "last_order_at", "op": "days_ago_gt", "value": 30}],
                   desc="Customers with no order in the last 30 days"),
}

_COPY = {
    "win_back": {
        "wa": "Hi {{first_name}}! We've missed you since {{last_order}} 💛 Here's {{discount}} off your "
              "next order at {{brand_name}} — valid till {{expiry}}. Come see what's new!",
        "subject": "{{first_name}}, a little something to welcome you back",
        "email": "Hi {{first_name}},\n\nIt's been a while since {{last_order}} and we'd love to have you "
                 "back. Use {{discount}} at checkout before {{expiry}}.\n\nWarmly,\n{{brand_name}}",
    },
    "vip": {
        "wa": "Hi {{first_name}}! As one of our most valued customers, enjoy an exclusive {{discount}} "
              "on the new {{brand_name}} collection. Valid till {{expiry}} 🖤",
        "subject": "{{first_name}}, a VIP thank-you from {{brand_name}}",
        "email": "Hi {{first_name}},\n\nThank you for being one of our best customers. Here's an exclusive "
                 "{{discount}} just for you — valid until {{expiry}}.\n\n{{brand_name}}",
    },
    "repeat": {
        "wa": "Hi {{first_name}}! Loved your last order? The new arrivals are in — grab {{discount}} on "
              "your next pick at {{brand_name}} before {{expiry}}.",
        "subject": "{{first_name}}, picked for you — new arrivals",
        "email": "Hi {{first_name}},\n\nBased on your last order, we think you'll love what just landed. "
                 "Use {{discount}} before {{expiry}}.\n\n{{brand_name}}",
    },
    "engage": {
        "wa": "Hi {{first_name}}! Something new just dropped at {{brand_name}}. Enjoy {{discount}} on "
              "us — valid till {{expiry}}.",
        "subject": "{{first_name}}, something new for you",
        "email": "Hi {{first_name}},\n\nWe've got something we think you'll like. Use {{discount}} before "
                 "{{expiry}}.\n\n{{brand_name}}",
    },
}


def _intent(text: str) -> dict:
    th = classify_goal(text)
    d = _INTENT[th]
    return {
        "intent": d["intent"], "urgency": d["urgency"],
        "channels": ["whatsapp", "email"],
        "audience_description": d["audience"],
        "kpis": ["open_rate", "click_rate", "conversions"],
        "campaign_name": d["name"],
    }


def _segment(text: str) -> dict:
    th = classify_goal(text)
    d = _SEGMENT[th]
    return {"filters": d["filters"], "logic": "AND", "audience_description": d["desc"]}


def _plan(text: str) -> dict:
    th = classify_goal(text)
    return {
        "variants": [
            {"variant_id": "A", "channel": "whatsapp", "split_pct": 50, "name": "WhatsApp"},
            {"variant_id": "B", "channel": "email", "split_pct": 50, "name": "Email"},
        ],
        "ab_test": True,
        "send_window": "09:00-21:00 IST",
        "daily_cap": 5000,
        "rationale": f"Balanced WhatsApp/Email A/B for a {th.replace('_', ' ')} goal; "
                     "WhatsApp for reach, email for richer storytelling.",
    }


def _copy(text: str) -> dict:
    c = _COPY[classify_goal(text)]
    return {"variants": [
        {"variant_id": "A", "channel": "whatsapp", "subject": None, "body": c["wa"],
         "tokens_used": ["{{first_name}}", "{{last_order}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
        {"variant_id": "B", "channel": "email", "subject": c["subject"], "body": c["email"],
         "tokens_used": ["{{first_name}}", "{{last_order}}", "{{discount}}", "{{expiry}}", "{{brand_name}}"]},
    ]}


def _num(pattern: str, text: str, default: float = 0) -> float:
    m = re.search(pattern, text)
    return float(m.group(1)) if m else default


def _insights(text: str) -> dict:
    sent = int(_num(r'"sent":\s*(\d+)', text, _num(r"sent[=:]\s*(\d+)", text, 0)))
    clicked = int(_num(r'"clicked":\s*(\d+)', text, 0))
    converted = int(_num(r'"converted":\s*(\d+)', text, 0))
    findings = [f"Campaign reached {sent} customers."]
    if clicked:
        findings.append(f"{clicked} customers clicked through.")
    if converted:
        findings.append(f"{converted} customers converted after the campaign.")
    return {
        "findings": findings,
        "next_action": "Follow up with customers who opened but didn't click using a stronger incentive.",
        "next_goal": "Re-target customers who clicked but did not purchase in this campaign",
        "confidence": "medium",
        "best_variant": "A",
    }


def _customer_card(text: str) -> dict:
    score = int(_num(r"engagement_score[=:]\s*(\d+)", text, 50))
    orders = int(_num(r"order_count[=:]\s*(\d+)", text, 0))
    days = int(_num(r"days_since_last[=:]\s*(\d+)", text, 0))
    spend = _num(r"lifetime_spend[=:]\s*([\d.]+)", text, 0)
    cat_m = re.search(r"favorite_category[=:]\s*(.+)", text)
    cat = (cat_m.group(1).strip() if cat_m else "general") or "general"

    risk = "high" if days > 90 else "medium" if days > 45 else "low"
    value = "high-value" if spend >= 10000 else "regular" if spend >= 3000 else "new"
    summary = (f"{value.capitalize()} {cat.lower()} buyer with {orders} order(s) "
               f"(₹{spend:,.0f} lifetime). " +
               (f"No activity for {days} days — churn risk." if days > 60
                else f"Last active {days} days ago." if days else "No purchase history yet."))
    suggestions = []
    if risk in ("high", "medium"):
        suggestions.append({"label": "Send a comeback discount",
                            "rationale": f"Inactive {days} days; a time-boxed offer can re-trigger purchase."})
    suggestions.append({"label": f"Recommend the new {cat} collection",
                        "rationale": f"Past purchases skew toward {cat}; relevant arrivals lift conversion."})
    return {"summary": summary, "churn_risk": risk, "suggestions": suggestions[:2]}


# ── Dispatch by schema name ─────────────────────────────────────────────────────

_GENERATORS = {
    "IntentOutput": _intent,
    "SegmentDSLOutput": _segment,
    "CampaignPlanOutput": _plan,
    "MessageCopyOutput": _copy,
    "InsightsOutput": _insights,
    "CustomerCardOutput": _customer_card,
}


def generate(schema_name: str, context_text: str) -> dict[str, Any]:
    """Return deterministic schema-shaped output for the given schema + free-text context."""
    gen = _GENERATORS.get(schema_name)
    if gen is None:
        raise ValueError(f"No mock generator for schema '{schema_name}'")
    return gen(context_text or "")
