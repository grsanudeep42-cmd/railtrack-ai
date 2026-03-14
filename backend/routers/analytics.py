"""
analytics.py — Analytics KPI endpoint for RailTrack AI.
Computes all 6 KPIs from real DB data.
"""
import os
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case

from database import get_db
from models import Train, Conflict, Decision, DecisionSourceEnum, TrainStatusEnum, User, PriorityEnum
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


@router.get("/delay-chart")
async def get_delay_chart(
    period: int = 7,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns daily average delay mapped to express, freight, and local trains for last N days.
    """
    cutoff = datetime.utcnow() - timedelta(days=period)
    
    query = (
        select(
            func.date_trunc('day', Train.created_at).label('day_date'),
            func.avg(case((Train.priority == PriorityEnum.EXPRESS, Train.delay), else_=None)).label('express'),
            func.avg(case((Train.priority == PriorityEnum.FREIGHT, Train.delay), else_=None)).label('freight'),
            func.avg(case((Train.priority == PriorityEnum.LOCAL, Train.delay), else_=None)).label('local'),
        )
        .where(Train.created_at >= cutoff)
        .group_by(func.date_trunc('day', Train.created_at))
        .order_by(func.date_trunc('day', Train.created_at))
    )
    result = await db.execute(query)
    rows = result.all()
    
    lookup = {row.day_date.date(): row for row in rows if row.day_date}
    chart_data = []
    
    for i in range(period - 1, -1, -1):
        d_obj = (datetime.utcnow() - timedelta(days=i)).date()
        day_str = d_obj.strftime("%a")
        
        if d_obj in lookup:
            r = lookup[d_obj]
            chart_data.append({
                "time": day_str,
                "express": round(float(r.express or 0.0), 1),
                "freight": round(float(r.freight or 0.0), 1),
                "local": round(float(r.local or 0.0), 1),
            })
        else:
            chart_data.append({
                "time": day_str,
                "express": 0.0,
                "freight": 0.0,
                "local": 0.0,
            })
            
    return chart_data


@router.get("/throughput-chart")
async def get_throughput_chart(
    period: int = 7,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns rolling count of trains processed each day, split by type.
    """
    cutoff = datetime.utcnow() - timedelta(days=period)
    
    query = (
        select(
            func.date_trunc('day', Train.created_at).label('day_date'),
            func.count(case((Train.priority == PriorityEnum.EXPRESS, Train.id), else_=None)).label('express'),
            func.count(case((Train.priority == PriorityEnum.FREIGHT, Train.id), else_=None)).label('freight'),
            func.count(case((Train.priority == PriorityEnum.LOCAL, Train.id), else_=None)).label('local'),
        )
        .where(Train.created_at >= cutoff)
        .group_by(func.date_trunc('day', Train.created_at))
        .order_by(func.date_trunc('day', Train.created_at))
    )
    result = await db.execute(query)
    rows = result.all()
    
    lookup = {row.day_date.date(): row for row in rows if row.day_date}
    chart_data = []
    
    for i in range(period - 1, -1, -1):
        d_obj = (datetime.utcnow() - timedelta(days=i)).date()
        day_str = d_obj.strftime("%a")
        
        if d_obj in lookup:
            r = lookup[d_obj]
            chart_data.append({
                "time": day_str,
                "express": r.express or 0,
                "freight": r.freight or 0,
                "local": r.local or 0,
            })
        else:
            chart_data.append({
                "time": day_str,
                "express": 0,
                "freight": 0,
                "local": 0,
            })
            
    return chart_data


@router.get("/heatmap")
async def get_conflict_heatmap(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns conflict clustering by Day of Week vs Hour, over all time. 
    Format matching Recharts array matrix: [{day, hour, value}]
    """
    query = (
        select(
            func.extract('isodow', Conflict.detected_at).label('dow'),
            func.extract('hour', Conflict.detected_at).label('hour'),
            func.count(Conflict.id).label('val')
        )
        .group_by(
            func.extract('isodow', Conflict.detected_at),
            func.extract('hour', Conflict.detected_at)
        )
    )
    result = await db.execute(query)
    rows = result.all()
    
    days_map = {1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun'}
    matrix = {(d, h): 0 for d in range(1, 8) for h in range(24)}
            
    for row in rows:
        matrix[(int(row.dow), int(row.hour))] = row.val
        
    chart_data = []
    for d in range(1, 8):
        day_str = days_map[d]
        for h in range(24):
            chart_data.append({
                "day": day_str,
                "hour": h,
                "value": matrix[(d, h)]
            })
            
    return chart_data


@router.get("/incidents")
async def get_recent_incidents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the latest 20 conflicts/incidents to populate the Analytics table.
    """
    query = (
        select(Conflict)
        .order_by(Conflict.detected_at.desc())
        .limit(20)
    )
    result = await db.execute(query)
    conflicts = result.scalars().all()
    
    return [
        {
            "id": c.id,
            "timestamp": c.detected_at.strftime("%H:%M:%S") if c.detected_at else "",
            "type": c.conflict_type.value if c.conflict_type else "UNKNOWN",
            "location": c.location,
            "trains": [c.train_a_id, c.train_b_id],
            "severity": c.severity.value if c.severity else "MEDIUM",
            "resolvedIn": f"{int((c.resolved_at - c.detected_at).total_seconds() // 60)} mins" if c.resolved and c.resolved_at and c.detected_at else "Pending"
        }
        for c in conflicts
    ]


@router.get("/ai-acceptance")
async def get_ai_acceptance(
    period: int = Query(14, description="Days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the AI Acceptance rate for the past N days.
    """
    query = (
        select(
            func.date_trunc('day', Conflict.detected_at).label('day_date'),
            func.count(Conflict.id.distinct()).label('total'),
            func.count(Decision.id).filter(Decision.action == 'ACCEPT_AI').label('accepted')
        )
        .select_from(Conflict)
        .outerjoin(Decision, Conflict.id == Decision.conflict_id)
        .where(Conflict.detected_at >= datetime.utcnow() - timedelta(days=period))
        .group_by(func.date_trunc('day', Conflict.detected_at))
    )
    result = await db.execute(query)
    rows = result.all()
    
    lookup = {row.day_date.date(): row for row in rows if row.day_date}
    chart_data = []
    
    for i in range(period - 1, -1, -1):
        d_obj = (datetime.utcnow() - timedelta(days=i)).date()
        date_str = d_obj.strftime("%d %b")
        
        if d_obj in lookup:
            r = lookup[d_obj]
            total = r.total or 0
            accepted = r.accepted or 0
            rate = round((accepted / total * 100), 1) if total > 0 else 0.0
            chart_data.append({
                "date": date_str,
                "acceptance": rate,
                "total": total
            })
        else:
            chart_data.append({
                "date": date_str,
                "acceptance": 0.0,
                "total": 0
            })
            
    return chart_data
