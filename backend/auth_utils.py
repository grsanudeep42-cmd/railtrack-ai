"""
auth_utils.py — JWT creation/verification, password hashing, and FastAPI dependencies 
for RailTrack AI authentication.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db

load_dotenv(override=True)

SECRET_KEY = os.getenv("SECRET_KEY", "railtrack-super-secret-key-change-in-prod")
ALGORITHM  = os.getenv("ALGORITHM",  "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# ─── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Return a bcrypt-hashed version of the plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    """Verify a plaintext password against its stored bcrypt hash.
    Returns False (never raises) if hash is None (Google-only user) or 'INVITED'.
    """
    if not hashed_password or hashed_password == "INVITED":
        return False
    return pwd_context.verify(plain_password, hashed_password)


# ─── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT containing `data` payload.
    Adds `exp` claim automatically.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """
    Decode and verify a JWT. Returns the payload dict.
    Raises HTTPException 401 if invalid or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


# ─── FastAPI dependency — HTTP Bearer ──────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    FastAPI dependency: validates the Bearer JWT and returns the current User ORM object.
    Usage:
        current_user: User = Depends(get_current_user)
    """
    from models import User  # local import to avoid circular dependency at module load

    payload = verify_token(credentials.credentials)
    user_id: str = payload.get("sub")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )
    return user


async def get_current_active_admin(current_user=Depends(get_current_user)):
    """Dependency that additionally requires the user to have ADMIN role."""
    from models import RoleEnum
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user
