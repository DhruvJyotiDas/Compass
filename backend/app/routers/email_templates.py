"""Email templates for marketing campaigns."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import paginate
from app.crm_schemas import Page
from app.database import get_db
from app.models import EmailTemplate, User

router = APIRouter(prefix="/email-templates", tags=["email-templates"])


class TemplateIn(BaseModel):
    name: str
    subject: str
    body: str
    is_active: bool = True


class TemplateOut(BaseModel):
    id: str
    org_id: str
    created_by: Optional[str]
    name: str
    subject: str
    body: str
    is_active: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("", response_model=Page[TemplateOut])
async def list_templates(
    page: int = 1,
    size: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(EmailTemplate)
        .where(EmailTemplate.org_id == user.org_id)
        .order_by(EmailTemplate.created_at.desc())
    )
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = EmailTemplate(
        id=str(uuid4()),
        org_id=user.org_id,
        created_by=user.id,
        **payload.model_dump(),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id, EmailTemplate.org_id == user.org_id
        )
    )
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.put("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: str,
    payload: TemplateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id, EmailTemplate.org_id == user.org_id
        )
    )
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.scalar(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id, EmailTemplate.org_id == user.org_id
        )
    )
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
