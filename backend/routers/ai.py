"""
routers/ai.py — AI Chat endpoint for RailTrack AI.
Accepts a user message, fetches rich live context from DB
(running trains, active conflicts + real-time detections, recent decisions),
builds a grounded system prompt, then calls Groq Llama 3 for a response.
"""

import os
import logging
from collections import defaultdict
from datetime import datetime
from itertools import combinations
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from groq import Groq

from database import get_db
from models import Train, Conflict, Decision, TrainStatusEnum
from auth_utils import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

CONTEXT_MAX_CONFLICTS = 10   # summarise beyond this
CONTEXT_MAX_TRAINS    = 20   # summarise beyond this


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str

    class Config:
        extra = "allow"


class ChatResponse(BaseModel):
    reply: str


# ─── Context helpers ───────────────────────────────────────────────────────────

def _format_trains(trains: list) -> str:
    """Compact one-liner per train, truncated at CONTEXT_MAX_TRAINS."""
    shown = trains[:CONTEXT_MAX_TRAINS]
    lines = [
        f"  • {t.id} ({t.name}) | {t.priority.value} | {t.status.value} | "
        f"delay={t.delay}min | speed={int(t.speed)}km/h | {t.origin}→{t.destination}"
        for t in shown
    ]
    if len(trains) > CONTEXT_MAX_TRAINS:
        lines.append(f"  … and {len(trains) - CONTEXT_MAX_TRAINS} more trains (total={len(trains)})")
    return "\n".join(lines) if lines else "  None."


def _format_conflicts(conflicts: list) -> str:
    """Compact one-liner per conflict, truncated at CONTEXT_MAX_CONFLICTS."""
    shown = conflicts[:CONTEXT_MAX_CONFLICTS]
    lines = []
    for c in shown:
        # Support both ORM objects (Conflict) and plain dicts (realtime)
        if isinstance(c, dict):
            lines.append(
                f"  • [{c.get('id')}] {c.get('train_a_id')} vs {c.get('train_b_id')} "
                f"@ {c.get('location')} | severity={c.get('severity')} | "
                f"type={c.get('conflict_type')} | source={c.get('source','REALTIME')}"
            )
        else:
            lines.append(
                f"  • [{c.id}] {c.train_a_id} vs {c.train_b_id} "
                f"@ {c.location} | severity={c.severity.value} | "
                f"type={c.conflict_type.value} | source=SEEDED"
            )
    if len(conflicts) > CONTEXT_MAX_CONFLICTS:
        lines.append(f"  … and {len(conflicts) - CONTEXT_MAX_CONFLICTS} more (total={len(conflicts)})")
    return "\n".join(lines) if lines else "  None."


def _format_decisions(decisions: list) -> str:
    """Recent decisions summary."""
    lines = [
        f"  • [{d.id}] conflict={d.conflict_id} | action={d.action} | "
        f"source={d.source.value} | {d.timestamp.strftime('%H:%M') if d.timestamp else '?'}"
        for d in decisions
    ]
    return "\n".join(lines) if lines else "  None."


async def _detect_realtime_conflicts(running_trains: list) -> list:
    """
    Same logic as conflicts.py: group RUNNING trains by section,
    emit ephemeral dict-conflicts for same-section pairs.
    Returns list of dicts (not ORM objects).
    """
    if len(running_trains) < 2:
        return []

    segment_map: dict = defaultdict(list)
    for t in running_trains:
        segment_map[t.section].append(t)

    rt_conflicts = []
    now = datetime.utcnow().isoformat()
    for segment, trains_in_seg in segment_map.items():
        if len(trains_in_seg) < 2:
            continue
        for train_a, train_b in combinations(trains_in_seg, 2):
            both_express = (
                train_a.priority.value == "EXPRESS" and
                train_b.priority.value == "EXPRESS"
            )
            rt_conflicts.append({
                "id":            f"RT-{train_a.id}-{train_b.id}",
                "train_a_id":    train_a.id,
                "train_b_id":    train_b.id,
                "location":      segment,
                "severity":      "HIGH" if both_express else "MEDIUM",
                "conflict_type": "CROSSING",
                "detected_at":   now,
                "status":        "ACTIVE",
                "source":        "REALTIME",
            })
    return rt_conflicts


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    AI chat with live DB context injected into the system prompt.
    Context: running trains, active DB conflicts, real-time conflict detection,
    and the 5 most recent decisions.
    """
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY not configured on the server.",
        )

    section = getattr(current_user, "section", None) or "NR-42"
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # ── Fetch live context (all failures are non-fatal) ───────────────────────

    running_trains: list = []
    all_trains: list = []
    db_conflicts: list = []
    rt_conflicts: list = []
    recent_decisions: list = []

    try:
        # All trains in section (for general "what trains are there" questions)
        result = await db.execute(
            select(Train).where(Train.section == section).limit(CONTEXT_MAX_TRAINS + 5)
        )
        all_trains = result.scalars().all()

        # Subset: RUNNING trains (for RT conflict detection)
        running_trains = [t for t in all_trains if t.status == TrainStatusEnum.RUNNING]
    except Exception as exc:
        logger.warning("AI context: train fetch failed — %s", exc)

    try:
        result = await db.execute(
            select(Conflict)
            .where(Conflict.resolved == False)  # noqa: E712
            .limit(CONTEXT_MAX_CONFLICTS + 5)
        )
        db_conflicts = result.scalars().all()
    except Exception as exc:
        logger.warning("AI context: conflict fetch failed — %s", exc)

    try:
        rt_conflicts = await _detect_realtime_conflicts(running_trains)
    except Exception as exc:
        logger.warning("AI context: realtime conflict detection failed — %s", exc)

    try:
        result = await db.execute(
            select(Decision).order_by(desc(Decision.timestamp)).limit(5)
        )
        recent_decisions = result.scalars().all()
    except Exception as exc:
        logger.warning("AI context: decision fetch failed — %s", exc)

    # Deduplicate: drop RT conflicts already covered by a DB conflict
    existing_pairs = {frozenset([c.train_a_id, c.train_b_id]) for c in db_conflicts}
    rt_filtered = [
        rt for rt in rt_conflicts
        if frozenset([rt["train_a_id"], rt["train_b_id"]]) not in existing_pairs
    ]

    all_conflicts = rt_filtered + list(db_conflicts)
    running_count = len(running_trains)
    conflict_count = len(all_conflicts)

    # ── Build system prompt with live context ─────────────────────────────────
    system_prompt = f"""You are RailTrack AI, an intelligent assistant for Indian Railways section controllers.
You have access to real-time operational data for section {section}.

LIVE DATA SNAPSHOT (as of {now_str}):

ACTIVE CONFLICTS ({conflict_count} total):
{_format_conflicts(all_conflicts)}

RUNNING TRAINS ({running_count} of {len(all_trains)} total in section):
{_format_trains(running_trains) if running_trains else _format_trains(all_trains)}

ALL SECTION TRAINS ({len(all_trains)} total):
{_format_trains(all_trains)}

RECENT DECISIONS (last 5):
{_format_decisions(recent_decisions)}

INSTRUCTIONS:
- Answer only about train operations, conflicts, delays, scheduling, and safety.
- Be concise (2-4 sentences), specific, and actionable.
- Always reference actual conflict IDs (e.g. RT-12301-12951) and train numbers from the live data above.
- NEVER say there are no conflicts if the live data shows {conflict_count} conflict(s).
- NEVER invent train numbers or data not present above.
- If the user asks what conflicts exist, list them by ID, trains involved, and location.
- If asked for a recommendation, reference the specific trains and suggest HOLD/PROCEED/REROUTE.
"""

    # ── Call Groq Llama 3 ─────────────────────────────────────────────────────
    try:
        client = Groq(api_key=GROQ_API_KEY)
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system",  "content": system_prompt},
                {"role": "user",    "content": body.message},
            ],
            max_tokens=500,
        )
        reply = (
            completion.choices[0].message.content
            if completion.choices
            else "No response from AI."
        )
    except Exception as exc:
        logger.error("Groq API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI service error: {str(exc)}")

    return ChatResponse(reply=reply)
