"""
Channel simulator — models the full lifecycle of a communication.
For each message, asynchronously fires HMAC-signed callbacks back to the CRM.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger("simulator")

CHAOS_PROFILES = {
    "calm":      {"dup_rate": 0.00, "reorder_rate": 0.00, "fail_rate": 0.00},
    "realistic": {"dup_rate": 0.03, "reorder_rate": 0.08, "fail_rate": 0.02},
    "hostile":   {"dup_rate": 0.25, "reorder_rate": 0.40, "fail_rate": 0.18},
}

# Global mutable chaos profile (changed via API)
_current_profile: dict[str, float] = CHAOS_PROFILES["calm"].copy()

# Lifecycle progression by channel
CHANNEL_LIFECYCLE = {
    "whatsapp": ["sent", "delivered", "opened", "read", "clicked"],
    "email":    ["sent", "delivered", "opened", "clicked"],
    "sms":      ["sent", "delivered", "clicked"],
}

# Realistic delays between lifecycle events (seconds, scaled down for demo)
EVENT_DELAYS = {
    "sent":      (0.5, 1.5),
    "delivered": (1, 3),
    "opened":    (5, 30),
    "read":      (2, 10),
    "clicked":   (10, 60),
}

# Probability of each event in the chain actually occurring
EVENT_PROBABILITY = {
    "sent":      1.0,
    "delivered": 0.96,
    "opened":    0.55,
    "read":      0.40,
    "clicked":   0.20,
}


def set_profile(name: str) -> dict:
    global _current_profile
    profile = CHAOS_PROFILES.get(name, CHAOS_PROFILES["calm"])
    _current_profile = profile.copy()
    return {"profile": name, **profile}


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def _send_callback(
    http: httpx.AsyncClient,
    crm_url: str,
    secret: str,
    comm_id: str,
    event_type: str,
    channel_msg_id: str,
    delay: float,
) -> None:
    await asyncio.sleep(delay)
    payload = {
        "communication_id": comm_id,
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "channel_msg_id": channel_msg_id,
    }
    body = json.dumps(payload).encode()
    sig = _sign(body, secret)
    try:
        r = await http.post(
            f"{crm_url}/receipts",
            content=body,
            headers={"Content-Type": "application/json", "X-Signature": sig},
            timeout=10,
        )
        if r.status_code == 409 or (r.status_code == 200 and "duplicate" in r.text):
            log.debug("Duplicate accepted by CRM (idempotent): %s %s", comm_id, event_type)
    except Exception as exc:
        log.warning("Callback failed for %s %s: %s", comm_id, event_type, exc)


async def simulate_communication(
    http: httpx.AsyncClient,
    crm_url: str,
    secret: str,
    comm: dict[str, Any],
) -> None:
    """Simulate the full lifecycle of one communication with chaos injection."""
    p = _current_profile
    comm_id = comm["communication_id"]
    channel = comm.get("channel", "whatsapp")
    lifecycle = CHANNEL_LIFECYCLE.get(channel, CHANNEL_LIFECYCLE["whatsapp"])
    channel_msg_id = f"msg_{uuid.uuid4().hex[:12]}"

    if random.random() < p["fail_rate"]:
        # Simulate hard failure — only send 'failed' event
        await _send_callback(http, crm_url, secret, comm_id, "failed", channel_msg_id, delay=0.3)
        return

    cumulative_delay = 0.0
    events_to_send: list[tuple[str, float]] = []

    for event_type in lifecycle:
        if random.random() > EVENT_PROBABILITY.get(event_type, 1.0):
            break  # Chain stops here

        min_d, max_d = EVENT_DELAYS.get(event_type, (1, 5))
        delay = random.uniform(min_d, max_d)
        cumulative_delay += delay
        events_to_send.append((event_type, cumulative_delay))

    # Chaos: reorder some events
    if random.random() < p["reorder_rate"] and len(events_to_send) > 1:
        i = random.randint(0, len(events_to_send) - 2)
        # Swap delays to simulate out-of-order delivery
        e1, e2 = events_to_send[i], events_to_send[i + 1]
        events_to_send[i] = (e1[0], e2[1])
        events_to_send[i + 1] = (e2[0], e1[1])

    tasks = []
    for event_type, delay in events_to_send:
        tasks.append(
            asyncio.create_task(
                _send_callback(http, crm_url, secret, comm_id, event_type, channel_msg_id, delay)
            )
        )
        # Chaos: duplicate — re-send same event
        if random.random() < p["dup_rate"]:
            tasks.append(
                asyncio.create_task(
                    _send_callback(http, crm_url, secret, comm_id, event_type, channel_msg_id, delay + 0.1)
                )
            )

    await asyncio.gather(*tasks, return_exceptions=True)
