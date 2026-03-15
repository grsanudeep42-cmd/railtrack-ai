"""
routers/disruptions.py — Disruptions endpoint for RailTrack AI.
Returns the 5 most recent unresolved conflicts from the past 24 hours
formatted as UI-ready disruption alerts.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel

from database import get_db
from models import Conflict, User
from auth_utils import get_current_user

router = APIRouter()

class DisruptionResponse(BaseModel):
    icon: str
    text: str
    time: str
    severity: str

@router.get("/", response_model=List[DisruptionResponse])
async def get_recent_disruptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns up to 5 recent unresolved conflicts for the user's section
    formatted for the UI alerts widget.
    """

    result = await db.execute(
        select(Conflict)
        .where(Conflict.resolved == False)
        .order_by(Conflict.detected_at.desc())
        .limit(5)
    )
    conflicts = result.scalars().all()

    disruptions = []
    for c in conflicts:
        # Map severity to UI severity color
        # DB severity: HIGH, MEDIUM, LOW
        sev_map = {
            "HIGH": "err",
            "MEDIUM": "warn",
            "LOW": "rail",
        }
        ui_severity = sev_map.get(c.severity, "warn")

        # Map conflict type to an icon
        icon_map = {
            "HEAD_ON": "💥",
            "REAR_END": "🚂",
            "CROSSING": "🛤️",
            "STATION_CAPACITY": "🚉",
        }
        icon = icon_map.get(c.conflict_type, "⚠️")

        time_str = c.detected_at.strftime("%H:%M") if c.detected_at else "Now"

        disruptions.append(
            DisruptionResponse(
                icon=icon,
                text=f"{c.conflict_type.replace('_', ' ').title()} — {c.train_a_id} & {c.train_b_id} at {c.location}",
                time=time_str,
                severity=ui_severity,
            )
        )

    return disruptions
