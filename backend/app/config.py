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

    # chaos profile exposed via env so channel-service can read it
    chaos_profile: str = "calm"  # calm | realistic | hostile


settings = Settings()
