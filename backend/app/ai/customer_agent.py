"""Customer agent — generates the AI Customer Card for a single shopper.

Unlike the audience agents (aggregates only), this is invoked when the marketer is explicitly
viewing ONE customer, so that record's metrics are in scope. It still must not invent data beyond
the metrics provided. Output: a narrative summary, churn risk, and next-best actions.
"""
from app.ai.client import complete_json, safe_validate
from app.ai.prompts import CUSTOMER_CARD_PROMPT
from app.ai.schemas import CustomerCardOutput


async def customer_card(metrics: dict) -> tuple[dict, dict, bool]:
    """`metrics`: {name, favorite_category, order_count, lifetime_spend, days_since_last,
    engagement_score}. Returns (card_dict, meta, valid)."""
    # Render metrics as a compact, parseable line (also drives the offline mock generator).
    user = (
        "Customer metrics:\n"
        f"order_count={metrics.get('order_count', 0)}\n"
        f"lifetime_spend={metrics.get('lifetime_spend', 0)}\n"
        f"days_since_last={metrics.get('days_since_last', 0)}\n"
        f"engagement_score={metrics.get('engagement_score', 0)}\n"
        f"name={metrics.get('name', 'Customer')}\n"
        f"favorite_category={metrics.get('favorite_category') or 'general'}\n\n"
        "Write the customer intelligence card."
    )
    output, meta = await complete_json(CUSTOMER_CARD_PROMPT, user, CustomerCardOutput)
    parsed, valid = safe_validate(CustomerCardOutput, output)
    if not parsed:
        days = metrics.get("days_since_last", 0)
        risk = "high" if days > 90 else "medium" if days > 45 else "low"
        parsed = CustomerCardOutput(
            summary=f"{metrics.get('name', 'Customer')} has {metrics.get('order_count', 0)} order(s) "
                    f"worth ₹{float(metrics.get('lifetime_spend', 0)):,.0f}.",
            churn_risk=risk,
            suggestions=[{"label": "Send a re-engagement offer",
                          "rationale": "Encourage the next purchase with a time-boxed incentive."}],
        )
    return parsed.model_dump(), meta, valid
