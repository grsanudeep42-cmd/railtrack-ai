"""
routers/trains.py — Real DB-backed train endpoints for RailTrack AI.
  GET   /api/trains/                   — list all trains (filter by ?section=)
  GET   /api/trains/{train_id}          — full train details + schedule
  PATCH /api/trains/{train_id}/status  — update train status + audit log
"""

from datetime import datetime, timezone
from typing import Optional, List

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
