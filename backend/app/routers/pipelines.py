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
from app.database import get_db
from app.models import AIRun, Campaign
from app.schemas import PipelineRequest

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

# In-memory store: pipeline_id → list of completed step events
# This lets the frontend reconnect and replay missed steps
_pipeline_events: dict[str, list[dict]] = {}


@router.post("")
async def trigger_pipeline(body: PipelineRequest, db: AsyncSession = Depends(get_db)):
    """
    Runs the 5-step pipeline synchronously and saves results.
    Returns campaign_id + pipeline_id for the frontend to subscribe to the stream.
    Fast path for when SSE is not available.
    """
    pipeline_id = str(uuid.uuid4())
    _pipeline_events[pipeline_id] = []

    steps_data: dict[str, Any] = {}

    async for event in run_pipeline(body.goal_text):
        step = event["step"]
        if step == "done":
            break
        steps_data[step] = event
        _pipeline_events[pipeline_id].append(event)

        # Persist each step to ai_runs
        run = AIRun(
            pipeline_id=pipeline_id,
            step=step,
            input={"goal_text": body.goal_text},
            output=event["output"],
            valid=event["valid"],
            latency_ms=event["latency_ms"],
            model="claude-sonnet-4-6",
        )
        db.add(run)

    await db.commit()

    # Create draft campaign
    intent = steps_data.get("intent", {}).get("output", {})
    dsl = steps_data.get("segment_dsl", {}).get("output", {})
    plan = steps_data.get("campaign_plan", {}).get("output", {})
    variants = steps_data.get("message_copy", {}).get("output", {}).get("variants", [])

    campaign = Campaign(
        name=intent.get("campaign_name", "New Campaign"),
        goal_text=body.goal_text,
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

    # Update ai_runs with campaign_id
    await db.execute(
        text("UPDATE ai_runs SET campaign_id = :cid WHERE pipeline_id = :pid"),
        {"cid": campaign.id, "pid": pipeline_id},
    )
    await db.commit()

    return {"pipeline_id": pipeline_id, "campaign_id": campaign.id, "steps": steps_data}


@router.get("/{pipeline_id}/stream")
async def stream_pipeline(pipeline_id: str):
    """SSE endpoint — replay cached steps or wait for new ones."""
    async def event_generator():
        events = _pipeline_events.get(pipeline_id, [])
        for ev in events:
            yield {"event": "step_complete", "data": json.dumps(ev)}
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
