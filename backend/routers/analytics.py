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
from sqlalchemy import select, func, and_, case, Date, text

from database import get_db
from models import Train, Conflict, Decision, DecisionSourceEnum, TrainStatusEnum, User, PriorityEnum
from auth_utils import get_current_user

router = APIRouter()


class KPIResponse(BaseModel):
    punctuality_pct: float
    avg_delay_minutes: float
    conflicts_resolved: int
    ai_acceptance_rate: float
    throughput_today: int
    override_rate: float
    # Sparklines (last N days)
    sparkline_delay: List[float]
    sparkline_punctuality: List[float]
    sparkline_throughput: List[int]
    sparkline_conflicts: List[int]
    sparkline_override: List[float]
    sparkline_ai: List[float]


@router.get("/kpis", response_model=KPIResponse)
async def get_analytics_kpis(
    period: int = Query(7, description="Days for sparkline history"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all 6 KPIs and their sparkline history arrays."""

    # ── 1. Current Stats (Same logic as before) ─────────────────────────────
    # ... but we'll also compute the sparklines below

    # Helper to get daily stats for sparklines
    cutoff = datetime.utcnow() - timedelta(days=period)
    
    # Aggregated Sparkline Query
    # Note: We group by date_trunc to get daily points
    history_query = (
        select(
            func.date_trunc('day', Train.created_at).label('day'),
            func.avg(Train.delay).label('avg_delay'),
            func.count(Train.id).label('throughput'),
            func.count(case((Train.delay == 0, Train.id), else_=None)).label('on_time')
        )
        .where(Train.created_at >= cutoff)
        .group_by(text('1'))
        .order_by(text('1'))
    )
    history_result = await db.execute(history_query)
    history_rows = history_result.all()
    
    # Conflict Sparkline
    conflict_history_query = (
        select(
            func.date_trunc('day', Conflict.detected_at).label('day'),
            func.count(Conflict.id).label('conflicts')
        )
        .where(Conflict.detected_at >= cutoff)
        .group_by(text('1'))
        .order_by(text('1'))
    )
    conflict_history_result = await db.execute(conflict_history_query)
    conflict_rows = {r.day.date(): r.conflicts for r in conflict_history_result.all() if r.day}

    # Decision Sparkline (AI Acceptance & Override)
    decision_history_query = (
        select(
            func.date_trunc('day', Decision.timestamp).label('day'),
            func.count(Decision.id).label('total'),
            func.count(case((Decision.source == DecisionSourceEnum.AI, Decision.id), else_=None)).label('ai'),
            func.count(case((Decision.source == DecisionSourceEnum.MANUAL, Decision.id), else_=None)).label('manual')
        )
        .where(Decision.timestamp >= cutoff)
        .group_by(text('1'))
        .order_by(text('1'))
    )
    decision_history_result = await db.execute(decision_history_query)
    decision_rows = {r.day.date(): r for r in decision_history_result.all() if r.day}

    # Map history to fixed-length sparkline arrays
    train_map = {r.day.date(): r for r in history_rows if r.day}
    
    spark_delay = []
    spark_punct = []
    spark_thru = []
    spark_conf = []
    spark_over = []
    spark_ai = []

    for i in range(period - 1, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).date()
        
        # Train metrics
        tr = train_map.get(d)
        spark_delay.append(round(float(tr.avg_delay or 0.0), 1) if tr else 0.0)
        spark_thru.append(tr.throughput if tr else 0)
        punct = round((tr.on_time / tr.throughput * 100), 1) if tr and tr.throughput > 0 else 0.0
        spark_punct.append(punct)
        
        # Conflict metric
        spark_conf.append(conflict_rows.get(d, 0))
        
        # Decision metrics
        dr = decision_rows.get(d)
        if dr and dr.total > 0:
            spark_ai.append(round((dr.ai / dr.total * 100), 1))
            spark_over.append(round((dr.manual / dr.total * 100), 1))
        else:
            spark_ai.append(0.0)
            spark_over.append(0.0)

    # Current Totals (same as before but using the variables we already have for throughput if possible)
    # Re-running existing logic to ensure accuracy for the "Now" display
    
    avg_delay_res = await db.execute(select(func.avg(Train.delay)))
    curr_avg_delay = round(float(avg_delay_res.scalar() or 0.0), 1)

    total_t_res = await db.execute(select(func.count(Train.id)))
    total_t = total_t_res.scalar() or 0
    on_t_res = await db.execute(select(func.count(Train.id)).where((Train.delay == 0) | (Train.delay == None)))
    curr_punct = round((on_t_res.scalar() or 0) / total_t * 100, 1) if total_t > 0 else 0.0

    res_res = await db.execute(select(func.count(Conflict.id)).where(Conflict.resolved == True))
    curr_res = res_res.scalar() or 0

    dec_res = await db.execute(select(
        func.count(Decision.id),
        func.count(case((Decision.source == DecisionSourceEnum.AI, Decision.id), else_=None)),
        func.count(case((Decision.source == DecisionSourceEnum.MANUAL, Decision.id), else_=None))
    ))
    d_row = dec_res.one()
    curr_ai = round((d_row[1] / d_row[0] * 100), 1) if d_row[0] > 0 else 0.0
    curr_over = round((d_row[2] / d_row[0] * 100), 1) if d_row[0] > 0 else 0.0

    today_start = datetime.combine(date.today(), datetime.min.time())
    thru_res = await db.execute(select(func.count(Train.id)).where(Train.created_at >= today_start))
    curr_thru = thru_res.scalar() or 0
    if curr_thru == 0:
        curr_thru = (await db.execute(select(func.count(Train.id)).where(Train.status.in_([TrainStatusEnum.RUNNING, TrainStatusEnum.ON_TIME, TrainStatusEnum.DELAYED])))).scalar() or total_t

    return KPIResponse(
        punctuality_pct=curr_punct,
        avg_delay_minutes=curr_avg_delay,
        conflicts_resolved=curr_res,
        ai_acceptance_rate=curr_ai,
        throughput_today=curr_thru,
        override_rate=curr_over,
        sparkline_delay=spark_delay,
        sparkline_punctuality=spark_punct,
        sparkline_throughput=spark_thru,
        sparkline_conflicts=spark_conf,
        sparkline_override=spark_over,
        sparkline_ai=spark_ai
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
        .group_by(text('1'))
        .order_by(text('1'))
    )
    result = await db.execute(query)
    rows = result.all()
    
    # Fallback: if no data in period, fetch all-time data spread across last N days
    if not rows:
        fallback_query = (
            select(
                func.avg(case((Train.priority == PriorityEnum.EXPRESS, Train.delay), else_=None)).label('express'),
                func.avg(case((Train.priority == PriorityEnum.FREIGHT, Train.delay), else_=None)).label('freight'),
                func.avg(case((Train.priority == PriorityEnum.LOCAL, Train.delay), else_=None)).label('local'),
            )
        )
        fb = (await db.execute(fallback_query)).one()
        return [{"time": (datetime.utcnow() - timedelta(days=i)).strftime("%a"),
                 "express": round(float(fb.express or 0), 1),
                 "freight": round(float(fb.freight or 0), 1),
                 "local": round(float(fb.local or 0), 1)}
                for i in range(period - 1, -1, -1)]
                
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
        .group_by(text('1'))
        .order_by(text('1'))
    )
    result = await db.execute(query)
    rows = result.all()
    
    # Fallback: if no data in period, fetch all-time data spread evenly
    if not rows:
        fallback_query = (
            select(
                func.count(case((Train.priority == PriorityEnum.EXPRESS, Train.id), else_=None)).label('express'),
                func.count(case((Train.priority == PriorityEnum.FREIGHT, Train.id), else_=None)).label('freight'),
                func.count(case((Train.priority == PriorityEnum.LOCAL, Train.id), else_=None)).label('local'),
            )
        )
        fb = (await db.execute(fallback_query)).one()
        return [{"time": (datetime.utcnow() - timedelta(days=i)).strftime("%a"),
                 "express": (fb.express or 0) // period,
                 "freight": (fb.freight or 0) // period,
                 "local": (fb.local or 0) // period}
                for i in range(period - 1, -1, -1)]

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
            func.count(case((Decision.action == 'ACCEPT_AI', Decision.id), else_=None)).label('accepted')
        )
        .select_from(Conflict)
        .outerjoin(Decision, Conflict.id == Decision.conflict_id)
        .where(Conflict.detected_at >= datetime.utcnow() - timedelta(days=period))
        .group_by(text('1'))
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


class SummaryResponse(BaseModel):
    trains_today: int
    avg_delay_reduction: float
    uptime_percentage: float

@router.get("/summary", response_model=SummaryResponse)
async def get_analytics_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Summary stats — requires authentication.
    - trains_today: count trains updated/active today
    - avg_delay_reduction: week vs week % improvement
    - uptime_percentage: resolved / total conflicts proxy
    """
    now = datetime.utcnow()
    today_start = datetime.combine(now.date(), datetime.min.time())
    
    # 1. Trains Today
    trains_today = (await db.execute(select(func.count(Train.id)).where(Train.created_at >= today_start))).scalar() or 0
    if trains_today == 0:
        # Fallback to total if no data today
        trains_today = (await db.execute(select(func.count(Train.id)))).scalar() or 0

    # 2. Avg Delay Reduction (current week vs previous week)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    
    avg_curr = (await db.execute(select(func.avg(Train.delay)).where(Train.created_at >= week_ago))).scalar() or 0
    avg_prev = (await db.execute(select(func.avg(Train.delay)).where((Train.created_at >= two_weeks_ago) & (Train.created_at < week_ago)))).scalar() or 1 # avoid devIDE by 0
    
    # % improvement = (prev - curr) / prev * 100
    reduction = round(((float(avg_prev) - float(avg_curr)) / float(avg_prev) * 100), 1) if avg_prev > 0 else 0.0
    if reduction < 0: reduction = 0.0 # Clamp to 0 if delay increased

    # 3. Uptime Percentage Proxy (resolved / total conflicts)
    total_conf = (await db.execute(select(func.count(Conflict.id)))).scalar() or 0
    res_conf = (await db.execute(select(func.count(Conflict.id)).where(Conflict.resolved == True))).scalar() or 0
    
    uptime = round((res_conf / total_conf * 100), 2) if total_conf > 0 else 0.0

    return SummaryResponse(
        trains_today=trains_today,
        avg_delay_reduction=reduction,
        uptime_percentage=uptime
    )
