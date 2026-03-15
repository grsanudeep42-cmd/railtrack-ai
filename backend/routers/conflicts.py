"""
routers/conflicts.py — Real DB-backed conflict endpoints for RailTrack AI.
  GET  /api/conflicts/                     — list active (unresolved) conflicts
                                             (DB conflicts + ephemeral real-time detections)
  POST /api/conflicts/{conflict_id}/resolve — resolve a conflict, store decision + audit
                                             (realtime conflicts with id prefix "RT-" are
                                              acknowledged in-memory only — not persisted)
"""

import uuid
import logging
from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Conflict, Decision, AuditLog, User, Train, TrainStatusEnum, DecisionSourceEnum, SeverityEnum
from auth_utils import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ConflictResponse(BaseModel):
    id: str
    train_a_id: str
    train_b_id: str
    location: str
    severity: str
    conflict_type: str
    time_to_conflict: Optional[int]
    recommendation: Optional[str]
    confidence: Optional[int]
    time_saving: Optional[int]
    detected_at: datetime
    resolved: bool
    resolved_at: Optional[datetime]
    source: str = "SEEDED"   # "SEEDED" | "REALTIME" — additive field, frontend ignores safely

    class Config:
        from_attributes = True


class ResolveRequest(BaseModel):
    action: str   # "ACCEPT_AI" or "MANUAL_OVERRIDE"
    notes: Optional[str] = None


# ─── Real-time conflict detection ──────────────────────────────────────────────

async def _detect_realtime_conflicts(db: AsyncSession) -> List[ConflictResponse]:
    """
    Scan RUNNING trains and return ephemeral ConflictResponse objects for any
    segment where 2+ trains are simultaneously active.

    Grouping key: train.section  (the operating segment each train belongs to).
    Since the Train model has no live position field, section is the finest-grain
    segment available from the DB without calling RapidAPI.

    These conflicts are NOT saved to the database.
    """
    try:
        result = await db.execute(
            select(Train).where(Train.status == TrainStatusEnum.RUNNING)
        )
        running_trains = result.scalars().all()
    except Exception as exc:
        logger.warning("Real-time conflict detection: DB query failed — %s", exc)
        return []

    if len(running_trains) < 2:
        return []

    # Group by section (operating segment)
    segment_map: dict[str, list] = defaultdict(list)
    for train in running_trains:
        segment_map[train.section].append(train)

    rt_conflicts: List[ConflictResponse] = []
    now = datetime.utcnow()

    for segment, trains_in_seg in segment_map.items():
        if len(trains_in_seg) < 2:
            continue

        # Generate one conflict per unique pair in the same segment
        for train_a, train_b in combinations(trains_in_seg, 2):
            # Skip pair if a DB conflict already exists for these two trains
            # (avoids duplicating a pre-seeded CROSSING as an RT conflict too)
            rt_id = f"RT-{train_a.id}-{train_b.id}"

            # Infer severity from priority: express-on-express = HIGH, else MEDIUM
            high_prio = {"EXPRESS"}
            both_express = (
                train_a.priority.value in high_prio and
                train_b.priority.value in high_prio
            )
            severity = "HIGH" if both_express else "MEDIUM"

            rt_conflicts.append(
                ConflictResponse(
                    id=rt_id,
                    train_a_id=train_a.id,
                    train_b_id=train_b.id,
                    location=segment,
                    severity=severity,
                    conflict_type="CROSSING",
                    time_to_conflict=None,
                    recommendation=f"Hold {train_b.id} at next loop until {train_a.id} clears {segment}",
                    confidence=72,
                    time_saving=5,
                    detected_at=now,
                    resolved=False,
                    resolved_at=None,
                    source="REALTIME",
                )
            )

    return rt_conflicts


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ConflictResponse])
async def get_active_conflicts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all unresolved conflicts ordered by severity then detection time.
    Merges DB (seeded/resolved) conflicts with ephemeral real-time detections.
    """
    severity_order = {
        SeverityEnum.CRITICAL: 0,
        SeverityEnum.HIGH:     1,
        SeverityEnum.MEDIUM:   2,
        SeverityEnum.LOW:      3,
    }

    # 1. Fetch existing DB conflicts
    result = await db.execute(
        select(Conflict)
        .where(Conflict.resolved == False)  # noqa: E712
        .order_by(Conflict.detected_at.desc())
    )
    db_conflicts = result.scalars().all()

    db_responses = sorted(
        [
            ConflictResponse(
                id=c.id,
                train_a_id=c.train_a_id,
                train_b_id=c.train_b_id,
                location=c.location,
                severity=c.severity.value,
                conflict_type=c.conflict_type.value,
                time_to_conflict=c.time_to_conflict,
                recommendation=c.recommendation,
                confidence=c.confidence,
                time_saving=c.time_saving,
                detected_at=c.detected_at,
                resolved=c.resolved,
                resolved_at=c.resolved_at,
                source="SEEDED",
            )
            for c in db_conflicts
        ],
        key=lambda c: severity_order.get(
            SeverityEnum(c.severity) if c.severity in SeverityEnum._value2member_map_ else SeverityEnum.LOW,
            99
        ),
    )

    # 2. Detect real-time conflicts from RUNNING trains
    rt_responses = await _detect_realtime_conflicts(db)

    # 3. Filter out RT pairs already covered by a DB conflict between the same trains
    existing_pairs = {
        frozenset([c.train_a_id, c.train_b_id]) for c in db_responses
    }
    rt_filtered = [
        rt for rt in rt_responses
        if frozenset([rt.train_a_id, rt.train_b_id]) not in existing_pairs
    ]

    # Real-time conflicts first (they're live), then seeded ones
    return rt_filtered + db_responses


@router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
async def resolve_conflict(
    conflict_id: str,
    body: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Resolve a conflict.
    - For realtime conflicts (id starts with "RT-"): acknowledge in-memory only,
      return a synthetic resolved response without touching the DB.
    - For DB conflicts: set resolved=True, insert Decision + AuditLog.
    """
    # ── Realtime conflict path ───────────────────────────────────────────────
    if conflict_id.startswith("RT-"):
        # Parse train IDs from the RT id: "RT-<train_a>-<train_b>"
        parts = conflict_id.split("-", 2)
        train_a_id = parts[1] if len(parts) > 1 else "UNKNOWN"
        train_b_id = parts[2] if len(parts) > 2 else "UNKNOWN"

        now = datetime.utcnow()
        # Log the acknowledgement (no DB write for the conflict itself)
        try:
            audit = AuditLog(
                user_id=current_user.id,
                action="ACKNOWLEDGE_RT_CONFLICT",
                entity=f"conflict:{conflict_id}",
                detail=f"Realtime conflict acknowledged by {current_user.name}",
            )
            db.add(audit)
            await db.commit()
        except Exception as exc:
            logger.warning("Could not write RT conflict audit log: %s", exc)

        return ConflictResponse(
            id=conflict_id,
            train_a_id=train_a_id,
            train_b_id=train_b_id,
            location="REALTIME",
            severity="HIGH",
            conflict_type="CROSSING",
            time_to_conflict=None,
            recommendation=None,
            confidence=None,
            time_saving=None,
            detected_at=now,
            resolved=True,
            resolved_at=now,
            source="REALTIME",
        )

    # ── DB conflict path ─────────────────────────────────────────────────────
    result = await db.execute(select(Conflict).where(Conflict.id == conflict_id))
    conflict = result.scalar_one_or_none()

    if conflict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Conflict {conflict_id} not found")

    if conflict.resolved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conflict is already resolved")

    valid_actions = {"ACCEPT_AI", "MANUAL_OVERRIDE"}
    action_upper = body.get("action", "ACCEPT_AI").upper() if body else "ACCEPT_AI"
    if action_upper not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action. Must be one of: {list(valid_actions)}",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Mark conflict as resolved
    conflict.resolved    = True
    conflict.resolved_at = now

    # Determine source
    source = DecisionSourceEnum.AI if action_upper == "ACCEPT_AI" else DecisionSourceEnum.MANUAL

    # Insert Decision
    notes_val = body.get("notes") if body else None
    decision = Decision(
        id=f"D-{uuid.uuid4().hex[:8].upper()}",
        conflict_id=conflict_id,
        action=action_upper,
        operator_id=current_user.id,
        source=source,
        notes=notes_val,
    )
    db.add(decision)

    # Insert AuditLog
    audit = AuditLog(
        user_id=current_user.id,
        action="RESOLVE_CONFLICT",
        entity=f"conflict:{conflict_id}",
        detail=f"Action={action_upper}, Source={source.value}, Notes={notes_val or 'N/A'}",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(conflict)

    return ConflictResponse(
        id=conflict.id,
        train_a_id=conflict.train_a_id,
        train_b_id=conflict.train_b_id,
        location=conflict.location,
        severity=conflict.severity.value,
        conflict_type=conflict.conflict_type.value,
        time_to_conflict=conflict.time_to_conflict,
        recommendation=conflict.recommendation,
        confidence=conflict.confidence,
        time_saving=conflict.time_saving,
        detected_at=conflict.detected_at,
        resolved=conflict.resolved,
        resolved_at=conflict.resolved_at,
        source="SEEDED",
    )
