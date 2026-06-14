"""Auth endpoints: register (creates org + admin), login, me."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.crm_schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.database import get_db
from app.models import Organization, Pipeline, Stage, User

router = APIRouter(prefix="/auth", tags=["auth"])

# Default deal pipeline created for every new organization
DEFAULT_STAGES = [
    ("Qualification", 10, "open"),
    ("Needs Analysis", 25, "open"),
    ("Proposal", 50, "open"),
    ("Negotiation", 75, "open"),
    ("Closed Won", 100, "won"),
    ("Closed Lost", 0, "lost"),
]


async def seed_default_pipeline(db: AsyncSession, org_id: str) -> Pipeline:
    pipeline = Pipeline(org_id=org_id, name="Standard Sales Pipeline", is_default=True)
    db.add(pipeline)
    await db.flush()
    for i, (name, prob, typ) in enumerate(DEFAULT_STAGES):
        db.add(Stage(pipeline_id=pipeline.id, name=name, sort_order=i, probability=prob, type=typ))
    return pipeline


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Email already registered")

    org = Organization(name=body.org_name)
    db.add(org)
    await db.flush()

    user = User(
        org_id=org.id,
        email=body.email,
        name=body.name,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    db.add(user)
    await seed_default_pipeline(db, org.id)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated")
    return TokenResponse(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
