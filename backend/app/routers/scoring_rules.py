"""Scoring rules — compute lead/deal scores from field criteria."""
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
from app.models import ScoringRule, User

router = APIRouter(prefix="/scoring-rules", tags=["workflow"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ScoringCriterion(BaseModel):
    field: str
    op: str
    value: Optional[str] = None
    score: int


class ScoringRuleCreate(BaseModel):
    name: str
    module: str
    criteria: list[ScoringCriterion] = []
    is_active: bool = True


class ScoringRuleOut(ORMModel):
    id: str
    org_id: str
    name: str
    module: str
    criteria: list
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get(db: AsyncSession, org_id: str, rule_id: str) -> ScoringRule:
    r = (await db.execute(
        select(ScoringRule).where(ScoringRule.id == rule_id, ScoringRule.org_id == org_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Scoring rule not found")
    return r


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ScoringRuleOut])
async def list_rules(
    module: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ScoringRule).where(ScoringRule.org_id == user.org_id)
    if module:
        stmt = stmt.where(ScoringRule.module == module)
    stmt = stmt.order_by(ScoringRule.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=ScoringRuleOut)
async def create_rule(
    body: ScoringRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = ScoringRule(
        org_id=user.org_id,
        name=body.name,
        module=body.module,
        criteria=[c.model_dump() for c in body.criteria],
        is_active=body.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/{rule_id}", response_model=ScoringRuleOut)
async def get_rule(rule_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user.org_id, rule_id)


@router.put("/{rule_id}", response_model=ScoringRuleOut)
async def update_rule(
    rule_id: str,
    body: ScoringRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get(db, user.org_id, rule_id)
    rule.name = body.name
    rule.module = body.module
    rule.criteria = [c.model_dump() for c in body.criteria]
    rule.is_active = body.is_active
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}/toggle", response_model=ScoringRuleOut)
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
