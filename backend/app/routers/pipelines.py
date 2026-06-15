"""Pipeline router — triggers 5-step Claude pipeline, streams steps via SSE."""
import asyncio
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.ai.pipeline import run_pipeline
from app.config import settings
from app.database import AsyncSessionLocal, get_db
from app.models import AIRun, Campaign
from app.schemas import PipelineRequest

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

# In-memory store: pipeline_id → list of completed step events
# This lets the frontend reconnect and replay missed steps
_pipeline_events: dict[str, list[dict]] = {}


def _build_run(pipeline_id: str, goal_text: str, event: dict) -> AIRun:
    """Build an ai_runs row from a pipeline step event (token + latency stats)."""
    meta = event.get("meta", {})
    return AIRun(
        pipeline_id=pipeline_id,
        step=event["step"],
        input={"goal_text": goal_text},
        output={
            **event["output"],
            "_meta": {
                "input_tokens": meta.get("input_tokens", 0),
                "output_tokens": meta.get("output_tokens", 0),
                "cache_read_tokens": meta.get("cache_read_tokens", 0),
                "cache_creation_tokens": meta.get("cache_creation_tokens", 0),
            },
        },
        valid=event["valid"],
        latency_ms=meta.get("latency_ms", 0),
        model=meta.get("model") or settings.llm_model,
    )


async def _finalize_campaign(
    db: AsyncSession, pipeline_id: str, goal_text: str, steps_data: dict[str, Any]
) -> Campaign:
    """Create the draft campaign from completed steps and stamp ai_runs with its id."""
    intent = steps_data.get("intent", {}).get("output", {})
    dsl = steps_data.get("segment_dsl", {}).get("output", {})
    plan = steps_data.get("campaign_plan", {}).get("output", {})
    variants = steps_data.get("message_copy", {}).get("output", {}).get("variants", [])

    campaign = Campaign(
        name=intent.get("campaign_name", "New Campaign"),
        goal_text=goal_text,
        intent=intent,
        segment_dsl=dsl,
        plan=plan,
        message_variants=variants,
        status="draft",
        pipeline_id=pipeline_id,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    await db.execute(
        text("UPDATE ai_runs SET campaign_id = :cid WHERE pipeline_id = :pid"),
        {"cid": campaign.id, "pid": pipeline_id},
    )
    await db.commit()
    return campaign


@router.post("")
async def trigger_pipeline(body: PipelineRequest, db: AsyncSession = Depends(get_db)):
    """
    Runs the pipeline synchronously and saves results, returning the full payload
    in one response. Kept as a fallback for clients that can't consume SSE; the UI
    uses GET /pipelines/run-stream for live per-step progress.
    """
    pipeline_id = str(uuid.uuid4())
    _pipeline_events[pipeline_id] = []
    steps_data: dict[str, Any] = {}

    async for event in run_pipeline(body.goal_text):
        if event["step"] == "done":
            break
        steps_data[event["step"]] = event
        _pipeline_events[pipeline_id].append(event)
        db.add(_build_run(pipeline_id, body.goal_text, event))
    await db.commit()

    campaign = await _finalize_campaign(db, pipeline_id, body.goal_text, steps_data)
    return {"pipeline_id": pipeline_id, "campaign_id": campaign.id, "steps": steps_data}


@router.get("/run-stream")
async def run_pipeline_stream(goal_text: str):
    """
    Live SSE: runs the pipeline and emits each step the instant it completes, so the
    UI shows real progress (and real latency) instead of waiting for the whole run.
    Emits `step` events per stage, a final `done` event with the campaign id, or
    an `error` event. Uses its own DB session — the request-scoped one closes early
    for streaming responses.
    """
    async def event_generator():
        pipeline_id = str(uuid.uuid4())
        _pipeline_events[pipeline_id] = []
        steps_data: dict[str, Any] = {}
        async with AsyncSessionLocal() as db:
            try:
                async for event in run_pipeline(goal_text):
                    if event["step"] == "done":
                        break
                    steps_data[event["step"]] = event
                    _pipeline_events[pipeline_id].append(event)
                    db.add(_build_run(pipeline_id, goal_text, event))
                    await db.commit()
                    yield {"event": "step", "data": json.dumps(event)}

                campaign = await _finalize_campaign(db, pipeline_id, goal_text, steps_data)
                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"pipeline_id": pipeline_id, "campaign_id": campaign.id}
                    ),
                }
            except Exception as exc:  # surface failures to the client as an SSE event
                yield {"event": "error", "data": json.dumps({"detail": str(exc)})}

    return EventSourceResponse(event_generator())


@router.get("/{pipeline_id}/stream")
async def stream_pipeline(pipeline_id: str):
    """SSE endpoint — replay cached steps for a known pipeline id."""
    async def event_generator():
        for ev in _pipeline_events.get(pipeline_id, []):
            yield {"event": "step", "data": json.dumps(ev)}
            await asyncio.sleep(0)
        yield {"event": "done", "data": json.dumps({"pipeline_id": pipeline_id})}

    return EventSourceResponse(event_generator())


@router.get("/{pipeline_id}/runs")
async def get_runs(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AIRun).where(AIRun.pipeline_id == pipeline_id).order_by(AIRun.created_at)
    )
    runs = result.scalars().all()
    return [
        {
            "step": r.step,
            "output": r.output,
            "valid": r.valid,
            "latency_ms": r.latency_ms,
            "model": r.model,
        }
        for r in runs
    ]
