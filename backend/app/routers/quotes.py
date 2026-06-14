"""Quotes — CRUD with auto-number and line-item totals."""
import uuid as _uuid_mod
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import Page, QuoteCreate, QuoteOut, QuoteUpdate
from app.database import get_db
from app.models import Quote, User

router = APIRouter(prefix="/quotes", tags=["quotes"])


def _compute_totals(line_items: list, discount_pct: float, tax_pct: float) -> dict:
    subtotal = sum(
        (item.get("qty", 1) * item.get("unit_price", 0)) * (1 - item.get("discount_pct", 0) / 100)
        for item in line_items
    )
    total = subtotal * (1 - discount_pct / 100) * (1 + tax_pct / 100)
    return {"subtotal": round(subtotal, 2), "total": round(total, 2)}


def _normalise_items(items: list) -> list:
    out = []
    for item in items:
        d = item if isinstance(item, dict) else item.model_dump()
        if not d.get("id"):
            d["id"] = str(_uuid_mod.uuid4())
        line_total = d.get("qty", 1) * d.get("unit_price", 0) * (1 - d.get("discount_pct", 0) / 100)
        d["total"] = round(line_total, 2)
        out.append(d)
    return out


@router.get("", response_model=Page[QuoteOut])
async def list_quotes(
    q: str | None = None,
    status: str | None = None,
    account_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Quote), Quote, user)
    if q:
        stmt = stmt.where(or_(Quote.subject.ilike(f"%{q}%"), Quote.quote_number.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Quote.status == status)
    if account_id:
        stmt = stmt.where(Quote.account_id == account_id)
    stmt = apply_sort(stmt, Quote, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=QuoteOut)
async def create_quote(
    body: QuoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    count = await db.scalar(select(func.count(Quote.id)).where(Quote.org_id == user.org_id)) or 0
    quote_number = f"Q-{str(count + 1).zfill(5)}"
    data = body.model_dump()
    items = _normalise_items(data.pop("line_items", []))
    totals = _compute_totals(items, data.get("discount_pct", 0), data.get("tax_pct", 0))
    owner_id = data.pop("owner_id", None) or user.id
    q = Quote(org_id=user.org_id, owner_id=owner_id, quote_number=quote_number,
              line_items=items, **totals, **data)
    db.add(q)
    await db.flush()
    await record_timeline(db, user, "quote", q.id, "created")
    await db.commit()
    await db.refresh(q)
    return q


async def _get(db, user, qid) -> Quote:
    stmt = scope_to_user(select(Quote).where(Quote.id == qid), Quote, user)
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Quote not found")
    return obj


@router.get("/{qid}", response_model=QuoteOut)
async def get_quote(qid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, qid)


@router.patch("/{qid}", response_model=QuoteOut)
async def update_quote(
    qid: str,
    body: QuoteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, qid)
    data = body.model_dump(exclude_unset=True)
    if "line_items" in data:
        data["line_items"] = _normalise_items(data["line_items"])
        totals = _compute_totals(data["line_items"], data.get("discount_pct", obj.discount_pct or 0), data.get("tax_pct", obj.tax_pct or 0))
        data.update(totals)
    for k, v in data.items():
        setattr(obj, k, v)
    await record_timeline(db, user, "quote", obj.id, "updated")
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{qid}")
async def delete_quote(qid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    obj = await _get(db, user, qid)
    await db.delete(obj)
    await db.commit()
    return {"deleted": qid}
