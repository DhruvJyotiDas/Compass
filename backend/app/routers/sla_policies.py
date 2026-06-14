"""SLA Policies — CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_schemas import SLAPolicyCreate, SLAPolicyOut, SLAPolicyUpdate
from app.database import get_db
from app.models import SLAPolicy, User

router = APIRouter(prefix="/sla-policies", tags=["sla-policies"])


def _scope(stmt, user):
    return stmt.where(SLAPolicy.org_id == user.org_id)


@router.get("", response_model=list[SLAPolicyOut])
async def list_sla_policies(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(_scope(select(SLAPolicy), user))).scalars().all()
    return rows


@router.post("", response_model=SLAPolicyOut)
async def create_sla_policy(
    body: SLAPolicyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    p = SLAPolicy(org_id=user.org_id, **body.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _get(db, user, pid) -> SLAPolicy:
    obj = (await db.execute(_scope(select(SLAPolicy).where(SLAPolicy.id == pid), user))).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "SLA policy not found")
    return obj


@router.get("/{pid}", response_model=SLAPolicyOut)
async def get_sla_policy(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, pid)


@router.patch("/{pid}", response_model=SLAPolicyOut)
async def update_sla_policy(
    pid: str,
    body: SLAPolicyUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, pid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{pid}")
async def delete_sla_policy(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, pid)
    await db.delete(obj)
    await db.commit()
    return {"deleted": pid}
