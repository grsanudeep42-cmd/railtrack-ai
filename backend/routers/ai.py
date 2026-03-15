"""
routers/ai.py — AI Chat endpoint for RailTrack AI.
Accepts a user message and current section context, fetches live DB data,
then calls Anthropic Claude to generate a real, grounded response.
"""

import os
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from groq import Groq

from database import get_db
from models import Train, Conflict
from auth_utils import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

SYSTEM_PROMPT = (
    "You are RailTrack AI, a railway traffic decision support assistant for "
    "Indian Railways section controllers. You have access to real-time operational data "
    "for the controller's assigned section. "
    "Answer only about train operations, conflicts, delays, scheduling, and safety. "
    "Be concise (2-4 sentences), specific, and actionable. "
    "Use the provided real-time context — trains and conflicts — to ground your answers. "
    "Do not make up train numbers or data not present in the context. "
    "If no relevant data is available, say so clearly."
)


class ChatRequest(BaseModel):
    message: str

    class Config:
        extra = "allow"


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Real AI chat using Groq Llama 3.
    Fetches live trains and conflicts for the user's section,
    injects them as context, and returns a grounded reply.
    """

    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY not configured on the server.",
        )

    # ── Fetch live context from DB ────────────────────────────────────────────
    section = getattr(current_user, "section", None) or "NR-42"

    trains_result = await db.execute(
        select(Train).where(Train.section == section).limit(20)
    )
    trains = trains_result.scalars().all()

    conflicts_result = await db.execute(
        select(Conflict).where(Conflict.resolved == False).limit(10)  # noqa: E712
    )
    conflicts = conflicts_result.scalars().all()

    # ── Build context string ─────────────────────────────────────────────────
    trains_ctx = "\n".join(
        f"- Train {t.id} ({t.name}): priority={t.priority}, status={t.status}, "
        f"delay={t.delay}min, speed={t.speed}km/h, {t.origin}→{t.destination}"
        for t in trains
    ) or "No trains currently in DB for this section."

    conflicts_ctx = "\n".join(
        f"- Conflict {c.id}: {c.train_a_id} vs {c.train_b_id} at {c.location}, "
        f"severity={c.severity}, type={c.conflict_type}, status={'OPEN' if not c.resolved else 'RESOLVED'}"
        for c in conflicts
    ) or "No open conflicts right now."

    context_block = (
        f"SECTION: {section}\n\n"
        f"CURRENT TRAINS ({len(trains)}):\n{trains_ctx}\n\n"
        f"OPEN CONFLICTS ({len(conflicts)}):\n{conflicts_ctx}"
    )

    # ── Call Groq Llama 3 ─────────────────────────────────────────────────────
    try:
        client = Groq(api_key=GROQ_API_KEY)
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"{context_block}\n\nController question: {body.message}"}
            ],
            max_tokens=500
        )
        reply = completion.choices[0].message.content if completion.choices else "No response from AI."
    except Exception as e:
        logger.error("Groq API error: %s", e)
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    return ChatResponse(reply=reply)
