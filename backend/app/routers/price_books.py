"""Price Books — CRUD + item management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user, has_perm
from app.crm_schemas import Page, PriceBookCreate, PriceBookOut, PriceBookUpdate
from app.database import get_db
from app.models import PriceBook, PriceBookItem, User

router = APIRouter(prefix="/price-books", tags=["price-books"])


def _scope(stmt, user):
    return stmt.where(PriceBook.org_id == user.org_id)


def _with_items(stmt):
    return stmt.options(selectinload(PriceBook.items))


@router.get("", response_model=list[PriceBookOut])
async def list_price_books(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(_with_items(_scope(select(PriceBook), user)))).scalars().all()
    return rows


@router.post("", response_model=PriceBookOut)
async def create_price_book(
    body: PriceBookCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    items_data = data.pop("items", [])
    pb = PriceBook(org_id=user.org_id, **data)
    db.add(pb)
    await db.flush()
    for item in items_data:
        db.add(PriceBookItem(price_book_id=pb.id, **item))
    await db.commit()
    result = (await db.execute(_with_items(select(PriceBook).where(PriceBook.id == pb.id)))).scalar_one()
    return result


async def _get(db, user, pbid) -> PriceBook:
    pb = (await db.execute(_with_items(_scope(select(PriceBook).where(PriceBook.id == pbid), user)))).scalar_one_or_none()
    if not pb:
        raise HTTPException(404, "Price book not found")
    return pb


@router.get("/{pbid}", response_model=PriceBookOut)
async def get_price_book(pbid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, pbid)


@router.patch("/{pbid}", response_model=PriceBookOut)
async def update_price_book(
    pbid: str,
    body: PriceBookUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    pb = await _get(db, user, pbid)
    data = body.model_dump(exclude_unset=True)
    items_data = data.pop("items", None)
    for k, v in data.items():
        setattr(pb, k, v)
    if items_data is not None:
        # Replace all items
        for item in list(pb.items):
            await db.delete(item)
        await db.flush()
        for item in items_data:
            db.add(PriceBookItem(price_book_id=pb.id, **item))
    await db.commit()
    return await _get(db, user, pbid)


@router.delete("/{pbid}")
async def delete_price_book(pbid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    pb = await _get(db, user, pbid)
    await db.delete(pb)
    await db.commit()
    return {"deleted": pbid}
