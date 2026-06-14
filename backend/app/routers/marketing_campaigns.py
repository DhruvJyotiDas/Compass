"""Marketing campaigns — create, launch, track, and cancel email campaigns."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import paginate
from app.crm_schemas import Page
from app.database import get_db
from app.models import CampaignRecipient, EmailTemplate, Lead, MarketingCampaign, User

router = APIRouter(prefix="/marketing-campaigns", tags=["marketing-campaigns"])


class CampaignIn(BaseModel):
    name: str
    description: Optional[str] = None
    template_id: Optional[str] = None
    filter_criteria: list[dict[str, Any]] = []
    scheduled_at: Optional[datetime] = None


class CampaignOut(BaseModel):
    id: str
    org_id: str
    created_by: Optional[str]
    name: str
    description: Optional[str]
    status: str
    template_id: Optional[str]
    filter_criteria: list
    total_recipients: int
    sent_count: int
    open_count: int
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RecipientOut(BaseModel):
    id: str
    campaign_id: str
    lead_id: Optional[str]
    status: str
    sent_at: Optional[datetime]
    opened_at: Optional[datetime]

    model_config = {"from_attributes": True}


def _campaign_or_404(campaign: Optional[MarketingCampaign]) -> MarketingCampaign:
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def _load(db: AsyncSession, org_id: str, campaign_id: str) -> MarketingCampaign:
    c = await db.scalar(
        select(MarketingCampaign)
        .where(MarketingCampaign.id == campaign_id, MarketingCampaign.org_id == org_id)
        .options(selectinload(MarketingCampaign.recipients))
    )
    return _campaign_or_404(c)


@router.get("", response_model=Page[CampaignOut])
async def list_campaigns(
    page: int = 1,
    size: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(MarketingCampaign)
        .where(MarketingCampaign.org_id == user.org_id)
        .order_by(MarketingCampaign.created_at.desc())
    )
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = MarketingCampaign(
        id=str(uuid4()),
        org_id=user.org_id,
        created_by=user.id,
        **payload.model_dump(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@router.get("/{campaign_id}", response_model=CampaignOut)
async def get_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await db.scalar(
        select(MarketingCampaign).where(
            MarketingCampaign.id == campaign_id, MarketingCampaign.org_id == user.org_id
        )
    )
    return _campaign_or_404(c)


@router.put("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: str,
    payload: CampaignIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await db.scalar(
        select(MarketingCampaign).where(
            MarketingCampaign.id == campaign_id, MarketingCampaign.org_id == user.org_id
        )
    )
    c = _campaign_or_404(c)
    if c.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft campaigns can be edited")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return c


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await db.scalar(
        select(MarketingCampaign).where(
            MarketingCampaign.id == campaign_id, MarketingCampaign.org_id == user.org_id
        )
    )
    c = _campaign_or_404(c)
    await db.delete(c)
    await db.commit()


@router.post("/{campaign_id}/launch", response_model=CampaignOut)
async def launch_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve recipients from filter criteria and start the campaign."""
    c = await _load(db, user.org_id, campaign_id)
    if c.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft campaigns can be launched")

    # Resolve leads matching filter_criteria (simple equality filters)
    lead_stmt = select(Lead).where(Lead.org_id == user.org_id)
    for criterion in (c.filter_criteria or []):
        field = criterion.get("field")
        value = criterion.get("value")
        if field and hasattr(Lead, field):
            lead_stmt = lead_stmt.where(getattr(Lead, field) == value)
    leads = (await db.execute(lead_stmt)).scalars().all()

    for lead in leads:
        c.recipients.append(CampaignRecipient(
            id=str(uuid4()),
            campaign_id=c.id,
            lead_id=lead.id,
            status="pending",
        ))

    now = datetime.now(timezone.utc)
    c.status = "running"
    c.started_at = now
    c.total_recipients = len(leads)

    # Mark all as sent (simulated; real impl would queue emails)
    for r in c.recipients:
        if r.status == "pending":
            r.status = "sent"
            r.sent_at = now
    c.sent_count = c.total_recipients
    c.completed_at = now
    c.status = "completed"

    await db.commit()
    await db.refresh(c)
    return c


@router.post("/{campaign_id}/cancel", response_model=CampaignOut)
async def cancel_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await db.scalar(
        select(MarketingCampaign).where(
            MarketingCampaign.id == campaign_id, MarketingCampaign.org_id == user.org_id
        )
    )
    c = _campaign_or_404(c)
    if c.status not in ("draft", "running"):
        raise HTTPException(status_code=400, detail="Campaign cannot be cancelled")
    c.status = "cancelled"
    await db.commit()
    await db.refresh(c)
    return c


@router.get("/{campaign_id}/recipients", response_model=Page[RecipientOut])
async def list_recipients(
    campaign_id: str,
    page: int = 1,
    size: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify campaign belongs to org
    await _load(db, user.org_id, campaign_id)
    stmt = (
        select(CampaignRecipient)
        .where(CampaignRecipient.campaign_id == campaign_id)
        .order_by(CampaignRecipient.sent_at.desc())
    )
    rows, total = await paginate(db, stmt, page, size)
    return Page(items=rows, total=total, page=page, per_page=size)
