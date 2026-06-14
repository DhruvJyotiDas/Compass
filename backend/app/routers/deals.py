"""Deals (opportunities) module — CRUD, kanban stage move, win/lose."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import DealCreate, DealOut, DealStageMove, DealUpdate, Page
from app.database import get_db
from app.models import Deal, Pipeline, Stage, User
from app.workflow_engine import apply_assignment_rule, run_workflow_rules

router = APIRouter(prefix="/deals", tags=["deals"])


async def _default_pipeline(db, org_id):
    p = (await db.execute(
        select(Pipeline).where(Pipeline.org_id == org_id, Pipeline.is_default == True)  # noqa: E712
    )).scalars().first()
    if not p:
        p = (await db.execute(select(Pipeline).where(Pipeline.org_id == org_id))).scalars().first()
    return p


@router.get("", response_model=Page[DealOut])
async def list_deals(
    q: str | None = None,
    stage_id: str | None = None,
    pipeline_id: str | None = None,
    status: str | None = None,
    owner_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Deal), Deal, user)
    if q:
        stmt = stmt.where(or_(Deal.name.ilike(f"%{q}%")))
    if stage_id:
        stmt = stmt.where(Deal.stage_id == stage_id)
    if pipeline_id:
        stmt = stmt.where(Deal.pipeline_id == pipeline_id)
    if status:
        stmt = stmt.where(Deal.status == status)
    if owner_id:
        stmt = stmt.where(Deal.owner_id == owner_id)
    stmt = apply_sort(stmt, Deal, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=DealOut)
async def create_deal(body: DealCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    pipeline_id = data.pop("pipeline_id", None)
    stage_id = data.pop("stage_id", None)
    if not pipeline_id or not stage_id:
        p = await _default_pipeline(db, user.org_id)
        if not p:
            raise HTTPException(400, "No pipeline configured")
        pipeline_id = pipeline_id or p.id
        if not stage_id:
            s = (await db.execute(
                select(Stage).where(Stage.pipeline_id == pipeline_id).order_by(Stage.sort_order)
            )).scalars().first()
            if not s:
                raise HTTPException(400, "Pipeline has no stages")
            stage_id = s.id
    deal = Deal(org_id=user.org_id, owner_id=data.pop("owner_id") or user.id,
                pipeline_id=pipeline_id, stage_id=stage_id, **data)
    db.add(deal)
    await db.flush()
    await apply_assignment_rule(db, user.org_id, "deal", deal)
    await run_workflow_rules(db, user.org_id, "deal", "on_create", deal)
    await record_timeline(db, user, "deal", deal.id, "created")
    await db.commit()
    await db.refresh(deal)
    return deal


async def _get(db, user, did) -> Deal:
    d = (await db.execute(scope_to_user(select(Deal).where(Deal.id == did), Deal, user))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Deal not found")
    return d


@router.get("/{did}", response_model=DealOut)
async def get_deal(did: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, did)


@router.patch("/{did}", response_model=DealOut)
async def update_deal(did: str, body: DealUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    d = await _get(db, user, did)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    await run_workflow_rules(db, user.org_id, "deal", "on_update", d)
    await record_timeline(db, user, "deal", d.id, "updated")
    await db.commit()
    await db.refresh(d)
    return d


@router.patch("/{did}/stage", response_model=DealOut)
async def move_stage(did: str, body: DealStageMove, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    d = await _get(db, user, did)
    stage = (await db.execute(select(Stage).where(Stage.id == body.stage_id))).scalar_one_or_none()
    if not stage or stage.pipeline_id != d.pipeline_id:
        raise HTTPException(400, "Invalid stage for this pipeline")
    old = d.stage_id
    d.stage_id = stage.id
    d.probability = stage.probability
    if stage.type == "won":
        d.status = "won"
        d.closed_at = datetime.now(timezone.utc)
    elif stage.type == "lost":
        d.status = "lost"
        d.closed_at = datetime.now(timezone.utc)
    else:
        d.status = "open"
        d.closed_at = None
    await record_timeline(db, user, "deal", d.id, "stage_changed",
                          {"from": old, "to": stage.id, "stage_name": stage.name})
    await db.commit()
    await db.refresh(d)
    return d


@router.delete("/{did}")
async def delete_deal(did: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    d = await _get(db, user, did)
    await db.delete(d)
    await db.commit()
    return {"deleted": did}
