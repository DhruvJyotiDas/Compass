"""LLM provider layer — the ONLY place that knows where inference lives.

`llm.complete_json(system, user, schema)` is the single entry point every agent uses. It either
calls a real OpenAI-compatible endpoint (our self-hosted Qwen2.5-14B-Instruct-AWQ on vLLM,
configured via `LLM_BASE_URL`) or, when none is configured, a deterministic offline mock — so the product runs
end-to-end before the GPU endpoint exists. Both paths return `(output_dict, meta)` where `meta`
always carries `provider` and `model`, so logs and the UI can show exactly what produced an answer.

Swap providers with ONE env var — no agent code changes.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from collections.abc import AsyncGenerator
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.ai import mock
from app.config import settings

# Real client is created lazily only when a base_url is configured.
_openai: AsyncOpenAI | None = None
if settings.use_real_llm:
    _openai = AsyncOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        timeout=settings.llm_timeout_seconds,
    )

MODEL = settings.llm_model


def safe_validate(model_cls: type[BaseModel], output: dict) -> tuple[Any, bool]:
    """Validate a raw dict against a Pydantic schema. Returns (model_or_None, ok)."""
    try:
        return model_cls.model_validate(output), True
    except Exception:
        return None, False


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw


def _empty_meta(provider: str, latency_ms: int = 0) -> dict:
    return {
        "provider": provider,
        "model": MODEL if provider != "mock" else "mock",
        "latency_ms": latency_ms,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
    }


async def complete_json(
    system: str, user: str, schema: type[BaseModel], max_tokens: int | None = None
) -> tuple[dict, dict]:
    """Return (parsed_json, meta). Routes to the real endpoint or the offline mock.

    The schema is sent to the model as a contract; on the mock path it selects the generator.
    Callers still validate the dict against the Pydantic schema (agents own their fallbacks),
    so a malformed real-model response degrades gracefully rather than raising here.
    `max_tokens` caps generation — the dominant latency cost on a token-bound GPU.
    """
    schema_name = schema.__name__

    # ── Offline mock path ─────────────────────────────────────────────────────
    if not settings.use_real_llm:
        t0 = time.monotonic()
        output = mock.generate(schema_name, f"{system}\n{user}")
        return output, _empty_meta("mock", int((time.monotonic() - t0) * 1000))

    # ── Real OpenAI-compatible path ───────────────────────────────────────────
    schema_str = json.dumps(schema.model_json_schema(), indent=2)
    messages = [
        {"role": "system",
         "content": f"{system}\n\nRespond with ONLY a JSON object that matches this schema "
                    f"exactly. No markdown, no commentary.\n\nSchema:\n{schema_str}"},
        {"role": "user", "content": user},
    ]

    t0 = time.monotonic()
    response = await _openai.chat.completions.create(  # type: ignore[union-attr]
        model=MODEL,
        messages=messages,
        temperature=settings.llm_temperature,
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    raw = (response.choices[0].message.content or "{}").strip()
    output = json.loads(_strip_fences(raw))

    usage = response.usage
    meta = _empty_meta("qwen", latency_ms)
    if usage:
        meta["input_tokens"] = usage.prompt_tokens
        meta["output_tokens"] = usage.completion_tokens
    return output, meta


async def stream_text(system: str, user: str) -> AsyncGenerator[str, None]:
    """Yield natural-language text deltas as the model produces them (typewriter streaming).

    Real path streams tokens from the OpenAI-compatible endpoint; the offline mock streams a
    canned answer word-by-word so the UI behaves identically without a GPU.
    """
    if not settings.use_real_llm:
        canned = (
            "I'm running in offline mock mode right now, so I can't reason over live data — "
            "but once the Qwen endpoint is connected I can answer questions about your customers, "
            "segments and campaigns, and build a campaign whenever you ask."
        )
        for word in canned.split(" "):
            yield word + " "
            await asyncio.sleep(0.02)
        return

    stream = await _openai.chat.completions.create(  # type: ignore[union-attr]
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=settings.llm_temperature,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
