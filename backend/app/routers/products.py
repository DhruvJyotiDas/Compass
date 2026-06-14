"""Products — catalog CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate
from app.crm_schemas import Page, ProductCreate, ProductOut, ProductUpdate
from app.database import get_db
from app.models import Product, User

router = APIRouter(prefix="/products", tags=["products"])


def _scope(stmt, user):
    return stmt.where(Product.org_id == user.org_id)


@router.get("", response_model=Page[ProductOut])
async def list_products(
    q: str | None = None,
    category: str | None = None,
    is_active: bool | None = None,
    sort: str = "name",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = _scope(select(Product), user)
    if q:
        stmt = stmt.where(or_(Product.name.ilike(f"%{q}%"), Product.code.ilike(f"%{q}%")))
    if category:
        stmt = stmt.where(Product.category == category)
    if is_active is not None:
        stmt = stmt.where(Product.is_active == is_active)
    stmt = apply_sort(stmt, Product, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=ProductOut)
async def create_product(
    body: ProductCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    p = Product(org_id=user.org_id, **body.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _get(db, user, pid) -> Product:
    p = (await db.execute(_scope(select(Product).where(Product.id == pid), user))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")
    return p


@router.get("/{pid}", response_model=ProductOut)
async def get_product(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get(db, user, pid)


@router.patch("/{pid}", response_model=ProductOut)
async def update_product(
    pid: str,
    body: ProductUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    p = await _get(db, user, pid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{pid}")
async def delete_product(pid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    p = await _get(db, user, pid)
    await db.delete(p)
    await db.commit()
    return {"deleted": pid}
