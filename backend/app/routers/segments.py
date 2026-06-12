"""Segment DSL compiler: DSL → parameterized SQL → audience count + sample rows."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
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

# ── Field registry ─────────────────────────────────────────────────────────────

FIELD_REGISTRY = {
    "last_order_at": {
        "days_ago_gt": "NOW() - last_order_at > INTERVAL ':val days'",
        "days_ago_lt": "NOW() - last_order_at < INTERVAL ':val days'",
    },
    "lifetime_spend": {
        "gte": "lifetime_spend >= :val",
        "lte": "lifetime_spend <= :val",
    },
    "order_count": {
        "gte": "order_count >= :val",
        "lte": "order_count <= :val",
    },
}

# Human-readable descriptions for match trace
FIELD_LABELS = {
    "last_order_at": "last order",
    "lifetime_spend": "lifetime spend",
    "order_count": "orders placed",
}

OP_LABELS = {
    "days_ago_gt": "days ago >",
    "days_ago_lt": "days ago <",
    "gte": "≥",
    "lte": "≤",
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

        # For interval ops the value is days (int)
        if f.op in ("days_ago_gt", "days_ago_lt"):
            params[param_name] = int(f.value)
        else:
            params[param_name] = float(f.value)

    joined = f" {logic} ".join(clauses) if clauses else "TRUE"
    where = f"({joined}) AND opted_out = FALSE"
    return where, params


@router.post("/compile", response_model=CompileResponse)
async def compile_segment(body: CompileRequest, db: AsyncSession = Depends(get_db)):
    _validate_dsl(body.dsl.filters)
    where, params = _build_sql(body.dsl.filters, body.dsl.logic)

    count_sql = text(f"SELECT COUNT(*) FROM customers WHERE {where}")
    count_result = await db.execute(count_sql, params)
    count = count_result.scalar()

    sample_sql = text(
        f"SELECT id, name, email, last_order_at, lifetime_spend, order_count "
        f"FROM customers WHERE {where} ORDER BY lifetime_spend DESC LIMIT 5"
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
