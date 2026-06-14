"""Assignment rules — auto-assign leads/deals/cases to users."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_perm
from app.crm_schemas import ORMModel
from app.database import get_db
from app.models import AssignmentRule, User

router = APIRouter(prefix="/assignment-rules", tags=["workflow"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AssignmentRuleCreate(BaseModel):
    name: str
    module: str
    strategy: str = "round_robin"
    criteria: list[dict[str, Any]] = []
    assignees: list[str] = []
    is_active: bool = True


class AssignmentRuleOut(ORMModel):
    id: str
    org_id: str
    name: str
    module: str
    strategy: str
    criteria: list
    assignees: list
    current_index: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get(db: AsyncSession, org_id: str, rule_id: str) -> AssignmentRule:
    r = (await db.execute(
        select(AssignmentRule).where(AssignmentRule.id == rule_id, AssignmentRule.org_id == org_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Assignment rule not found")
    return r


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AssignmentRuleOut])
async def list_rules(
    module: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AssignmentRule).where(AssignmentRule.org_id == user.org_id)
    if module:
        stmt = stmt.where(AssignmentRule.module == module)
    stmt = stmt.order_by(AssignmentRule.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=AssignmentRuleOut)
async def create_rule(
    body: AssignmentRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = AssignmentRule(
        org_id=user.org_id,
        name=body.name,
        module=body.module,
        strategy=body.strategy,
        criteria=body.criteria,
        assignees=body.assignees,
        is_active=body.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/{rule_id}", response_model=AssignmentRuleOut)
async def get_rule(rule_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user.org_id, rule_id)


@router.put("/{rule_id}", response_model=AssignmentRuleOut)
async def update_rule(
    rule_id: str,
    body: AssignmentRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get(db, user.org_id, rule_id)
    rule.name = body.name
    rule.module = body.module
    rule.strategy = body.strategy
    rule.criteria = body.criteria
    rule.assignees = body.assignees
    rule.is_active = body.is_active
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}/toggle", response_model=AssignmentRuleOut)
async def toggle_rule(
    rule_id: str,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get(db, user.org_id, rule_id)
    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get(db, user.org_id, rule_id)
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}
