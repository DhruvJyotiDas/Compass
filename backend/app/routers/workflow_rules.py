"""Workflow rules — CRUD + execution logs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, require_perm
from app.crm_schemas import ORMModel, Page
from app.database import get_db
from app.models import User, WorkflowAction, WorkflowLog, WorkflowRule

router = APIRouter(prefix="/workflow-rules", tags=["workflow"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class ConditionSchema(BaseModel):
    field: str
    op: str
    value: Optional[str] = None


class ActionSchema(BaseModel):
    sort_order: int = 0
    action_type: str
    config: dict[str, Any] = {}


class WorkflowRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    module: str
    trigger: str
    conditions: list[ConditionSchema] = []
    actions: list[ActionSchema] = []
    is_active: bool = True


class WorkflowActionOut(ORMModel):
    id: str
    rule_id: str
    sort_order: int
    action_type: str
    config: dict


class WorkflowRuleOut(ORMModel):
    id: str
    org_id: str
    name: str
    description: Optional[str] = None
    module: str
    trigger: str
    conditions: list
    is_active: bool
    created_at: datetime
    updated_at: datetime
    actions: list[WorkflowActionOut] = []


class WorkflowLogOut(ORMModel):
    id: str
    rule_id: Optional[str] = None
    org_id: str
    record_module: str
    record_id: str
    triggered_at: datetime
    status: str
    detail: dict


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_rule(db: AsyncSession, org_id: str, rule_id: str) -> WorkflowRule:
    stmt = (
        select(WorkflowRule)
        .where(WorkflowRule.id == rule_id, WorkflowRule.org_id == org_id)
        .options(selectinload(WorkflowRule.actions))
    )
    rule = (await db.execute(stmt)).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Workflow rule not found")
    return rule


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WorkflowRuleOut])
async def list_rules(
    module: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(WorkflowRule)
        .where(WorkflowRule.org_id == user.org_id)
        .options(selectinload(WorkflowRule.actions))
    )
    if module:
        stmt = stmt.where(WorkflowRule.module == module)
    stmt = stmt.order_by(WorkflowRule.created_at.desc())
    rules = (await db.execute(stmt)).scalars().all()
    return rules


@router.post("", response_model=WorkflowRuleOut)
async def create_rule(
    body: WorkflowRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = WorkflowRule(
        org_id=user.org_id,
        created_by=user.id,
        name=body.name,
        description=body.description,
        module=body.module,
        trigger=body.trigger,
        conditions=[c.model_dump() for c in body.conditions],
        is_active=body.is_active,
    )
    db.add(rule)
    await db.flush()
    for i, a in enumerate(body.actions):
        db.add(WorkflowAction(
            rule_id=rule.id,
            sort_order=a.sort_order if a.sort_order else i,
            action_type=a.action_type,
            config=a.config,
        ))
    await db.commit()
    return await _get_rule(db, user.org_id, rule.id)


@router.get("/logs", response_model=Page[WorkflowLogOut])
async def list_logs(
    module: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowLog).where(WorkflowLog.org_id == user.org_id)
    if module:
        stmt = stmt.where(WorkflowLog.record_module == module)
    if status:
        stmt = stmt.where(WorkflowLog.status == status)
    stmt = stmt.order_by(WorkflowLog.triggered_at.desc())
    from app.crm_common import paginate
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.get("/{rule_id}", response_model=WorkflowRuleOut)
async def get_rule(
    rule_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_rule(db, user.org_id, rule_id)


@router.put("/{rule_id}", response_model=WorkflowRuleOut)
async def update_rule(
    rule_id: str,
    body: WorkflowRuleCreate,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, user.org_id, rule_id)
    rule.name = body.name
    rule.description = body.description
    rule.module = body.module
    rule.trigger = body.trigger
    rule.conditions = [c.model_dump() for c in body.conditions]
    rule.is_active = body.is_active

    # Replace actions
    for action in list(rule.actions):
        await db.delete(action)
    await db.flush()
    for i, a in enumerate(body.actions):
        db.add(WorkflowAction(
            rule_id=rule.id,
            sort_order=a.sort_order if a.sort_order else i,
            action_type=a.action_type,
            config=a.config,
        ))
    await db.commit()
    return await _get_rule(db, user.org_id, rule_id)


@router.patch("/{rule_id}/toggle", response_model=WorkflowRuleOut)
async def toggle_rule(
    rule_id: str,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, user.org_id, rule_id)
    rule.is_active = not rule.is_active
    await db.commit()
    return await _get_rule(db, user.org_id, rule_id)


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    user: User = Depends(require_perm("manage_settings")),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(db, user.org_id, rule_id)
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}
