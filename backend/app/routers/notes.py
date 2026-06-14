"""Notes, tags, and per-record timeline feed."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, has_perm
from app.crm_schemas import (
    NoteCreate,
    NoteOut,
    TagAssign,
    TagCreate,
    TagOut,
    TimelineOut,
)
from app.database import get_db
from app.models import Note, RecordTag, Tag, TimelineEvent, User

router = APIRouter(tags=["notes"])


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.get("/notes", response_model=list[NoteOut])
async def list_notes(related_module: str, related_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Note).where(Note.org_id == user.org_id, Note.related_module == related_module,
                           Note.related_id == related_id).order_by(Note.created_at.desc())
    )).scalars().all()
    return rows


@router.post("/notes", response_model=NoteOut)
async def create_note(body: NoteCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    n = Note(org_id=user.org_id, author_id=user.id, **body.model_dump())
    db.add(n)
    db.add(TimelineEvent(org_id=user.org_id, actor_id=user.id, module=body.related_module,
                         record_id=body.related_id, verb="noted", meta={"preview": body.body[:80]}))
    await db.commit()
    await db.refresh(n)
    return n


@router.delete("/notes/{nid}")
async def delete_note(nid: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    n = (await db.execute(select(Note).where(Note.id == nid, Note.org_id == user.org_id))).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Note not found")
    await db.delete(n)
    await db.commit()
    return {"deleted": nid}


# ── Timeline ──────────────────────────────────────────────────────────────────

@router.get("/timeline", response_model=list[TimelineOut])
async def get_timeline(module: str, record_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(TimelineEvent).where(TimelineEvent.org_id == user.org_id, TimelineEvent.module == module,
                                    TimelineEvent.record_id == record_id).order_by(TimelineEvent.created_at.desc())
    )).scalars().all()
    return rows


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagOut])
async def list_tags(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Tag).where(Tag.org_id == user.org_id).order_by(Tag.name))).scalars().all()
    return rows


@router.post("/tags", response_model=TagOut)
async def create_tag(body: TagCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Tag).where(Tag.org_id == user.org_id, Tag.name == body.name))).scalar_one_or_none()
    if existing:
        return existing
    t = Tag(org_id=user.org_id, name=body.name, color=body.color)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.post("/tags/assign")
async def assign_tag(body: TagAssign, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not has_perm(user, "edit"):
        raise HTTPException(403, "Permission denied")
    exists = (await db.execute(
        select(RecordTag).where(RecordTag.tag_id == body.tag_id, RecordTag.module == body.module,
                                RecordTag.record_id == body.record_id)
    )).scalar_one_or_none()
    if not exists:
        db.add(RecordTag(tag_id=body.tag_id, module=body.module, record_id=body.record_id))
        await db.commit()
    return {"ok": True}


@router.get("/records/{module}/{record_id}/tags", response_model=list[TagOut])
async def record_tags(module: str, record_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Tag).join(RecordTag, RecordTag.tag_id == Tag.id)
        .where(Tag.org_id == user.org_id, RecordTag.module == module, RecordTag.record_id == record_id)
    )).scalars().all()
    return rows


@router.delete("/records/{module}/{record_id}/tags/{tag_id}")
async def unassign_tag(module: str, record_id: str, tag_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rt = (await db.execute(
        select(RecordTag).where(RecordTag.tag_id == tag_id, RecordTag.module == module, RecordTag.record_id == record_id)
    )).scalar_one_or_none()
    if rt:
        await db.delete(rt)
        await db.commit()
    return {"ok": True}
