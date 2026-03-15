"""
routers/auth.py — Real JWT authentication endpoints for RailTrack AI.
  POST /api/auth/login          — email + password → JWT
  GET  /api/auth/me             — Bearer token → User
  POST /api/auth/register       — Admin only: create new user
  POST /api/auth/google-verify  — Google OAuth token → JWT
"""

import os
import uuid
import httpx
from datetime import timedelta, datetime
from typing import Optional, List

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, RoleEnum, AuditLog
from auth_utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    get_current_active_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

load_dotenv(override=True)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: RoleEnum = RoleEnum.CONTROLLER
    section: str = "NR-42"


class SetupRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    section: str
    is_active: bool

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    section: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class GoogleVerifyRequest(BaseModel):
    token: str   # Google OAuth id_token


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_token_response(user: User) -> TokenResponse:
    access_token = create_access_token(
        data={
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "section": user.section,
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role.value,
            section=user.section,
            is_active=user.is_active,
        ),
    )


async def _write_audit(db: AsyncSession, user_id: str, action: str, entity: str = None, detail: str = None):
    log = AuditLog(user_id=user_id, action=action, entity=entity, detail=detail)
    db.add(log)
    await db.flush()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with email + password.
    Returns a signed JWT on success, 401 on failure.
    """
    result = await db.execute(select(User).where(User.email == request.email))
    user: Optional[User] = result.scalar_one_or_none()

    if user is None or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    await _write_audit(db, user.id, "LOGIN", entity=f"user:{user.id}")
    await db.commit()

    return _build_token_response(user)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.value,
        section=current_user.section,
        is_active=current_user.is_active,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: create a new user account with a bcrypt-hashed password.
    """
    # Check for duplicate email
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email '{request.email}' already exists",
        )

    new_user = User(
        id=f"U-{uuid.uuid4().hex[:8].upper()}",
        email=request.email,
        hashed_password=get_password_hash(request.password),
        name=request.name,
        role=request.role,
        section=request.section,
        is_active=True,
    )
    db.add(new_user)

    await _write_audit(db, current_user.id, "CREATE_USER", entity=f"user:{new_user.id}", detail=request.email)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        role=new_user.role.value,
        section=new_user.section,
        is_active=new_user.is_active,
    )


@router.get("/users/", response_model=List[UserListResponse])
async def get_all_users(
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: query all users from the User table."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    
    return [
        UserListResponse(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role.value,
            section=u.section,
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/setup")
async def setup_account(body: SetupRequest, db: AsyncSession = Depends(get_db)):
    """
    Invited user completes account setup: set password & activate.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    
    if not user or user.is_active:
        raise HTTPException(status_code=400, detail="Invalid email or account is already active")
        
    user.hashed_password = get_password_hash(body.password)
    user.is_active = True
    
    await _write_audit(db, user.id, "ACCOUNT_SETUP", entity=f"user:{user.id}")
    await db.commit()
    
    return {"success": True}


@router.post("/google-verify", response_model=TokenResponse)
async def google_verify(request: GoogleVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify a Google OAuth id_token.
    - If the user exists in DB: return JWT.
    - If the user is new: create account with CONTROLLER role, section NR-42.
    """
    # Verify with Google's tokeninfo endpoint
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": request.token},
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    google_data = resp.json()

    # Validate audience matches our app
    expected_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if expected_client_id and expected_client_id != "placeholder":
        if google_data.get("aud") != expected_client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience mismatch",
            )

    google_email: str = google_data.get("email", "")
    google_name: str  = google_data.get("name", google_email.split("@")[0])
    google_sub: str   = google_data.get("sub", "")

    if not google_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not in Google token")

    # Look up by email first, then by google_id
    result = await db.execute(select(User).where(User.email == google_email))
    user: Optional[User] = result.scalar_one_or_none()

    if user is None:
        # New Google user — create with default CONTROLLER role
        user = User(
            id=f"U-{uuid.uuid4().hex[:8].upper()}",
            email=google_email,
            hashed_password=None,
            name=google_name,
            role=RoleEnum.CONTROLLER,
            section="NR-42",
            is_active=True,
            google_id=google_sub,
        )
        db.add(user)
    else:
        # Update google_id if not yet set
        if not user.google_id:
            user.google_id = google_sub
        
        # IMPORTANT: If user was invited (is_active=False), successful Google login 
        # proves identity and activates the account automatically.
        if not user.is_active:
            user.is_active = True

    await _write_audit(db, user.id, "GOOGLE_LOGIN", entity=f"user:{user.id}")
    await db.commit()
    await db.refresh(user)

    return _build_token_response(user)
