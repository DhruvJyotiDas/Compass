from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://compass:compass@localhost:5432/compass"

    # ── LLM provider (OpenAI-compatible) ──────────────────────────────────────
    # ONE variable switches inference. Point `llm_base_url` at any OpenAI-compatible
    # server — our self-hosted Qwen2.5-14B-Instruct-AWQ behind vLLM, or
    # Ollama, TGI, OpenAI, etc. Leave it empty to run a deterministic offline MOCK so
    # the entire AI flow (planner → segment → campaign → copy → insights) works before
    # the real endpoint is wired in. Every response is tagged with its provider so no
    # surface ever silently fabricates "AI" output.
    llm_base_url: str = "http://163.128.34.19/v1"   # self-hosted vLLM (Qwen2.5-14B), port 80
    llm_model: str = "/root/test/models/Qwen2.5-14B-Instruct-AWQ"
    llm_api_key: str = "sk-no-auth"              # vLLM ignores this by default
    llm_enabled: bool = True                     # master kill-switch → force mock when False
    llm_temperature: float = 0.2
    llm_timeout_seconds: int = 90

    # Back-compat aliases (legacy Ollama config — still read from env if present)
    ollama_url: str = "http://ollama:11434"
    gemma_model: str = "gemma4:e2b"

    channel_service_url: str = "http://channel:8001"
    channel_hmac_secret: str = "dev-secret-change-in-prod"
    crm_receipt_url: str = "http://crm-api:8000/receipts"

    admin_secret: str = "dev-admin-secret"

    # Auth (JWT)
    jwt_secret: str = "dev-jwt-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Uploads
    upload_dir: str = "uploads"

    # CORS — comma-separated origins, "*" for dev only
    cors_origins: str = "*"

    # HMAC replay protection — reject callbacks older than this (seconds)
    hmac_max_age_seconds: int = 300

    # chaos profile exposed via env so channel-service can read it
    chaos_profile: str = "calm"  # calm | realistic | hostile

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def use_real_llm(self) -> bool:
        """True when a real OpenAI-compatible endpoint is configured."""
        return self.llm_enabled and bool(self.llm_base_url.strip())

    @property
    def llm_provider_name(self) -> str:
        return "Self-hosted Qwen2.5-14B (vLLM)" if self.use_real_llm else "Mock (offline)"


settings = Settings()
