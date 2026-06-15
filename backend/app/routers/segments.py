"""Segment DSL compiler: DSL → parameterized SQL → audience count + sample rows."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    CompileRequest,
    CompileResponse,
    CustomerMatchTrace,
    CustomerPreview,
    DSLFilter,
)

router = APIRouter(prefix="/segments", tags=["segments"])


class GenerateSegmentRequest(BaseModel):
    goal_text: str

# ── Field registry ─────────────────────────────────────────────────────────────

FIELD_REGISTRY = {
    "last_order_at": {
        # NOTE: the bind param must live OUTSIDE any string literal, else asyncpg can't infer its
        # type ("could not determine data type of parameter"). Use interval multiplication.
        "days_ago_gt": "last_order_at < NOW() - (:val * INTERVAL '1 day')",
        "days_ago_lt": "last_order_at > NOW() - (:val * INTERVAL '1 day')",
    },
    "lifetime_spend": {
        "gte": "lifetime_spend >= :val",
        "lte": "lifetime_spend <= :val",
    },
    "order_count": {
        "gte": "order_count >= :val",
        "lte": "order_count <= :val",
    },
    "engagement_score": {
        "gte": "engagement_score >= :val",
        "lte": "engagement_score <= :val",
    },
    "favorite_category": {
        "eq": "favorite_category = :val",
        "neq": "favorite_category <> :val",
    },
    "name": {
        # bind stays a clean param; the % wildcard lives in a literal (asyncpg type inference).
        "starts_with": "name ILIKE :val || '%'",
        "contains": "name ILIKE '%' || :val || '%'",
    },
}

# Human-readable descriptions for match trace
FIELD_LABELS = {
    "last_order_at": "last order",
    "lifetime_spend": "lifetime spend",
    "order_count": "orders placed",
    "engagement_score": "engagement score",
    "favorite_category": "favorite category",
    "name": "name",
}

OP_LABELS = {
    "days_ago_gt": "days ago >",
    "days_ago_lt": "days ago <",
    "gte": "≥",
    "lte": "≤",
    "eq": "is",
    "neq": "is not",
    "starts_with": "starts with",
    "contains": "contains",
}


def _validate_dsl(filters: list[DSLFilter]) -> None:
    for f in filters:
        if f.field not in FIELD_REGISTRY:
            raise HTTPException(400, f"Unknown field: {f.field}")
        if f.op not in FIELD_REGISTRY[f.field]:
            raise HTTPException(400, f"Op '{f.op}' not valid for field '{f.field}'")


def _build_sql(filters: list[DSLFilter], logic: str = "AND") -> tuple[str, dict]:
    """Returns (WHERE clause, params dict). opted_out=false always appended."""
    clauses = []
    params: dict[str, Any] = {}
    for i, f in enumerate(filters):
        param_name = f"v{i}"
        template = FIELD_REGISTRY[f.field][f.op]
        clauses.append(template.replace(":val", f":{param_name}"))

        # Coerce the bind value to the type the column expects.
        if f.op in ("days_ago_gt", "days_ago_lt") or f.field in ("order_count", "engagement_score"):
            params[param_name] = int(f.value)
        elif f.field in ("favorite_category", "name"):
            params[param_name] = str(f.value)
        else:
            params[param_name] = float(f.value)

    # No filters must NOT mean "everyone" — that's the dangerous default for a campaign audience.
    joined = f" {logic} ".join(clauses) if clauses else "FALSE"
    where = f"({joined}) AND opted_out = FALSE"
    return where, params


@router.post("/generate")
async def generate_segment(body: GenerateSegmentRequest, db: AsyncSession = Depends(get_db)):
    """AI: turn a business goal into a segment DSL, then compile it to a live audience preview.

    The AI only proposes filters over allow-listed fields; compilation reuses the safe SQL path.
    """
    from app.ai.segment_agent import generate_segment as ai_generate_segment

    dsl, meta, valid = await ai_generate_segment(body.goal_text)
    raw_filters = dsl.get("filters", [])

    # Fail safe: if the description couldn't be expressed over a supported attribute the model
    # returns no filters. Do NOT compile that — empty filters match the ENTIRE customer base,
    # which would silently target everyone. Tell the user what segments CAN target instead.
    if not raw_filters:
        return {
            "dsl": {"filters": [], "logic": dsl.get("logic", "AND")},
            "audience_description": dsl.get("audience_description", ""),
            "provider": meta.get("provider", "unknown"),
            "valid": False,
            "unsupported": True,
            "message": (
                "Couldn't translate that into a supported audience filter. Segments can target: "
                "last order recency, lifetime spend (₹), order count, engagement score (0–100), or "
                "favorite category. Try e.g. \"high-spend customers who lapsed 60+ days\"."
            ),
            "count": 0,
            "sql_preview": "",
            "sample": [],
        }

    filters = [DSLFilter(**f) for f in raw_filters]
    _validate_dsl(filters)
    preview = await compile_segment(
        CompileRequest(dsl={"filters": raw_filters, "logic": dsl.get("logic", "AND")}),
        db,
    )
    return {
        "dsl": dsl,
        "audience_description": dsl.get("audience_description", ""),
        "provider": meta.get("provider", "unknown"),
        "valid": valid,
        "unsupported": False,
        "count": preview.count,
        "sql_preview": preview.sql_preview,
        "sample": preview.sample,
    }


@router.post("/compile", response_model=CompileResponse)
async def compile_segment(body: CompileRequest, db: AsyncSession = Depends(get_db)):
    _validate_dsl(body.dsl.filters)
    where, params = _build_sql(body.dsl.filters, body.dsl.logic)

    count_sql = text(f"SELECT COUNT(*) FROM customers WHERE {where}")
    count_result = await db.execute(count_sql, params)
    count = count_result.scalar()

    lim = max(1, min(body.limit, 200))
    sample_sql = text(
        f"SELECT id, name, email, last_order_at, lifetime_spend, order_count, "
        f"engagement_score, favorite_category "
        f"FROM customers WHERE {where} ORDER BY lifetime_spend DESC LIMIT {lim}"
    )
    sample_result = await db.execute(sample_sql, params)
    rows = sample_result.fetchall()

    sample = []
    for row in rows:
        trace = _build_match_trace(body.dsl.filters, row)
        sample.append(CustomerPreview(
            id=str(row.id),
            name=row.name,
            email=row.email,
            last_order_at=row.last_order_at,
            lifetime_spend=float(row.lifetime_spend),
            order_count=row.order_count,
            match_trace=trace,
        ))

    sql_preview = f"SELECT * FROM customers WHERE {where} -- {count} rows"

    return CompileResponse(count=count, sql_preview=sql_preview, sample=sample)


def _build_match_trace(filters: list[DSLFilter], row: Any) -> list[CustomerMatchTrace]:
    trace = []
    for f in filters:
        actual: Any = None
        matched = False

        if f.field == "last_order_at":
            if row.last_order_at:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                days_ago = (now - row.last_order_at.replace(tzinfo=timezone.utc)).days
                actual = f"{days_ago} days ago"
                if f.op == "days_ago_gt":
                    matched = days_ago > int(f.value)
                elif f.op == "days_ago_lt":
                    matched = days_ago < int(f.value)
            else:
                actual = "no orders"
                matched = f.op == "days_ago_gt"

        elif f.field == "lifetime_spend":
            actual = f"₹{row.lifetime_spend:,.0f}"
            val = float(f.value)
            if f.op == "gte":
                matched = float(row.lifetime_spend) >= val
            elif f.op == "lte":
                matched = float(row.lifetime_spend) <= val

        elif f.field == "order_count":
            actual = str(row.order_count)
            val = int(f.value)
            if f.op == "gte":
                matched = row.order_count >= val
            elif f.op == "lte":
                matched = row.order_count <= val

        elif f.field == "engagement_score":
            actual = str(row.engagement_score)
            val = int(f.value)
            if f.op == "gte":
                matched = row.engagement_score >= val
            elif f.op == "lte":
                matched = row.engagement_score <= val

        elif f.field == "favorite_category":
            actual = row.favorite_category or "—"
            if f.op == "eq":
                matched = row.favorite_category == f.value
            elif f.op == "neq":
                matched = row.favorite_category != f.value

        elif f.field == "name":
            actual = row.name
            val = str(f.value).lower()
            if f.op == "starts_with":
                matched = row.name.lower().startswith(val)
            elif f.op == "contains":
                matched = val in row.name.lower()

        trace.append(CustomerMatchTrace(
            field=f.field,
            op=OP_LABELS.get(f.op, f.op),
            value=f.value,
            actual=actual,
            matched=matched,
        ))

    # Always show opted_out guard
    trace.append(CustomerMatchTrace(
        field="opted_out",
        op="=",
        value=False,
        actual=False,
        matched=True,
    ))
    return trace
