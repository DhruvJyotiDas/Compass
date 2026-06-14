"""Goals — sales target tracking per user or org."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import paginate
from app.crm_schemas import Page
from app.database import get_db
from app.models import Goal, User

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalIn(BaseModel):
    name: str
    metric: str  # revenue_won|deals_won|leads_created|activities_completed
    target_value: float
    period_type: str = "monthly"  # monthly|quarterly|annual
    period_start: datetime
    period_end: datetime
    owner_id: Optional[str] = None


class GoalOut(BaseModel):
    id: str
    org_id: str
    owner_id: Optional[str]
    name: str
    metric: str
    target_value: float
    period_type: str
    period_start: datetime
    period_end: datetime
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("", response_model=Page[GoalOut])
async def list_goals(
    page: int = 1,
    size: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Goal)
        .where(Goal.org_id == user.org_id)
        .order_by(Goal.period_start.desc())
    )
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def create_goal(
    payload: GoalIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(
        id=str(uuid4()),
        org_id=user.org_id,
        **payload.model_dump(),
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.get("/{goal_id}", response_model=GoalOut)
async def get_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await db.scalar(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == user.org_id)
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.put("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: str,
    payload: GoalIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await db.scalar(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == user.org_id)
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await db.scalar(
        select(Goal).where(Goal.id == goal_id, Goal.org_id == user.org_id)
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await db.delete(goal)
    await db.commit()
