"""Workflow automation engine — condition evaluation + action execution."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Activity, AssignmentRule, ScoringRule, WorkflowAction, WorkflowLog, WorkflowRule

log = logging.getLogger("compass.workflow")


# ── Condition evaluation ──────────────────────────────────────────────────────

def _eval_condition(record: Any, cond: dict) -> bool:
    field = cond.get("field", "")
    op = cond.get("op", "eq")
    expected = cond.get("value")
    actual = getattr(record, field, None)

    if op == "is_empty":
        return actual is None or str(actual).strip() == ""
    if op == "not_empty":
        return actual is not None and str(actual).strip() != ""

    if op in ("gt", "lt", "gte", "lte"):
        try:
            a = float(actual) if actual is not None else None
            e = float(expected) if expected is not None else None
            if a is None or e is None:
                return False
            return {"gt": a > e, "lt": a < e, "gte": a >= e, "lte": a <= e}[op]
        except (TypeError, ValueError):
            return False

    a_str = str(actual).lower() if actual is not None else ""
    e_str = str(expected).lower() if expected is not None else ""

    if op == "eq":
        return a_str == e_str
    if op == "neq":
        return a_str != e_str
    if op == "contains":
        return e_str in a_str
    if op == "not_contains":
        return e_str not in a_str
    if op == "starts_with":
        return a_str.startswith(e_str)
    if op == "ends_with":
        return a_str.endswith(e_str)
    return False


def _conditions_match(record: Any, conditions: list[dict]) -> bool:
    return not conditions or all(_eval_condition(record, c) for c in conditions)


# ── Action execution ──────────────────────────────────────────────────────────

async def _execute_action(db: AsyncSession, org_id: str, module: str, record: Any, action: WorkflowAction) -> dict:
    atype = action.action_type
    cfg = action.config or {}

    if atype == "field_update":
        field = cfg.get("field")
        value = cfg.get("value")
        if field and hasattr(record, field):
            setattr(record, field, value)
            return {"action": "field_update", "field": field, "value": value}

    elif atype == "create_task":
        subject = cfg.get("subject", "Follow up")
        priority = cfg.get("priority", "normal")
        due_days = int(cfg.get("due_days", 1))
        due = datetime.now(timezone.utc) + timedelta(days=due_days)
        db.add(Activity(
            org_id=org_id,
            owner_id=getattr(record, "owner_id", None),
            type="task",
            subject=subject,
            priority=priority,
            status="open",
            due_date=due,
            related_module=module,
            related_id=record.id,
        ))
        return {"action": "create_task", "subject": subject}

    elif atype == "webhook":
        url = cfg.get("url", "")
        method = cfg.get("method", "POST").upper()
        if url:
            try:
                import httpx
                payload = {"org_id": org_id, "module": module, "record_id": record.id}
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.request(method, url, json=payload)
                return {"action": "webhook", "url": url, "status": resp.status_code}
            except Exception as exc:
                return {"action": "webhook", "url": url, "error": str(exc)}

    return {"action": atype, "status": "skipped"}


# ── Public API ────────────────────────────────────────────────────────────────

async def run_workflow_rules(
    db: AsyncSession,
    org_id: str,
    module: str,
    trigger: str,
    record: Any,
) -> None:
    stmt = (
        select(WorkflowRule)
        .where(
            WorkflowRule.org_id == org_id,
            WorkflowRule.module == module,
            WorkflowRule.trigger == trigger,
            WorkflowRule.is_active.is_(True),
        )
        .options(selectinload(WorkflowRule.actions))
    )
    rules = (await db.execute(stmt)).scalars().all()

    for rule in rules:
        if not _conditions_match(record, rule.conditions or []):
            db.add(WorkflowLog(
                org_id=org_id, rule_id=rule.id,
                record_module=module, record_id=record.id,
                status="skipped", detail={"reason": "conditions_not_met"},
            ))
            continue

        results: list[dict] = []
        try:
            for action in rule.actions:
                result = await _execute_action(db, org_id, module, record, action)
                results.append(result)
            db.add(WorkflowLog(
                org_id=org_id, rule_id=rule.id,
                record_module=module, record_id=record.id,
                status="success", detail={"actions": results},
            ))
        except Exception as exc:
            log.exception("Workflow rule %s failed on %s %s", rule.id, module, record.id)
            db.add(WorkflowLog(
                org_id=org_id, rule_id=rule.id,
                record_module=module, record_id=record.id,
                status="failed", detail={"error": str(exc)},
            ))


async def apply_assignment_rule(
    db: AsyncSession,
    org_id: str,
    module: str,
    record: Any,
) -> None:
    """Round-robin or criteria-based auto-assign on record create."""
    stmt = select(AssignmentRule).where(
        AssignmentRule.org_id == org_id,
        AssignmentRule.module == module,
        AssignmentRule.is_active.is_(True),
    ).limit(1)
    rule = (await db.execute(stmt)).scalar_one_or_none()
    if not rule or not rule.assignees:
        return

    if rule.strategy == "round_robin":
        idx = rule.current_index % len(rule.assignees)
        rule.current_index = idx + 1
        if hasattr(record, "owner_id"):
            record.owner_id = rule.assignees[idx]
    elif rule.strategy == "criteria":
        if _conditions_match(record, rule.criteria or []) and hasattr(record, "owner_id"):
            record.owner_id = rule.assignees[0]


async def apply_scoring_rules(
    db: AsyncSession,
    org_id: str,
    module: str,
    record: Any,
) -> None:
    """Recompute record.score from all active scoring rules."""
    if not hasattr(record, "score"):
        return
    stmt = select(ScoringRule).where(
        ScoringRule.org_id == org_id,
        ScoringRule.module == module,
        ScoringRule.is_active.is_(True),
    )
    rules = (await db.execute(stmt)).scalars().all()
    total = 0
    for rule in rules:
        for crit in (rule.criteria or []):
            cond = {k: v for k, v in crit.items() if k != "score"}
            if _eval_condition(record, cond):
                total += int(crit.get("score", 0))
    record.score = total
