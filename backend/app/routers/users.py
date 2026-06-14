"""User management — list all org users; admin-only create/update/deactivate."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, hash_password, require_perm
from app.crm_schemas import UserCreate, UserOut, UserUpdate
from app.database import get_db
from app.models import ROLES, User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(User).where(User.org_id == user.org_id).order_by(User.created_at))
    ).scalars().all()
    return rows


@router.post("", response_model=UserOut)
async def create_user(
    body: UserCreate,
    admin: User = Depends(require_perm("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    if body.role not in ROLES:
        raise HTTPException(400, f"role must be one of {ROLES}")
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise HTTPException(400, "Email already in use")
    u = User(
        org_id=admin.org_id,
        email=body.email,
        name=body.name,
        hashed_password=hash_password(body.password),
        role=body.role,
        title=body.title,
        phone=body.phone,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    admin: User = Depends(require_perm("manage_users")),
    db: AsyncSession = Depends(get_db),
):
    u = (
        await db.execute(select(User).where(User.id == user_id, User.org_id == admin.org_id))
    ).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        u.hashed_password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    if data.get("role") and data["role"] not in ROLES:
        raise HTTPException(400, f"role must be one of {ROLES}")
    for k, v in data.items():
        setattr(u, k, v)
    await db.commit()
    await db.refresh(u)
    return u
