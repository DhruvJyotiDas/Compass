"""Custom fields — org-level schema extensions for any CRM module."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_perm
from app.crm_common import paginate
from app.crm_schemas import Page
from app.database import get_db
from app.models import CustomField, User

router = APIRouter(prefix="/custom-fields", tags=["custom-fields"])


class CustomFieldIn(BaseModel):
    module: str  # lead|contact|account|deal|case
    field_key: str
    label: str
    field_type: str = "text"  # text|number|date|select|checkbox|url|email|textarea
    options: list[str] = []
    is_required: bool = False
    is_active: bool = True
    sort_order: int = 0


class CustomFieldOut(BaseModel):
    id: str
    org_id: str
    module: str
    field_key: str
    label: str
    field_type: str
    options: list
    is_required: bool
    is_active: bool
    sort_order: int
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("", response_model=Page[CustomFieldOut])
async def list_custom_fields(
    module: Optional[str] = None,
    page: int = 1,
    size: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CustomField).where(CustomField.org_id == user.org_id)
    if module:
        stmt = stmt.where(CustomField.module == module)
    stmt = stmt.order_by(CustomField.module, CustomField.sort_order)
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)


@router.post(
    "",
    response_model=CustomFieldOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def create_custom_field(
    payload: CustomFieldIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cf = CustomField(
        id=str(uuid4()),
        org_id=user.org_id,
        **payload.model_dump(),
    )
    db.add(cf)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A field with this key already exists for that module")
    await db.refresh(cf)
    return cf


@router.get("/{field_id}", response_model=CustomFieldOut)
async def get_custom_field(
    field_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cf = await db.scalar(
        select(CustomField).where(CustomField.id == field_id, CustomField.org_id == user.org_id)
    )
    if not cf:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return cf


@router.put(
    "/{field_id}",
    response_model=CustomFieldOut,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def update_custom_field(
    field_id: str,
    payload: CustomFieldIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cf = await db.scalar(
        select(CustomField).where(CustomField.id == field_id, CustomField.org_id == user.org_id)
    )
    if not cf:
        raise HTTPException(status_code=404, detail="Custom field not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cf, k, v)
    await db.commit()
    await db.refresh(cf)
    return cf


@router.delete(
    "/{field_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def delete_custom_field(
    field_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cf = await db.scalar(
        select(CustomField).where(CustomField.id == field_id, CustomField.org_id == user.org_id)
    )
    if not cf:
        raise HTTPException(status_code=404, detail="Custom field not found")
    await db.delete(cf)
    await db.commit()
