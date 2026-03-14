"""
routers/trains.py — Real DB-backed train endpoints for RailTrack AI.
  GET   /api/trains/                   — list all trains (filter by ?section=)
  GET   /api/trains/{train_id}          — full train details + schedule
  PATCH /api/trains/{train_id}/status  — update train status + audit log
"""

from datetime import datetime, timezone
import os
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Train, Schedule, AuditLog, User
from auth_utils import get_current_user

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ScheduleStop(BaseModel):
    station: str
    station_code: str
    sequence: int
    arrival_time: Optional[datetime]
    departure_time: Optional[datetime]
    platform: Optional[int]
    distance_km: Optional[float]

    class Config:
        from_attributes = True


class TrainResponse(BaseModel):
    id: str
    name: str
    priority: str
    origin: str
    destination: str
    section: str
    status: str
    delay: int
    speed: float
    platform: Optional[int]

    class Config:
        from_attributes = True


class TrainDetailResponse(TrainResponse):
    schedules: List[ScheduleStop] = []


class StatusUpdateRequest(BaseModel):
    status: str
    reason: Optional[str] = None


class LiveTrainResponse(BaseModel):
    train_number: str
    current_station: str
    current_station_name: str
    delay_minutes: int
    terminated: bool
    last_updated: str
    next_station: str
    expected_arrival_ndls: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TrainResponse])
async def get_trains(
    section: Optional[str] = Query(None, description="Filter trains by section, e.g. NR-42"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all trains, optionally filtered by section."""
    stmt = select(Train)
    if section:
        stmt = stmt.where(Train.section == section)
    stmt = stmt.order_by(Train.priority, Train.id)

    result = await db.execute(stmt)
    trains = result.scalars().all()

    return [
        TrainResponse(
            id=t.id,
            name=t.name,
            priority=t.priority.value,
            origin=t.origin,
            destination=t.destination,
            section=t.section,
            status=t.status.value,
            delay=t.delay or 0,
            speed=t.speed or 0.0,
            platform=t.platform,
        )
        for t in trains
    ]


@router.get("/live/{train_number}", response_model=LiveTrainResponse)
async def get_live_train_status(
    train_number: str,
    current_user: User = Depends(get_current_user),
):
    """Fetch real live train actuals from IRCTC RapidAPI."""
    url = f"https://indian-railway-irctc.p.rapidapi.com/api/trains/v1/train/status?departure_date=TODAY&isH5=true&client=web&train_number={train_number}"
    
    rapidapi_key = os.getenv("RAPIDAPI_KEY")
    rapidapi_host = os.getenv("RAPIDAPI_HOST")
    
    if not rapidapi_key or not rapidapi_host:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="RapidAPI credentials missing from backend environment."
        )

    headers = {
        "x-rapidapi-key": rapidapi_key,
        "x-rapidapi-host": rapidapi_host
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            body = data.get("body", {})
            
            terminated = body.get("terminated", False)
            last_updated = str(body.get("server_timestamp", "Unknown"))
            
            current_station_code = body.get("current_station", "")
            current_station_name = "Transit"
            next_station = "Unknown"
            expected_arrival_ndls = None
            delay_minutes = 0
            
            # Find in stations list
            stations = body.get("stations", [])
            
            for i, st in enumerate(stations):
                st_code = st.get("station_code")
                # Lookup NDLS explicitly
                if st_code == "NDLS":
                    expected_arrival_ndls = st.get("actual_arrival_time") or st.get("expected_arrival")
                
                if st_code == current_station_code:
                    current_station_name = st.get("station_name", current_station_code)
                    # Try delay calculation if not directly given
                    direct_delay = st.get("delay")
                    if isinstance(direct_delay, int):
                        delay_minutes = direct_delay
                    else:
                        actual = st.get("actual_arrival_time")
                        sched = st.get("scheduled_arrival_time", st.get("arrival_time"))
                        if actual and sched:
                            # Parse expected HH:MM strings to calculate differences
                            try:
                                h_a, m_a = map(int, actual.split(":"))
                                h_s, m_s = map(int, sched.split(":"))
                                delay_minutes = (h_a * 60 + m_a) - (h_s * 60 + m_s)
                                # handle midnight cross
                                if delay_minutes < -720: 
                                    delay_minutes += 1440 
                            except:
                                delay_minutes = int(body.get("delay", 0))
                    
                    if i + 1 < len(stations):
                        next_station = stations[i+1].get("station_name", "End of Route")
            
            return LiveTrainResponse(
                train_number=train_number,
                current_station=current_station_code,
                current_station_name=current_station_name,
                delay_minutes=delay_minutes,
                terminated=terminated,
                last_updated=last_updated,
                next_station=next_station,
                expected_arrival_ndls=expected_arrival_ndls
            )
            
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, 
            detail=f"Error fetching live status: {exc.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error connecting to train API: {str(e)}"
        )


@router.get("/info/{train_number}", response_model=TrainResponse)
async def get_live_train_info_and_update(
    train_number: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch static train details (name, route) from basic info endpoint, update local DB."""
    url = f"https://indian-railway-irctc.p.rapidapi.com/api/v1/getTrainDetails?trainNo={train_number}"
    rapidapi_key = os.getenv("RAPIDAPI_KEY")
    rapidapi_host = os.getenv("RAPIDAPI_HOST")

    headers = {
        "x-rapidapi-key": rapidapi_key,
        "x-rapidapi-host": rapidapi_host
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            data_body = data.get("data", {})
            name = data_body.get("trainName", f"Train {train_number}")
            origin = data_body.get("sourceStationName", "Unknown")
            destination = data_body.get("destinationStationName", "Unknown")
            
            # Fetch the DB record
            result = await db.execute(select(Train).where(Train.id == train_number))
            train = result.scalar_one_or_none()
            
            if not train:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_number} not in DB to update")
                
            # Update DB entry
            train.name = name
            train.origin = origin
            train.destination = destination
            await db.commit()
            await db.refresh(train)
            
            return TrainResponse(
                id=train.id,
                name=train.name,
                priority=train.priority.value,
                origin=train.origin,
                destination=train.destination,
                section=train.section,
                status=train.status.value,
                delay=train.delay or 0,
                speed=train.speed or 0.0,
                platform=train.platform,
            )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Info API Error: {str(e)}"
        )


@router.get("/{train_id}", response_model=TrainDetailResponse)
async def get_train(
    train_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return full train details including all schedule stops."""
    stmt = (
        select(Train)
        .where(Train.id == train_id)
        .options(selectinload(Train.schedules))
    )
    result = await db.execute(stmt)
    train = result.scalar_one_or_none()

    if train is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_id} not found")

    stops = sorted(train.schedules, key=lambda s: s.sequence)

    return TrainDetailResponse(
        id=train.id,
        name=train.name,
        priority=train.priority.value,
        origin=train.origin,
        destination=train.destination,
        section=train.section,
        status=train.status.value,
        delay=train.delay or 0,
        speed=train.speed or 0.0,
        platform=train.platform,
        schedules=[
            ScheduleStop(
                station=s.station,
                station_code=s.station_code,
                sequence=s.sequence,
                arrival_time=s.arrival_time,
                departure_time=s.departure_time,
                platform=s.platform,
                distance_km=s.distance_km,
            )
            for s in stops
        ],
    )


@router.patch("/{train_id}/status", response_model=TrainResponse)
async def update_train_status(
    train_id: str,
    body: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a train's status (RUNNING / HALTED / DELAYED / etc.).
    Writes an audit log entry.
    """
    from models import TrainStatusEnum

    result = await db.execute(select(Train).where(Train.id == train_id))
    train = result.scalar_one_or_none()

    if train is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Train {train_id} not found")

    try:
        new_status = TrainStatusEnum(body.status.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status: {body.status}. Valid values: {[e.value for e in TrainStatusEnum]}",
        )

    old_status = train.status.value
    train.status = new_status

    # Write audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_TRAIN_STATUS",
        entity=f"train:{train_id}",
        detail=f"Status changed from {old_status} to {new_status.value}. Reason: {body.reason or 'N/A'}",
    )
    db.add(audit)
    await db.commit()
    await db.refresh(train)

    return TrainResponse(
        id=train.id,
        name=train.name,
        priority=train.priority.value,
        origin=train.origin,
        destination=train.destination,
        section=train.section,
        status=train.status.value,
        delay=train.delay or 0,
        speed=train.speed or 0.0,
        platform=train.platform,
    )
