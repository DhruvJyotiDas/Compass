"""Shared helpers for CRM module routers: pagination, ownership scoping, timeline."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import sees_all_records
from app.models import TimelineEvent, User


async def paginate(db: AsyncSession, stmt, page: int, per_page: int):
    """Return (rows, total) for a SELECT statement."""
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    page = max(1, page)
    per_page = max(1, min(per_page, 200))
    rows = (await db.execute(stmt.limit(per_page).offset((page - 1) * per_page))).scalars().all()
    return rows, int(total or 0)


def scope_to_user(stmt, model, user: User):
    """Org-scope every query; restrict reps to records they own."""
    stmt = stmt.where(model.org_id == user.org_id)
    if not sees_all_records(user) and hasattr(model, "owner_id"):
        stmt = stmt.where(model.owner_id == user.id)
    return stmt


def apply_sort(stmt, model, sort: Optional[str]):
    """sort = 'field' (asc) or '-field' (desc)."""
    if not sort:
        return stmt
    desc = sort.startswith("-")
    field = sort[1:] if desc else sort
    col = getattr(model, field, None)
    if col is None:
        return stmt
    return stmt.order_by(col.desc() if desc else col.asc())


async def record_timeline(
    db: AsyncSession,
    user: User,
    module: str,
    record_id: str,
    verb: str,
    meta: Optional[dict[str, Any]] = None,
):
    db.add(
        TimelineEvent(
            org_id=user.org_id,
            actor_id=user.id,
            module=module,
            record_id=record_id,
            verb=verb,
            meta=meta or {},
        )
    )
