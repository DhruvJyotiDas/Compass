"""Deal pipelines & stages configuration."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, require_perm
from app.crm_schemas import PipelineCreate, PipelineOut, StageIn, StageOut
from app.database import get_db
from app.models import Pipeline, Stage, User

router = APIRouter(prefix="/deal-pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineOut])
async def list_pipelines(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Pipeline).where(Pipeline.org_id == user.org_id)
        .options(selectinload(Pipeline.stages)).order_by(Pipeline.created_at)
    )).scalars().all()
    return rows


@router.post("", response_model=PipelineOut)
async def create_pipeline(body: PipelineCreate, admin: User = Depends(require_perm("manage_settings")), db: AsyncSession = Depends(get_db)):
    p = Pipeline(org_id=admin.org_id, name=body.name, is_default=body.is_default)
    db.add(p)
    await db.flush()
    for i, s in enumerate(body.stages):
        db.add(Stage(pipeline_id=p.id, name=s.name, sort_order=s.sort_order or i,
                     probability=s.probability, type=s.type))
    await db.commit()
    p = (await db.execute(
        select(Pipeline).where(Pipeline.id == p.id).options(selectinload(Pipeline.stages))
    )).scalar_one()
    return p


@router.post("/{pid}/stages", response_model=StageOut)
async def add_stage(pid: str, body: StageIn, admin: User = Depends(require_perm("manage_settings")), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Pipeline).where(Pipeline.id == pid, Pipeline.org_id == admin.org_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Pipeline not found")
    s = Stage(pipeline_id=pid, name=body.name, sort_order=body.sort_order, probability=body.probability, type=body.type)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@router.delete("/stages/{sid}")
async def delete_stage(sid: str, admin: User = Depends(require_perm("manage_settings")), db: AsyncSession = Depends(get_db)):
    s = (await db.execute(
        select(Stage).join(Pipeline, Stage.pipeline_id == Pipeline.id)
        .where(Stage.id == sid, Pipeline.org_id == admin.org_id)
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Stage not found")
    await db.delete(s)
    await db.commit()
    return {"deleted": sid}
