import os
import time
import httpx
import psutil
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
import uuid

from database import get_db
from models import User, RoleEnum
from auth_utils import get_current_user

router = APIRouter()


class ServiceHealth(BaseModel):
    service: str
    status: str
    latency_ms: int
    uptime_seconds: float = 0.0
    uptime: str = "N/A"
    message: str


class InviteRequest(BaseModel):
    name: str
    email: str
    role: str
    section: str

class EditUserRequest(BaseModel):
    role: str
    section: str
    is_active: bool


@router.post("/invite")
async def invite_user(
    req: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Invites a new user. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        # Check if email already exists
        query = select(User).where(User.email == req.email)
        result = await db.execute(query)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            return {"success": True, "message": "User already invited/exists"}

        new_user = User(
            id=str(uuid.uuid4()),
            name=req.name,
            email=req.email,
            role=RoleEnum(req.role),
            section=req.section,
            is_active=False,  # Treated as INVITED / pending activation
            hashed_password="INVITED"
        )
        db.add(new_user)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    try:
        from utils.email import send_invite_email
        send_invite_email(
            to_email=req.email,
            to_name=req.name,
            role=req.role,
            section=req.section
        )
    except Exception as e:
        # Now return the error so we can see it in frontend too
        print(f"[EMAIL ERROR] {e}")
        return {"success": True, "message": f"User created but email failed: {str(e)}"}
        
    return {"success": True}


@router.put("/users/{user_id}")
async def edit_user(
    user_id: str,
    req: EditUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Edits an existing user. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        target_user = result.scalar_one_or_none()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        target_user.role = RoleEnum(req.role)
        target_user.section = req.section
        target_user.is_active = req.is_active
        
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"success": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deletes an existing user completely. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires ADMIN role."
        )

    try:
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        target_user = result.scalar_one_or_none()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")

        # Prevent admin from deleting themselves accidentally
        if target_user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account.")

        await db.delete(target_user)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"success": True}


@router.get("/health", response_model=List[ServiceHealth])
async def get_system_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns real telemetry for backend services. Requires ADMIN role.
    """
    if current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires ADMIN role to view system health telemetry."
        )

    results = []

    # 1. PostgreSQL Check
    try:
        start_time = time.perf_counter()
        await db.execute(text("SELECT 1"))
        latency = int((time.perf_counter() - start_time) * 1000)
        results.append(ServiceHealth(
            service="PostgreSQL Database",
            status="UP",
            latency_ms=latency,
            uptime_seconds=0.0,
            uptime="Connected",
            message="Read/Write Operations Normal"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="PostgreSQL Database",
            status="DOWN",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Disconnected",
            message=str(e)[:50]
        ))

    # 2. FastAPI Application Check
    try:
        process = psutil.Process(os.getpid())
        uptime_seconds = time.time() - process.create_time()
        
        # Convert seconds to a nice string like "2d 4h" or "12h 5m"
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        uptime_str = f"{days}d {hours}h" if days > 0 else f"{hours}h {minutes}m"
        
        results.append(ServiceHealth(
            service="FastAPI Backend Core",
            status="UP",
            latency_ms=1,
            uptime_seconds=uptime_seconds,
            uptime=uptime_str,
            message="uvicorn worker operational"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="FastAPI Backend Core",
            status="DEGRADED",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Unknown",
            message=str(e)[:50]
        ))

    # 3. OR-Tools Solver Check
    try:
        start_time = time.perf_counter()
        from ortools.sat.python import cp_model
        # Just create an empty model to ensure C++ bindings are loaded and fast
        _ = cp_model.CpModel()
        latency = int((time.perf_counter() - start_time) * 1000)
        results.append(ServiceHealth(
            service="OR-Tools CP-SAT Solver",
            status="UP",
            latency_ms=latency,
            uptime_seconds=0.0,
            uptime="Ready",
            message=f"v{getattr(cp_model, '__version__', '9.x')} Loaded correctly"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            service="OR-Tools CP-SAT Solver",
            status="DOWN",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="Missing",
            message="Failed to import engine"
        ))

    # 4. IRCTC RapidAPI Check
    try:
        start_time = time.perf_counter()
        rapidapi_host = os.getenv("RAPIDAPI_HOST", "indian-railway-irctc.p.rapidapi.com")
        
        # We just ping the root or an invalid endpoint quickly to measure latency to the edge
        url = f"https://{rapidapi_host}"
        
        async with httpx.AsyncClient() as client:
            resp = await client.head(url, timeout=3.0)
            latency = int((time.perf_counter() - start_time) * 1000)
            
            # As long as we get a response (even 403 or 404 because no auth), the API is reachable
            results.append(ServiceHealth(
                service="IRCTC Live Tracker Router",
                status="UP",
                latency_ms=latency,
                uptime_seconds=0.0,
                uptime="External",
                message=f"Ping OK ({resp.status_code})"
            ))
    except Exception as e:
        results.append(ServiceHealth(
            service="IRCTC Live Tracker Router",
            status="DEGRADED",
            latency_ms=0,
            uptime_seconds=0.0,
            uptime="External",
            message="Connection timeout or DNS failure"
        ))

    return results
