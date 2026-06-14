"""Solutions / Knowledge Base — CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate
from app.crm_schemas import Page, SolutionCreate, SolutionOut, SolutionUpdate
from app.database import get_db
from app.models import Solution, User

router = APIRouter(prefix="/solutions", tags=["solutions"])


def _scope(stmt, user):
    return stmt.where(Solution.org_id == user.org_id)


@router.get("", response_model=Page[SolutionOut])
async def list_solutions(
    q: str | None = None,
    status: str | None = None,
    category: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = _scope(select(Solution), user)
    if q:
        stmt = stmt.where(or_(Solution.title.ilike(f"%{q}%"), Solution.body.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Solution.status == status)
    if category:
        stmt = stmt.where(Solution.category == category)
    stmt = apply_sort(stmt, Solution, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=SolutionOut)
async def create_solution(
    body: SolutionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    s = Solution(org_id=user.org_id, author_id=user.id, **body.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def _get(db, user, sid) -> Solution:
    obj = (await db.execute(_scope(select(Solution).where(Solution.id == sid), user))).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Solution not found")
    return obj


@router.get("/{sid}", response_model=SolutionOut)
async def get_solution(sid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _get(db, user, sid)
    # Increment view count
    obj.views = (obj.views or 0) + 1
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{sid}", response_model=SolutionOut)
async def update_solution(
    sid: str,
    body: SolutionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, sid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.post("/{sid}/helpful", response_model=SolutionOut)
async def mark_helpful(sid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    obj = await _get(db, user, sid)
    obj.helpful_votes = (obj.helpful_votes or 0) + 1
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{sid}")
async def delete_solution(sid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, sid)
    await db.delete(obj)
    await db.commit()
    return {"deleted": sid}
