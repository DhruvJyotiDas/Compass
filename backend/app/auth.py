"""Authentication, JWT handling, and role-based permissions for the CRM."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ─────────────────────────────────────────────────────────────────────

def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user.id, "org": user.org_id, "role": user.role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


# ── Current user dependency ───────────────────────────────────────────────────

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_exc
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise cred_exc
    except JWTError:
        raise cred_exc

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise cred_exc
    return user


# ── Role / permission model ───────────────────────────────────────────────────
# Pragmatic Phase-1 matrix: action set per role. Reps are scoped to records they
# own on list/read; managers and admins see the whole org.

ALL_ACTIONS = {"view", "create", "edit", "delete"}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"view", "create", "edit", "delete", "manage_users", "manage_settings"},
    "manager": {"view", "create", "edit", "delete", "manage_settings"},
    "sales_rep": {"view", "create", "edit"},
}


def has_perm(user: User, action: str) -> bool:
    return action in ROLE_PERMISSIONS.get(user.role, set())


def require_perm(action: str):
    """Dependency factory: ensure the current user holds `action`."""

    async def _checker(user: User = Depends(get_current_user)) -> User:
        if not has_perm(user, action):
            raise HTTPException(status_code=403, detail=f"Permission denied: {action}")
        return user

    return _checker


def sees_all_records(user: User) -> bool:
    """Managers/admins see every record in the org; reps see only their own."""
    return user.role in ("admin", "manager")
