"""Activities module — tasks, calls, meetings. CRUD + filters + complete."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import ActivityCreate, ActivityOut, ActivityUpdate, Page
from app.database import get_db
from app.models import Activity, User

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=Page[ActivityOut])
async def list_activities(
    type: str | None = None,
    status: str | None = None,
    related_module: str | None = None,
    related_id: str | None = None,
    owner_id: str | None = None,
    sort: str = "due_date",
    page: int = 1,
    per_page: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Activity), Activity, user)
    if type:
        stmt = stmt.where(Activity.type == type)
    if status:
        stmt = stmt.where(Activity.status == status)
    if related_module:
        stmt = stmt.where(Activity.related_module == related_module)
    if related_id:
        stmt = stmt.where(Activity.related_id == related_id)
    if owner_id:
        stmt = stmt.where(Activity.owner_id == owner_id)
    stmt = apply_sort(stmt, Activity, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=ActivityOut)
async def create_activity(body: ActivityCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    a = Activity(org_id=user.org_id, owner_id=data.pop("owner_id") or user.id, **data)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


async def _get(db, user, aid) -> Activity:
    a = (await db.execute(scope_to_user(select(Activity).where(Activity.id == aid), Activity, user))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Activity not found")
    return a


@router.patch("/{aid}", response_model=ActivityOut)
async def update_activity(aid: str, body: ActivityUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    a = await _get(db, user, aid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    if a.status == "completed" and a.completed_at is None:
        a.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(a)
    return a


@router.delete("/{aid}")
async def delete_activity(aid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    a = await _get(db, user, aid)
    await db.delete(a)
    await db.commit()
    return {"deleted": aid}
