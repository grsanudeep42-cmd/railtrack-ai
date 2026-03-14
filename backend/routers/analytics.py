"""
analytics.py — Analytics KPI endpoint for RailTrack AI.
Computes all 6 KPIs from real DB data.
"""
import os
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from database import get_db
from models import Train, Conflict, Decision, DecisionSourceEnum, TrainStatusEnum, User
from auth_utils import get_current_user

router = APIRouter()


class KPIResponse(BaseModel):
    punctuality_pct: float       # % decisions with delay=0 / total, or % on-time trains
    avg_delay_minutes: float     # avg delay across all trains
    conflicts_resolved: int      # count conflicts where resolved=True
    ai_acceptance_rate: float    # % decisions made by AI
    throughput_today: int        # count of trains created/active today
    override_rate: float         # % decisions made manually


@router.get("/kpis", response_model=KPIResponse)
async def get_analytics_kpis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all 6 KPIs computed from real PostgreSQL queries."""

    # ── 1. Avg Delay: average of trains.delay column ─────────────────────────
    avg_delay_result = await db.execute(
        select(func.avg(Train.delay).label("avg_delay"))
    )
    avg_delay = avg_delay_result.scalar() or 0.0
    avg_delay = round(float(avg_delay), 1)

    # ── 2. Punctuality %: percentage of trains with delay == 0 ───────────────
    total_trains_result = await db.execute(select(func.count(Train.id)))
    total_trains = total_trains_result.scalar() or 0

    on_time_result = await db.execute(
        select(func.count(Train.id)).where(
            (Train.delay == 0) | (Train.delay == None)
        )
    )
    on_time_count = on_time_result.scalar() or 0
    punctuality_pct = round((on_time_count / total_trains * 100) if total_trains > 0 else 0.0, 1)

    # ── 3. Conflicts Resolved: count conflicts where resolved=True ────────────
    resolved_result = await db.execute(
        select(func.count(Conflict.id)).where(Conflict.resolved == True)
    )
    conflicts_resolved = resolved_result.scalar() or 0

    # ── 4 & 6. Decision Metrics (AI acceptance %, override rate %) ───────────
    total_decisions_result = await db.execute(select(func.count(Decision.id)))
    total_decisions = total_decisions_result.scalar() or 0

    ai_decisions_result = await db.execute(
        select(func.count(Decision.id)).where(
            Decision.source == DecisionSourceEnum.AI
        )
    )
    ai_decisions = ai_decisions_result.scalar() or 0

    manual_decisions_result = await db.execute(
        select(func.count(Decision.id)).where(
            Decision.source == DecisionSourceEnum.MANUAL
        )
    )
    manual_decisions = manual_decisions_result.scalar() or 0

    ai_acceptance_rate = round(
        (ai_decisions / total_decisions * 100) if total_decisions > 0 else 0.0, 1
    )
    override_rate = round(
        (manual_decisions / total_decisions * 100) if total_decisions > 0 else 0.0, 1
    )

    # ── 5. Throughput Today: trains created or active today ───────────────────
    today_start = datetime.combine(date.today(), datetime.min.time())
    throughput_result = await db.execute(
        select(func.count(Train.id)).where(
            Train.created_at >= today_start
        )
    )
    throughput_today = throughput_result.scalar() or 0

    # If no trains created today (seeded data), count all running/active trains
    if throughput_today == 0:
        active_statuses = [
            TrainStatusEnum.RUNNING,
            TrainStatusEnum.ON_TIME,
            TrainStatusEnum.DELAYED,
        ]
        throughput_result = await db.execute(
            select(func.count(Train.id)).where(Train.status.in_(active_statuses))
        )
        throughput_today = throughput_result.scalar() or total_trains

    return KPIResponse(
        punctuality_pct=punctuality_pct,
        avg_delay_minutes=avg_delay,
        conflicts_resolved=conflicts_resolved,
        ai_acceptance_rate=ai_acceptance_rate,
        throughput_today=throughput_today,
        override_rate=override_rate,
    )
