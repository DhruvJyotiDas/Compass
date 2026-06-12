"""Single Anthropic client — the only place that knows where inference lives."""
import anthropic

from app.config import settings

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
MODEL = settings.claude_model
