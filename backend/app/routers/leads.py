"""Leads module — CRUD, list/search, and convert-to-deal."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_common import apply_sort, paginate, record_timeline, scope_to_user
from app.crm_schemas import (
    LeadConvertRequest,
    LeadCreate,
    LeadOut,
    LeadUpdate,
    Page,
)
from app.database import get_db
from app.models import Account, Contact, Deal, Lead, Pipeline, Stage, User
from app.workflow_engine import apply_assignment_rule, apply_scoring_rules, run_workflow_rules

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=Page[LeadOut])
async def list_leads(
    q: str | None = None,
    status: str | None = None,
    source: str | None = None,
    owner_id: str | None = None,
    sort: str = "-created_at",
    page: int = 1,
    per_page: int = 25,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = scope_to_user(select(Lead), Lead, user)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Lead.first_name.ilike(like), Lead.last_name.ilike(like),
                Lead.company.ilike(like), Lead.email.ilike(like))
        )
    if status:
        stmt = stmt.where(Lead.status == status)
    if source:
        stmt = stmt.where(Lead.source == source)
    if owner_id:
        stmt = stmt.where(Lead.owner_id == owner_id)
    stmt = apply_sort(stmt, Lead, sort)
    rows, total = await paginate(db, stmt, page, per_page)
    return Page(items=rows, total=total, page=page, per_page=per_page)


@router.post("", response_model=LeadOut)
async def create_lead(
    body: LeadCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    data = body.model_dump()
    data.setdefault("owner_id", None)
    lead = Lead(org_id=user.org_id, owner_id=data.pop("owner_id") or user.id, **data)
    db.add(lead)
    await db.flush()
    await apply_assignment_rule(db, user.org_id, "lead", lead)
    await apply_scoring_rules(db, user.org_id, "lead", lead)
    await run_workflow_rules(db, user.org_id, "lead", "on_create", lead)
    await record_timeline(db, user, "lead", lead.id, "created")
    await db.commit()
    await db.refresh(lead)
    return lead


async def _get_lead(db, user, lead_id) -> Lead:
    stmt = scope_to_user(select(Lead).where(Lead.id == lead_id), Lead, user)
    lead = (await db.execute(stmt)).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead


@router.get("/{lead_id}", response_model=LeadOut)
async def get_lead(lead_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _get_lead(db, user, lead_id)


@router.patch("/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: str, body: LeadUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    lead = await _get_lead(db, user, lead_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    await apply_scoring_rules(db, user.org_id, "lead", lead)
    await run_workflow_rules(db, user.org_id, "lead", "on_update", lead)
    await record_timeline(db, user, "lead", lead.id, "updated")
    await db.commit()
    await db.refresh(lead)
    return lead


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "delete"):
        raise HTTPException(403, "Permission denied")
    lead = await _get_lead(db, user, lead_id)
    await db.delete(lead)
    await db.commit()
    return {"deleted": lead_id}


@router.post("/{lead_id}/convert", response_model=dict)
async def convert_lead(
    lead_id: str,
    body: LeadConvertRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not has_perm(user, "create"):
        raise HTTPException(403, "Permission denied")
    lead = await _get_lead(db, user, lead_id)
    if lead.converted:
        raise HTTPException(400, "Lead already converted")

    account = Account(
        org_id=user.org_id, owner_id=lead.owner_id or user.id,
        name=lead.company or f"{lead.first_name or ''} {lead.last_name}".strip(),
        industry=lead.industry, website=lead.website, phone=lead.phone,
        annual_revenue=lead.annual_revenue, no_of_employees=lead.no_of_employees,
        billing_street=lead.street, billing_city=lead.city, billing_state=lead.state,
        billing_country=lead.country, billing_zip=lead.zip_code, type="customer",
    )
    db.add(account)
    await db.flush()

    contact = Contact(
        org_id=user.org_id, owner_id=lead.owner_id or user.id, account_id=account.id,
        first_name=lead.first_name, last_name=lead.last_name, title=lead.title,
        email=lead.email, phone=lead.phone, mobile=lead.mobile, source=lead.source,
    )
    db.add(contact)
    await db.flush()

    deal_id = None
    if body.create_deal:
        pipeline = (
            await db.execute(
                select(Pipeline).where(Pipeline.org_id == user.org_id, Pipeline.is_default == True)  # noqa: E712
            )
        ).scalars().first()
        if not pipeline:
            pipeline = (await db.execute(select(Pipeline).where(Pipeline.org_id == user.org_id))).scalars().first()
        first_stage = None
        if pipeline:
            first_stage = (
                await db.execute(
                    select(Stage).where(Stage.pipeline_id == pipeline.id).order_by(Stage.sort_order)
                )
            ).scalars().first()
        if pipeline and first_stage:
            deal = Deal(
                org_id=user.org_id, owner_id=lead.owner_id or user.id,
                name=body.deal_name or f"{account.name} — Opportunity",
                account_id=account.id, contact_id=contact.id,
                pipeline_id=pipeline.id, stage_id=first_stage.id,
                amount=body.deal_amount or 0, probability=first_stage.probability,
                source=lead.source, type="new_business",
            )
            db.add(deal)
            await db.flush()
            deal_id = deal.id

    lead.converted = True
    lead.status = "converted"
    lead.converted_at = datetime.now(timezone.utc)
    lead.converted_account_id = account.id
    lead.converted_contact_id = contact.id
    lead.converted_deal_id = deal_id
    await record_timeline(db, user, "lead", lead.id, "converted",
                          {"account_id": account.id, "contact_id": contact.id, "deal_id": deal_id})
    await db.commit()
    return {"account_id": account.id, "contact_id": contact.id, "deal_id": deal_id}
