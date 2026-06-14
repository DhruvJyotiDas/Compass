"""Insight agent — step 5: analyze post-campaign stats and propose the next campaign.

Closes the learning loop. Includes citation validation: every number cited in a finding must
appear in the real stats, so the model can't hallucinate performance figures.
"""
import json
import re

from app.ai.client import complete_json, safe_validate
from app.ai.prompts import SYSTEM_PROMPT
from app.ai.schemas import InsightsOutput


def _extract_numbers(text: str) -> set[float]:
    return {float(m) for m in re.findall(r"\d+(?:\.\d+)?", text)}


def _validate_citations(findings: list[str], stats: dict) -> bool:
    stat_numbers = _extract_numbers(json.dumps(stats))
    for finding in findings:
        cited = _extract_numbers(finding)
        if not all(c in stat_numbers for c in cited):
            return False
    return True


async def analyze(stats: dict) -> dict:
    """Return {"output", "valid", "meta"} — valid reflects citation correctness."""
    user = (
        f"Campaign stats: {json.dumps(stats)}\n\n"
        "Analyse campaign performance and produce findings with a recommended next_action and a "
        "pre-filled next_goal for a follow-up campaign. Every number you cite in findings MUST "
        "appear in the stats above."
    )
    for attempt in range(2):
        output, meta = await complete_json(SYSTEM_PROMPT, user, InsightsOutput)
        parsed, ok = safe_validate(InsightsOutput, output)
        if ok and parsed:
            cited_ok = _validate_citations(parsed.findings, stats)
            if cited_ok or attempt == 1:
                return {"output": parsed.model_dump(), "valid": cited_ok, "meta": meta}

    sent = stats.get("sent", 0)
    fb = InsightsOutput(
        findings=[f"Campaign reached {sent} customers."],
        next_action="Review delivery rates and plan a follow-up.",
        next_goal="Follow up with customers who opened but didn't click",
        confidence="low", best_variant=None,
    )
    return {"output": fb.model_dump(), "valid": False,
            "meta": {"provider": "fallback", "latency_ms": 0, "input_tokens": 0,
                     "output_tokens": 0, "cache_read_tokens": 0, "cache_creation_tokens": 0}}
