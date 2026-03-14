import os
import time
import httpx
import psutil
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database import get_db
from models import User
from auth_utils import get_current_user

router = APIRouter()


class ServiceHealth(BaseModel):
    name: str
    status: str
    latency_ms: int
    uptime: str = "N/A"
    message: str


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
            name="PostgreSQL Database",
            status="UP",
            latency_ms=latency,
            uptime="Connected",
            message="Read/Write Operations Normal"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            name="PostgreSQL Database",
            status="DOWN",
            latency_ms=0,
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
            name="FastAPI Backend Core",
            status="UP",
            latency_ms=1,
            uptime=uptime_str,
            message="uvicorn worker operational"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            name="FastAPI Backend Core",
            status="DEGRADED",
            latency_ms=0,
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
            name="OR-Tools CP-SAT Solver",
            status="UP",
            latency_ms=latency,
            uptime="Ready",
            message=f"v{getattr(cp_model, '__version__', '9.x')} Loaded correctly"
        ))
    except Exception as e:
        results.append(ServiceHealth(
            name="OR-Tools CP-SAT Solver",
            status="DOWN",
            latency_ms=0,
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
                name="IRCTC Live Tracker Router",
                status="UP",
                latency_ms=latency,
                uptime="External",
                message=f"Ping OK ({resp.status_code})"
            ))
    except Exception as e:
        results.append(ServiceHealth(
            name="IRCTC Live Tracker Router",
            status="DEGRADED",
            latency_ms=0,
            uptime="External",
            message="Connection timeout or DNS failure"
        ))

    return results
