"""Import / export — CSV upload for leads, CSV download for any module."""
from __future__ import annotations

import csv
import io
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Account, Contact, Deal, Lead, User

router = APIRouter(prefix="/import-export", tags=["import-export"])

# Field maps for CSV export
_FIELD_MAPS: dict[str, tuple[list[str], Any]] = {
    "leads": (
        ["id", "first_name", "last_name", "email", "phone", "company", "title",
         "status", "source", "score", "created_at"],
        Lead,
    ),
    "contacts": (
        ["id", "first_name", "last_name", "email", "phone", "title",
         "created_at"],
        Contact,
    ),
    "accounts": (
        ["id", "name", "industry", "website", "phone", "city", "country", "created_at"],
        Account,
    ),
    "deals": (
        ["id", "title", "amount", "probability", "status", "close_date", "created_at"],
        Deal,
    ),
}


@router.get("/export/{module}")
async def export_csv(
    module: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download all records for a module as CSV."""
    if module not in _FIELD_MAPS:
        raise HTTPException(status_code=400, detail=f"Unknown module '{module}'. Supported: {list(_FIELD_MAPS)}")

    fields, model = _FIELD_MAPS[module]
    rows = (await db.execute(
        select(model).where(model.org_id == user.org_id).order_by(model.created_at.desc())
    )).scalars().all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({f: str(getattr(row, f, "") or "") for f in fields})

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{module}.csv"'},
    )


@router.post("/import/leads")
async def import_leads_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CSV file to create leads in bulk. Returns counts."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    created = 0
    skipped = 0
    errors: list[str] = []

    known_fields = {
        "first_name", "last_name", "email", "phone", "company",
        "title", "website", "street", "city", "state", "country",
        "source", "description",
    }

    for i, row in enumerate(reader, start=2):
        try:
            data: dict[str, Any] = {
                "id": str(uuid4()),
                "org_id": user.org_id,
                "status": "new",
            }
            for k in known_fields:
                val = row.get(k) or row.get(k.replace("_", " "))
                if val and val.strip():
                    data[k] = val.strip()

            if not data.get("email") and not data.get("first_name") and not data.get("last_name"):
                skipped += 1
                continue

            # last_name is NOT NULL — fall back to first_name or "Unknown"
            if not data.get("last_name"):
                data["last_name"] = data.get("first_name") or "Unknown"

            db.add(Lead(**data))
            created += 1
        except Exception as exc:
            errors.append(f"Row {i}: {exc}")
            skipped += 1

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=f"Commit failed: {exc}")
    return {"created": created, "skipped": skipped, "errors": errors[:20]}
