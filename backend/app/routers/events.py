"""SSE broadcast hub for real-time campaign dashboard + global chaos feed."""
import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/campaigns", tags=["events"])
global_router = APIRouter(prefix="/events", tags=["events"])

# campaign_id → list of asyncio.Queue (per-campaign dashboards)
_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
# Global subscribers: receive every receipt event for the chaos panel
_global_subscribers: list[asyncio.Queue] = []


async def broadcast(campaign_id: str, event_type: str, data: dict) -> None:
    """Push an event to per-campaign subscribers AND global subscribers."""
    payload = json.dumps({"type": event_type, "campaign_id": campaign_id, "data": data})
    dead: list[asyncio.Queue] = []
    for q in _subscribers[campaign_id]:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _subscribers[campaign_id].remove(q)

    dead_global: list[asyncio.Queue] = []
    for q in _global_subscribers:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead_global.append(q)
    for q in dead_global:
        _global_subscribers.remove(q)


@router.get("/{campaign_id}/stream")
async def campaign_stream(campaign_id: str):
    q: asyncio.Queue = asyncio.Queue(maxsize=512)
    _subscribers[campaign_id].append(q)

    async def generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=60)
                    yield {"event": "message", "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            try:
                _subscribers[campaign_id].remove(q)
                if not _subscribers[campaign_id]:
                    del _subscribers[campaign_id]
            except (ValueError, KeyError):
                pass

    return EventSourceResponse(generator())


@global_router.get("/stream")
async def global_stream():
    """Every receipt event, across all campaigns — for the chaos panel."""
    q: asyncio.Queue = asyncio.Queue(maxsize=1024)
    _global_subscribers.append(q)

    async def generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=60)
                    yield {"event": "message", "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            try:
                _global_subscribers.remove(q)
            except ValueError:
                pass

    return EventSourceResponse(generator())
