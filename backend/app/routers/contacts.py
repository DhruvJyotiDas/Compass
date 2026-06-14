"""Contacts module — CRUD + list/search."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import ContactCreate, ContactOut, ContactUpdate, Page
from app.database import get_db
from app.models import Contact, User
from app.workflow_engine import apply_assignment_rule, run_workflow_rules

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=Page[ContactOut])
async def list_contacts(
    q: str | None = None,
    account_id: str | None = None,
    owner_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Contact), Contact, user)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Contact.first_name.ilike(like), Contact.last_name.ilike(like), Contact.email.ilike(like)))
    if account_id:
        stmt = stmt.where(Contact.account_id == account_id)
    if owner_id:
        stmt = stmt.where(Contact.owner_id == owner_id)
    stmt = apply_sort(stmt, Contact, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=ContactOut)
async def create_contact(body: ContactCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    c = Contact(org_id=user.org_id, owner_id=data.pop("owner_id") or user.id, **data)
    db.add(c)
    await db.flush()
    await apply_assignment_rule(db, user.org_id, "contact", c)
    await run_workflow_rules(db, user.org_id, "contact", "on_create", c)
    await record_timeline(db, user, "contact", c.id, "created")
    await db.commit()
    await db.refresh(c)
    return c


async def _get(db, user, cid) -> Contact:
    c = (await db.execute(scope_to_user(select(Contact).where(Contact.id == cid), Contact, user))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contact not found")
    return c


@router.get("/{cid}", response_model=ContactOut)
async def get_contact(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, cid)


@router.patch("/{cid}", response_model=ContactOut)
async def update_contact(cid: str, body: ContactUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    c = await _get(db, user, cid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await run_workflow_rules(db, user.org_id, "contact", "on_update", c)
    await record_timeline(db, user, "contact", c.id, "updated")
    await db.commit()
    await db.refresh(c)
    return c


@router.delete("/{cid}")
async def delete_contact(cid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    c = await _get(db, user, cid)
    await db.delete(c)
    await db.commit()
    return {"deleted": cid}
