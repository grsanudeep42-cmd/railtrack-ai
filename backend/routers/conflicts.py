"""
routers/conflicts.py — Real DB-backed conflict endpoints for RailTrack AI.
  GET  /api/conflicts/                     — list active (unresolved) conflicts
  POST /api/conflicts/{conflict_id}/resolve — resolve a conflict, store decision + audit
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Conflict, Decision, AuditLog, User, DecisionSourceEnum, SeverityEnum
from auth_utils import get_current_user

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

    class Config:
        from_attributes = True


class ResolveRequest(BaseModel):
    action: str   # "ACCEPT_AI" or "MANUAL_OVERRIDE"
    notes: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ConflictResponse])
async def get_active_conflicts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all unresolved conflicts ordered by severity then detection time."""
    # Map severity to sort order for consistent ordering
    severity_order = {
        SeverityEnum.CRITICAL: 0,
        SeverityEnum.HIGH:     1,
        SeverityEnum.MEDIUM:   2,
        SeverityEnum.LOW:      3,
    }

    result = await db.execute(
        select(Conflict)
        .where(Conflict.resolved == False)  # noqa: E712
        .order_by(Conflict.detected_at.desc())
    )
    conflicts = result.scalars().all()

    # Sort by severity priority
    conflicts = sorted(conflicts, key=lambda c: severity_order.get(c.severity, 99))

    return [
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
        )
        for c in conflicts
    ]


@router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
async def resolve_conflict(
    conflict_id: str,
    body: Optional[dict] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Resolve a conflict.
    - Sets conflicts.resolved = True
    - Inserts a Decision record (source=AI or MANUAL)
    - Inserts an AuditLog entry
    """
    # Fetch conflict
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
    )
