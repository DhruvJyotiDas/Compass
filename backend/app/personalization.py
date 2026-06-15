"""Fill {{token}} placeholders in campaign/direct messages with real per-recipient values.

Message copy is authored once with a fixed token set ({{first_name}}, {{discount}}, {{expiry}},
{{brand_name}}, {{last_order}}, …) so a single draft can serve a whole audience. This module
substitutes those tokens with each recipient's actual data at send time. Unknown or unfillable
tokens are replaced with a safe default instead of shipping a literal "{{…}}" to a customer.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_TOKEN_RE = re.compile(r"\{\{\s*([\w]+)\s*\}\}")
_PCT_RE = re.compile(r"(\d{1,3})\s*%")


def first_name(name: str | None) -> str:
    if not name or not name.strip():
        return "there"
    return name.strip().split()[0]


def extract_discount(*sources: str | None) -> tuple[str, str | None]:
    """Best-effort (discount_text, percentage) from an offer/goal string.

    "Give them 20% off" -> ("20% off", "20"). A non-percentage offer ("free shipping")
    is returned as-is with no percentage.
    """
    for src in sources:
        if src and (m := _PCT_RE.search(src)):
            pct = m.group(1)
            return f"{pct}% off", pct
    for src in sources:
        if src and src.strip():
            return src.strip(), None
    return "a special offer", None


def format_last_order(last_order_at) -> str:
    if not last_order_at:
        return "your last visit"
    try:
        return last_order_at.strftime("%b %Y")
    except Exception:
        return "your last visit"


def build_context(
    *, offer: str | None = None, goal: str | None = None,
    brand_name: str = "Compass", expiry_days: int = 7,
) -> dict:
    """Campaign-level token values shared by every recipient (discount, expiry, brand)."""
    discount, pct = extract_discount(offer, goal)
    expiry = (datetime.now(timezone.utc) + timedelta(days=expiry_days)).strftime("%d %b %Y")
    return {
        "discount": discount,
        "percentage": f"{pct}%" if pct else discount,
        "expiry": expiry,
        "brand_name": brand_name,
    }


def render(template: str | None, customer: dict, ctx: dict | None = None) -> str | None:
    """Fill every {{token}} in `template` using the customer row + campaign ctx."""
    if not template:
        return template
    ctx = ctx or {}
    name = customer.get("name")
    brand = ctx.get("brand_name", "Compass")
    discount = ctx.get("discount", "a special offer")
    percentage = ctx.get("percentage", discount)
    values = {
        "first_name": first_name(name),
        "fname": first_name(name),
        "name": first_name(name),
        "full_name": (name or "there").strip(),
        "last_order": format_last_order(customer.get("last_order_at")),
        "brand_name": brand,
        "brand": brand,
        "discount": discount,
        "percentage": percentage,
        "percent": percentage,
        "expiry": ctx.get("expiry", "soon"),
        "category": customer.get("favorite_category") or "our latest collection",
    }

    def _sub(m: "re.Match[str]") -> str:
        return str(values.get(m.group(1).lower(), ""))

    out = _TOKEN_RE.sub(_sub, template)
    # tidy up extra spaces left where an unknown token was removed
    return re.sub(r"[ \t]{2,}", " ", out).strip()
