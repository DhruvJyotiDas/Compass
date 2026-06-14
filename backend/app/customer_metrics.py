"""Customer intelligence helpers — engagement score (RFM) + product categories.

`engagement_score` is a 0–100 blend of Recency (40), Frequency (30) and Monetary (30) so the UI can
badge churn risk and the AI customer card has a quantitative signal. Computed in SQL (one definition,
reused by the seeder and the ingest endpoint) and mirrored in Python for tests/clarity.
"""

# Product categories used to give each shopper a `favorite_category` (the legacy Order model has no
# line-item category, so we attribute a primary category per customer at ingest/seed time).
CATEGORIES = [
    "Sneakers", "Apparel", "Accessories", "Beauty",
    "Home & Living", "Footwear", "Activewear", "Bags",
]

# RFM caps
_RECENCY_DAYS_CAP = 90
_FREQUENCY_CAP = 10
_MONETARY_CAP = 20000


def compute_engagement_score(days_since_last: float | None, order_count: int, lifetime_spend: float) -> int:
    """Python mirror of the SQL expression below. Returns 0–100."""
    if days_since_last is None:
        recency = 0.0
    else:
        recency = 40 * (1 - min(days_since_last, _RECENCY_DAYS_CAP) / _RECENCY_DAYS_CAP)
    frequency = min(order_count, _FREQUENCY_CAP) / _FREQUENCY_CAP * 30
    monetary = min(lifetime_spend, _MONETARY_CAP) / _MONETARY_CAP * 30
    return max(0, min(100, round(recency + frequency + monetary)))


# SQL expression computing engagement_score from a customer's own columns. Kept in one place so the
# seeder and ingest stay consistent. Assumes order_count / lifetime_spend / last_order_at are current.
ENGAGEMENT_SCORE_SQL = f"""
LEAST(100, GREATEST(0, ROUND(
      (CASE WHEN last_order_at IS NULL THEN 0
            ELSE 40 * (1 - LEAST(EXTRACT(EPOCH FROM (NOW() - last_order_at)) / 86400.0,
                                 {_RECENCY_DAYS_CAP}) / {_RECENCY_DAYS_CAP}.0)
       END)
    + LEAST(order_count, {_FREQUENCY_CAP}) / {_FREQUENCY_CAP}.0 * 30
    + LEAST(lifetime_spend, {_MONETARY_CAP}) / {_MONETARY_CAP}.0 * 30
)))::int
"""


def engagement_update_sql(where: str = "TRUE") -> str:
    """A full UPDATE that (re)computes engagement_score for rows matching `where`."""
    return f"UPDATE customers SET engagement_score = {ENGAGEMENT_SCORE_SQL} WHERE {where}"
