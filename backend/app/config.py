from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://compass:compass@localhost:5432/compass"
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    channel_service_url: str = "http://channel:8001"
    channel_hmac_secret: str = "dev-secret-change-in-prod"
    crm_receipt_url: str = "http://crm-api:8000/receipts"

    admin_secret: str = "dev-admin-secret"

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


settings = Settings()
