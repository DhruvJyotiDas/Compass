"""Cases — support ticket CRUD with SLA deadline computation."""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import CaseCreate, CaseOut, CaseUpdate, Page
from app.database import get_db
from app.models import Case, SLAPolicy, User
from app.workflow_engine import apply_assignment_rule, run_workflow_rules

router = APIRouter(prefix="/cases", tags=["cases"])


def _sla_deadlines(now: datetime, priority: str, sla: SLAPolicy) -> dict:
    resp_hours = getattr(sla, f"response_{priority}", 8)
    res_hours = getattr(sla, f"resolution_{priority}", 72)
    return {
        "sla_first_response_due": now + timedelta(hours=resp_hours),
        "sla_resolution_due": now + timedelta(hours=res_hours),
    }


@router.get("", response_model=Page[CaseOut])
async def list_cases(
    q: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    account_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Case), Case, user)
    if q:
        stmt = stmt.where(or_(Case.subject.ilike(f"%{q}%"), Case.case_number.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Case.status == status)
    if priority:
        stmt = stmt.where(Case.priority == priority)
    if account_id:
        stmt = stmt.where(Case.account_id == account_id)
    stmt = apply_sort(stmt, Case, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=CaseOut)
async def create_case(
    body: CaseCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    count = await db.scalar(select(func.count(Case.id)).where(Case.org_id == user.org_id)) or 0
    case_number = f"CASE-{str(count + 1).zfill(5)}"
    data = body.model_dump()
    sla_policy_id = data.get("sla_policy_id")
    sla_deadlines = {}
    if sla_policy_id:
        sla = (await db.execute(select(SLAPolicy).where(SLAPolicy.id == sla_policy_id, SLAPolicy.org_id == user.org_id))).scalar_one_or_none()
        if sla:
            sla_deadlines = _sla_deadlines(datetime.now(timezone.utc), data.get("priority", "medium"), sla)
    owner_id = data.pop("owner_id", None) or user.id
    c = Case(org_id=user.org_id, owner_id=owner_id, case_number=case_number, **data, **sla_deadlines)
    db.add(c)
    await db.flush()
    await apply_assignment_rule(db, user.org_id, "case", c)
    await run_workflow_rules(db, user.org_id, "case", "on_create", c)
    await record_timeline(db, user, "case", c.id, "created")
    await db.commit()
    await db.refresh(c)
    return c


async def _get(db, user, cid) -> Case:
    stmt = scope_to_user(select(Case).where(Case.id == cid), Case, user)
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Case not found")
    return obj


@router.get("/{cid}", response_model=CaseOut)
async def get_case(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, cid)


@router.patch("/{cid}", response_model=CaseOut)
async def update_case(
    cid: str,
    body: CaseUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, cid)
    data = body.model_dump(exclude_unset=True)
    # Auto-close timestamp
    if data.get("status") == "closed" and not obj.closed_at:
        data["closed_at"] = datetime.now(timezone.utc)
    for k, v in data.items():
        setattr(obj, k, v)
    await run_workflow_rules(db, user.org_id, "case", "on_update", obj)
    await record_timeline(db, user, "case", obj.id, "updated")
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{cid}")
async def delete_case(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, cid)
    await db.delete(obj)
    await db.commit()
    return {"deleted": cid}
