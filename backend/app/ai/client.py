"""Ollama client (OpenAI-compatible) — the only place that knows where inference lives."""
from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(base_url=f"{settings.ollama_url}/v1", api_key="ollama")
MODEL = settings.gemma_model
