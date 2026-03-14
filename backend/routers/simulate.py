"""
routers/simulate.py — Real simulation endpoint backed by the OR-Tools solver.
  POST /api/simulate/run — run optimization solver with real train data from DB
"""

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime

from database import get_db
from models import Train, SimulationResult, User
from auth_utils import get_current_user
from algorithm.solver import PrecedenceOptimizer

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    train_ids: Optional[List[str]] = None
    disruption_type: str
    disruption_location: str
    disruption_duration_minutes: int
    objective: str = "MINIMIZE_DELAY"


class SimActionResult(BaseModel):
    train: str
    action: str
    delta: int   # delay delta in minutes (negative = time saved)


class SimulationResponse(BaseModel):
    status: str
    baseline_delay: int
    optimized_delay: int
    delay_delta: int
    throughput_change: float
    conflicts_avoided: int
    actions: List[SimActionResult]
    simulation_id: Optional[int] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/run", response_model=SimulationResponse)
async def run_simulation(
    req: SimulationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the OR-Tools CP-SAT precedence optimizer on the requested trains.
    Loads train data from PostgreSQL, calls solver, stores result, returns output.
    """
    # Fetch trains from DB
    if not req.train_ids:
        # If None or empty list, fetch all trains for section NR-42 defaults
        result = await db.execute(select(Train).where(Train.section == "NR-42").options(selectinload(Train.schedules)))
    else:
        result = await db.execute(select(Train).where(Train.id.in_(req.train_ids)).options(selectinload(Train.schedules)))
        
    trains_db = result.scalars().all()

    if not trains_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"None of the requested trains found: {req.train_ids}",
        )

    # Build solver-compatible train dicts
    solver_trains = []
    for tr in trains_db:
        speed = tr.speed if tr.speed and tr.speed > 0 else 60.0
        
        if tr.schedules:
            sorted_schedules = sorted(tr.schedules, key=lambda s: s.sequence)
            distance = sum((s.distance_km or 0.0) for s in sorted_schedules)
            
            first_dep = sorted_schedules[0].departure_time
            if first_dep:
                now_dt = datetime.now(first_dep.tzinfo)
                scheduled_arrival = int((first_dep - now_dt).total_seconds())
            else:
                scheduled_arrival = 0
        else:
            distance = 300.0
            scheduled_arrival = 0

        solver_trains.append({
            "id":                tr.id,
            "name":              tr.name,
            "speed":             speed,
            "distance":          distance,
            "scheduled_arrival": scheduled_arrival,
            "priority":          tr.priority.value,
            "delay":             tr.delay or 0,
        })

    # Baseline delay (sum of current delays)
    baseline_delay = sum(t["delay"] for t in solver_trains)

    # Run solver
    try:
        optimizer = PrecedenceOptimizer(
            trains=solver_trains,
            track_capacity=1,
            objective=req.objective,
        )
        solver_result = optimizer.solve()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Solver error: {str(exc)}",
        )

    # Derive optimized metrics from solver output
    schedule = solver_result.get("schedule", [])
    
    # The solver returns actual delay minutes for each train
    optimized_delay = sum(s.get("delay_minutes", 0) for s in schedule)
    delay_delta = optimized_delay - baseline_delay
    
    # 1. Real conflicts avoided = number of interventions by the solver
    conflicts_avoided = sum(1 for s in schedule if s.get("action") in ["HOLD", "REROUTE"])
    
    # 2. Real throughput/punctuality = % of trains that are NOT delayed after optimization
    baseline = len(trains_db)
    delayed_count = sum(1 for s in schedule if s.get("delay_minutes", 0) > 0)
    throughput_change = round(((baseline - delayed_count) / baseline) * 100, 1) if baseline > 0 else 0.0

    actions = []
    for sched in schedule:
        # Match original train to calculate individual delta
        original_delay = next((t["delay"] for t in solver_trains if t["id"] == sched["train"]), 0)
        delta = sched.get("delay_minutes", 0) - original_delay
        
        actions.append(SimActionResult(
            train=sched["train"],
            action=sched["action"],
            delta=delta,
        ))

    response_data = SimulationResponse(
        status=solver_result.get("status", "COMPLETED"),
        baseline_delay=baseline_delay,
        optimized_delay=optimized_delay,
        delay_delta=delay_delta,
        throughput_change=throughput_change,
        conflicts_avoided=conflicts_avoided,
        actions=actions,
    )

    # Persist simulation result
    sim_record = SimulationResult(
        event_type=req.disruption_type,
        location=req.disruption_location,
        duration_min=req.disruption_duration_minutes,
        objective=req.objective,
        baseline_delay=baseline_delay,
        optimized_delay=optimized_delay,
        delay_delta=delay_delta,
        conflicts_avoided=conflicts_avoided,
        result_json=json.dumps(response_data.model_dump()),
        run_by=current_user.id,
    )
    db.add(sim_record)
    await db.commit()
    await db.refresh(sim_record)

    response_data.simulation_id = sim_record.id
    return response_data
