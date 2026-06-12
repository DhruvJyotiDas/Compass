"""Channel service — receives batch sends from CRM, simulates lifecycle callbacks."""
import asyncio
import logging

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.simulator import CHAOS_PROFILES, set_profile, simulate_communication

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("channel-service")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    crm_receipt_url: str = "http://crm-api:8000"
    channel_hmac_secret: str = "dev-secret-change-in-prod"
    chaos_profile: str = "calm"


settings = Settings()

app = FastAPI(title="Compass Channel Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Shared httpx client
_http: httpx.AsyncClient | None = None


@app.on_event("startup")
async def startup():
    global _http
    _http = httpx.AsyncClient()
    set_profile(settings.chaos_profile)
    log.info("Channel service started, chaos profile: %s", settings.chaos_profile)


@app.on_event("shutdown")
async def shutdown():
    if _http:
        await _http.aclose()


class CommItem(BaseModel):
    communication_id: str
    customer_id: str
    channel: str
    message: str
    subject: str | None = None
    variant: str | None = None
    campaign_id: str


class BatchRequest(BaseModel):
    communications: list[CommItem]


@app.post("/send/batch")
async def send_batch(body: BatchRequest):
    """Accept batch, fire-and-forget lifecycle simulation for each."""
    for comm in body.communications:
        asyncio.create_task(
            simulate_communication(
                _http,
                settings.crm_receipt_url,
                settings.channel_hmac_secret,
                comm.model_dump(),
            )
        )
    return {"accepted": len(body.communications)}


class ProfileRequest(BaseModel):
    profile: str


@app.put("/chaos-profile")
async def update_chaos_profile(body: ProfileRequest):
    if body.profile not in CHAOS_PROFILES:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unknown profile: {body.profile}. Choose from: {list(CHAOS_PROFILES)}")
    result = set_profile(body.profile)
    log.info("Chaos profile changed to: %s", body.profile)
    return result


@app.get("/chaos-profile")
async def get_chaos_profile():
    from app.simulator import _current_profile
    return {"current": _current_profile}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "channel"}
