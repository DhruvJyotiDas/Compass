"""Accounts (companies) module — CRUD + list/search."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import AccountCreate, AccountOut, AccountUpdate, Page
from app.database import get_db
from app.models import Account, User

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=Page[AccountOut])
async def list_accounts(
    q: str | None = None,
    type: str | None = None,
    owner_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Account), Account, user)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Account.name.ilike(like), Account.website.ilike(like), Account.email.ilike(like)))
    if type:
        stmt = stmt.where(Account.type == type)
    if owner_id:
        stmt = stmt.where(Account.owner_id == owner_id)
    stmt = apply_sort(stmt, Account, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=AccountOut)
async def create_account(body: AccountCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    acc = Account(org_id=user.org_id, owner_id=data.pop("owner_id") or user.id, **data)
    db.add(acc)
    await db.flush()
    await record_timeline(db, user, "account", acc.id, "created")
    await db.commit()
    await db.refresh(acc)
    return acc


async def _get(db, user, acc_id) -> Account:
    acc = (await db.execute(scope_to_user(select(Account).where(Account.id == acc_id), Account, user))).scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


@router.get("/{acc_id}", response_model=AccountOut)
async def get_account(acc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, acc_id)


@router.patch("/{acc_id}", response_model=AccountOut)
async def update_account(acc_id: str, body: AccountUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    acc = await _get(db, user, acc_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(acc, k, v)
    await record_timeline(db, user, "account", acc.id, "updated")
    await db.commit()
    await db.refresh(acc)
    return acc


@router.delete("/{acc_id}")
async def delete_account(acc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    acc = await _get(db, user, acc_id)
    await db.delete(acc)
    await db.commit()
    return {"deleted": acc_id}
