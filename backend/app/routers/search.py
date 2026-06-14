"""Global search across leads, contacts, accounts, deals."""
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.crm_common import scope_to_user
from app.crm_schemas import SearchHit, SearchResponse
from app.database import get_db
from app.models import Account, Contact, Deal, Lead, User

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search(q: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = (q or "").strip()
    hits: list[SearchHit] = []
    if not q:
        return SearchResponse(hits=hits)
    like = f"%{q}%"

    leads = (await db.execute(
        scope_to_user(select(Lead), Lead, user).where(
            or_(Lead.first_name.ilike(like), Lead.last_name.ilike(like), Lead.company.ilike(like), Lead.email.ilike(like))
        ).limit(5)
    )).scalars().all()
    for l in leads:
        hits.append(SearchHit(module="lead", id=l.id,
                              title=f"{l.first_name or ''} {l.last_name}".strip(), subtitle=l.company))

    contacts = (await db.execute(
        scope_to_user(select(Contact), Contact, user).where(
            or_(Contact.first_name.ilike(like), Contact.last_name.ilike(like), Contact.email.ilike(like))
        ).limit(5)
    )).scalars().all()
    for c in contacts:
        hits.append(SearchHit(module="contact", id=c.id,
                              title=f"{c.first_name or ''} {c.last_name}".strip(), subtitle=c.email))

    accounts = (await db.execute(
        scope_to_user(select(Account), Account, user).where(Account.name.ilike(like)).limit(5)
    )).scalars().all()
    for a in accounts:
        hits.append(SearchHit(module="account", id=a.id, title=a.name, subtitle=a.industry))

    deals = (await db.execute(
        scope_to_user(select(Deal), Deal, user).where(Deal.name.ilike(like)).limit(5)
    )).scalars().all()
    for d in deals:
        hits.append(SearchHit(module="deal", id=d.id, title=d.name,
                              subtitle=f"{d.currency} {float(d.amount or 0):,.0f}"))

    return SearchResponse(hits=hits)
