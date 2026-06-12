"""
Transactional outbox worker.
SELECT FOR UPDATE SKIP LOCKED → batch to channel service → backoff on failure.
Run as: python -m app.workers.outbox
"""
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Campaign, Communication, OutboxJob

log = logging.getLogger("outbox")
logging.basicConfig(level=logging.INFO, stream=sys.stdout, format="%(asctime)s %(levelname)s %(message)s")

BATCH_SIZE = 50
POLL_INTERVAL = 2  # seconds
MAX_ATTEMPTS = 5
BACKOFF_BASE = 2  # seconds; attempt n → sleep 2^n seconds


async def _process_batch(db: AsyncSession, http: httpx.AsyncClient) -> int:
    """Fetch up to BATCH_SIZE pending jobs, dispatch to channel, return count processed."""
    result = await db.execute(
        text("""
            SELECT oj.id, oj.communication_id, oj.attempts
            FROM outbox_jobs oj
            WHERE oj.status = 'pending' AND oj.next_attempt_at <= NOW()
            ORDER BY oj.next_attempt_at
            LIMIT :lim
            FOR UPDATE SKIP LOCKED
        """),
        {"lim": BATCH_SIZE},
    )
    rows = result.fetchall()
    if not rows:
        return 0

    job_ids = [str(r.id) for r in rows]
    comm_ids = [str(r.communication_id) for r in rows]
    attempts_map = {str(r.id): r.attempts for r in rows}

    # Mark as processing
    await db.execute(
        text("UPDATE outbox_jobs SET status = 'processing' WHERE id = ANY(:ids)"),
        {"ids": job_ids},
    )
    await db.commit()

    # Fetch communication details
    comm_result = await db.execute(
        select(
            Communication.id,
            Communication.customer_id,
            Communication.channel,
            Communication.message,
            Communication.subject,
            Communication.variant,
            Communication.campaign_id,
        ).where(Communication.id.in_(comm_ids))
    )
    comms = {str(c.id): c for c in comm_result.fetchall()}

    # Build batch payload for channel service
    batch = []
    for comm_id in comm_ids:
        c = comms.get(comm_id)
        if not c:
            continue
        batch.append({
            "communication_id": comm_id,
            "customer_id": str(c.customer_id),
            "channel": c.channel,
            "message": c.message or "",
            "subject": c.subject,
            "variant": c.variant,
            "campaign_id": str(c.campaign_id),
        })

    try:
        resp = await http.post(
            f"{settings.channel_service_url}/send/batch",
            json={"communications": batch},
            timeout=30,
        )
        resp.raise_for_status()

        # Mark done
        await db.execute(
            text("UPDATE outbox_jobs SET status = 'done' WHERE id = ANY(:ids)"),
            {"ids": job_ids},
        )

        # Mark communications as sent
        await db.execute(
            text("UPDATE communications SET status = 'sent' WHERE id = ANY(:ids)"),
            {"ids": comm_ids},
        )
        await db.commit()
        log.info("Dispatched %d communications", len(batch))
        return len(batch)

    except Exception as exc:
        log.warning("Channel service error: %s", exc)
        # Backoff or dead-letter
        now = datetime.now(timezone.utc)
        for row in rows:
            job_id = str(row.id)
            attempts = attempts_map[job_id] + 1
            if attempts >= MAX_ATTEMPTS:
                await db.execute(
                    text("UPDATE outbox_jobs SET status = 'dead', attempts = :a, error = :e WHERE id = :id"),
                    {"a": attempts, "e": str(exc), "id": job_id},
                )
            else:
                backoff = timedelta(seconds=BACKOFF_BASE ** attempts)
                await db.execute(
                    text("UPDATE outbox_jobs SET status = 'pending', attempts = :a, next_attempt_at = :t WHERE id = :id"),
                    {"a": attempts, "t": now + backoff, "id": job_id},
                )
        await db.commit()
        return 0


async def main():
    log.info("Outbox worker starting…")
    async with httpx.AsyncClient() as http:
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    processed = await _process_batch(db, http)
                    if processed:
                        log.info("Batch done: %d", processed)
            except Exception as exc:
                log.error("Worker error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
