"""Web forms — embeddable lead-capture forms with public submission endpoint."""
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
from app.models import Lead, User, WebForm

router = APIRouter(prefix="/web-forms", tags=["web-forms"])


class WebFormIn(BaseModel):
    title: str
    description: Optional[str] = None
    module: str = "lead"
    fields: list[dict[str, Any]] = []
    redirect_url: Optional[str] = None
    is_active: bool = True


class WebFormOut(BaseModel):
    id: str
    org_id: str
    created_by: Optional[str]
    title: str
    description: Optional[str]
    module: str
    fields: list
    redirect_url: Optional[str]
    is_active: bool
    submission_count: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("", response_model=Page[WebFormOut])
async def list_forms(
    page: int = 1,
    size: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(WebForm)
        .where(WebForm.org_id == user.org_id)
        .order_by(WebForm.created_at.desc())
    )
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)


@router.post(
    "",
    response_model=WebFormOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def create_form(
    payload: WebFormIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = WebForm(
        id=str(uuid4()),
        org_id=user.org_id,
        created_by=user.id,
        **payload.model_dump(),
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf


@router.get("/{form_id}", response_model=WebFormOut)
async def get_form(
    form_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = await db.scalar(
        select(WebForm).where(WebForm.id == form_id, WebForm.org_id == user.org_id)
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Form not found")
    return wf


@router.put(
    "/{form_id}",
    response_model=WebFormOut,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def update_form(
    form_id: str,
    payload: WebFormIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = await db.scalar(
        select(WebForm).where(WebForm.id == form_id, WebForm.org_id == user.org_id)
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Form not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(wf, k, v)
    await db.commit()
    await db.refresh(wf)
    return wf


@router.delete(
    "/{form_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_perm("manage_settings"))],
)
async def delete_form(
    form_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wf = await db.scalar(
        select(WebForm).where(WebForm.id == form_id, WebForm.org_id == user.org_id)
    )
    if not wf:
        raise HTTPException(status_code=404, detail="Form not found")
    await db.delete(wf)
    await db.commit()


# ── Public submission endpoint (no auth — used from embedded iframe/snippet) ───

class SubmitPayload(BaseModel):
    data: dict[str, Any]


@router.post("/{form_id}/submit", status_code=status.HTTP_201_CREATED)
async def submit_form(
    form_id: str,
    payload: SubmitPayload,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — creates a lead from form submission data."""
    wf = await db.scalar(select(WebForm).where(WebForm.id == form_id, WebForm.is_active.is_(True)))
    if not wf:
        raise HTTPException(status_code=404, detail="Form not found or inactive")

    # Build lead from submitted data, mapping by field_key
    lead_data: dict[str, Any] = {
        "id": str(uuid4()),
        "org_id": wf.org_id,
        "status": "new",
        "source": "web_form",
    }
    known_lead_fields = {
        "first_name", "last_name", "email", "phone", "company",
        "title", "website", "street", "city", "state", "country",
        "description", "source",
    }
    # Map any key from submitted data that is a known lead field
    for key, val in payload.data.items():
        if key in known_lead_fields and val is not None and str(val).strip():
            lead_data[key] = str(val).strip()

    # last_name is NOT NULL — default to empty string if not submitted
    if "last_name" not in lead_data:
        lead_data["last_name"] = lead_data.get("first_name", "Unknown")

    lead = Lead(**lead_data)
    db.add(lead)
    wf.submission_count = (wf.submission_count or 0) + 1
    await db.commit()
    return {"status": "ok", "lead_id": lead.id, "redirect_url": wf.redirect_url}
