"""SSE broadcast hub for real-time campaign dashboard updates."""
import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/campaigns", tags=["events"])

# campaign_id → list of asyncio.Queue
_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)


async def broadcast(campaign_id: str, event_type: str, data: dict) -> None:
    """Called by receipts router to push events to all SSE subscribers."""
    payload = json.dumps({"type": event_type, "data": data})
    dead = []
    for q in _subscribers[campaign_id]:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _subscribers[campaign_id].remove(q)


@router.get("/{campaign_id}/stream")
async def campaign_stream(campaign_id: str):
    q: asyncio.Queue = asyncio.Queue(maxsize=512)
    _subscribers[campaign_id].append(q)

    async def generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30)
                    yield {"event": "message", "data": data}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            try:
                _subscribers[campaign_id].remove(q)
            except ValueError:
                pass

    return EventSourceResponse(generator())
