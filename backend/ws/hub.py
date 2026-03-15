"""
ws/hub.py — WebSocket telemetry hub for RailTrack AI.
Accepts optional JWT token as query param: ws://host/ws/telemetry?token=xxx

Broadcast strategy:
  - Every 30 s, query DB for trains with status RUNNING.
  - For each, call the IRCTC RapidAPI live-status endpoint.
  - Results are cached in-memory per train for 60 s to avoid hammering the API.
  - If RAPIDAPI_KEY env var is missing, falls back to mock random data so local
    dev still works without credentials.
  - Individual RapidAPI failures are swallowed; we use the last cached result.
  - If RAPID API returns no running trains, we broadcast an empty-array event.
"""

import asyncio
import json
import logging
import os
import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import verify_token
from database import AsyncSessionLocal
from models import Train, TrainStatusEnum

logger = logging.getLogger(__name__)

router = APIRouter()

# ── In-memory RapidAPI result cache ──────────────────────────────────────────
# key   = train_id (str)
# value = (fetched_at: float unix timestamp, payload: dict)
_live_cache: Dict[str, Tuple[float, dict]] = {}

# Per-train exponential backoff TTL (seconds). Doubled on each 429; reset on success.
_backoff_ttl: Dict[str, int] = {}
_BACKOFF_MAX = 1800  # 30 minutes maximum backoff per train

CACHE_TTL_SECONDS = 300           # base interval between RapidAPI calls per train
BROADCAST_INTERVAL_SECONDS = 300  # how often the loop fires (5 min)
MAX_API_CALLS_PER_CYCLE = 3       # max RapidAPI calls in one broadcast pass
MIN_GAP_BETWEEN_CALLS = 10        # seconds — global guard between any two API calls
MAX_CONSECUTIVE_429S = 5          # circuit breaker: skip cycle if this many 429s in a row

RAPIDAPI_KEY  = os.getenv("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "indian-railway-irctc.p.rapidapi.com")

# Global timestamp of the last RapidAPI call made (any train)
_global_last_api_call: float = 0.0


# ── Connection manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()


# ── RapidAPI live fetch (mirrors logic in routers/trains.py) ─────────────────

async def _fetch_rapidapi_live(train_number: str) -> Optional[dict]:
    """
    Call the IRCTC RapidAPI live-status endpoint for one train.
    Returns a normalised dict or None on any failure.
    """
    url = (
        f"https://{RAPIDAPI_HOST}/api/trains/v1/train/status"
        f"?departure_date=TODAY&isH5=true&client=web&train_number={train_number}"
    )
    headers = {
        "x-rapidapi-key":  RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=8.0)

        if resp.status_code == 429:
            logger.warning("RapidAPI 429 rate-limited for train %s", train_number)
            return {"__rate_limited__": True}   # sentinel — caller handles backoff
        if resp.status_code == 400:
            # Train not running today — not an error, just no data
            return None
        if resp.status_code != 200:
            logger.warning("RapidAPI %s for train %s", resp.status_code, train_number)
            return None

        data = resp.json()
        body = data.get("body", {})
        if not body or data.get("status") is False:
            return None

        stations      = body.get("stations", [])
        current_code  = body.get("current_station", "")
        delay_minutes = int(body.get("delay", 0))

        # Try to get delay from current station entry
        for st in stations:
            if st.get("station_code") == current_code:
                direct = st.get("delay")
                if isinstance(direct, int):
                    delay_minutes = direct
                break

        return {
            "current_station": current_code,
            "delay_minutes":   delay_minutes,
            "terminated":      body.get("terminated", False),
            "last_updated":    str(body.get("server_timestamp", datetime.utcnow().isoformat())),
        }

    except Exception as exc:
        logger.warning("RapidAPI fetch failed for train %s: %s", train_number, exc)
        return None


# ── Mock fallback (no API key) ────────────────────────────────────────────────

def _mock_telemetry(train_id: str) -> dict:
    """Return a plausible-looking fake telemetry packet for local dev."""
    return {
        "type":      "TELEMETRY",
        "train_id":  train_id,
        "timestamp": datetime.utcnow().isoformat(),
        "speed":     round(random.uniform(45, 160), 1),
        "lat":       round(25.0 + random.uniform(-1.0, 3.5), 6),
        "lon":       round(76.0 + random.uniform(-0.5, 3.0), 6),
        "delay":     random.randint(0, 30),
        "signal":    random.choice(["GREEN", "GREEN", "GREEN", "YELLOW", "RED"]),
    }


# ── Core broadcast loop ───────────────────────────────────────────────────────

async def _broadcast_live_telemetry():
    """
    Fetch live positions for all RUNNING trains and broadcast to all clients.

    Called every BROADCAST_INTERVAL_SECONDS from send_periodic().
    """
    now = datetime.utcnow().timestamp()

    # 1. Get all RUNNING trains from DB
    running_trains: List[str] = []
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Train.id).where(
                    Train.status == TrainStatusEnum.RUNNING
                )
            )
            running_trains = [row[0] for row in result.all()]
    except Exception as exc:
        logger.warning("DB query for running trains failed: %s", exc)
        return  # Don't broadcast if we can't reach DB

    if not running_trains:
        # Broadcast empty marker so frontend knows we're alive but nothing running
        await manager.broadcast(json.dumps({
            "type":      "TELEMETRY_BATCH",
            "timestamp": datetime.utcnow().isoformat(),
            "trains":    [],
        }))
        return

    # 2. If no API key, fall back to mock for all running trains
    if not RAPIDAPI_KEY:
        for train_id in running_trains:
            event = _mock_telemetry(train_id)
            await manager.broadcast(json.dumps(event))
        return

    # 3. Real path: fetch from RapidAPI (respecting per-train cache TTL)
    global _global_last_api_call
    api_calls_this_cycle = 0
    consecutive_429s = 0

    for train_id in running_trains:
        digits_only = "".join(c for c in train_id if c.isdigit())
        lookup_id   = digits_only if digits_only else train_id

        # Circuit breaker: if too many 429s this cycle, serve stale/skip rest
        if consecutive_429s >= MAX_CONSECUTIVE_429S:
            logger.warning("Circuit breaker tripped: %d consecutive 429s — serving cache only", consecutive_429s)
            cached_at, cached_payload = _live_cache.get(train_id, (0.0, {}))
            if cached_payload:
                live = cached_payload
            else:
                continue
        else:
            # Determine effective TTL for this train (may be backed off)
            effective_ttl = _backoff_ttl.get(train_id, CACHE_TTL_SECONDS)
            cached_at, cached_payload = _live_cache.get(train_id, (0.0, {}))
            cache_fresh = (now - cached_at) < effective_ttl and cached_payload

            if cache_fresh:
                live = cached_payload
            elif (
                api_calls_this_cycle >= MAX_API_CALLS_PER_CYCLE
                or (now - _global_last_api_call) < MIN_GAP_BETWEEN_CALLS
            ):
                if cached_payload:
                    live = cached_payload
                else:
                    continue
            else:
                # Fetch fresh from RapidAPI
                _global_last_api_call = now
                api_calls_this_cycle += 1
                fetched = await _fetch_rapidapi_live(lookup_id)

                if fetched and fetched.get("__rate_limited__"):
                    # 429 — double this train's backoff TTL, up to the max
                    current_ttl = _backoff_ttl.get(train_id, CACHE_TTL_SECONDS)
                    _backoff_ttl[train_id] = min(current_ttl * 2, _BACKOFF_MAX)
                    consecutive_429s += 1
                    logger.info("Train %s backoff TTL now %ds", train_id, _backoff_ttl[train_id])
                    if cached_payload:
                        live = cached_payload
                    else:
                        continue
                elif fetched:
                    # Success — reset backoff for this train
                    _backoff_ttl.pop(train_id, None)
                    consecutive_429s = 0
                    _live_cache[train_id] = (now, fetched)
                    live = fetched
                elif cached_payload:
                    live = cached_payload
                else:
                    continue

        # 4. Build the telemetry event matching the field names the frontend reads:
        #    telemetry.type, telemetry.train_id, telemetry.delay, telemetry.timestamp
        event = {
            "type":            "TELEMETRY",
            "train_id":        train_id,
            "timestamp":       live.get("last_updated", datetime.utcnow().isoformat()),
            "delay":           live.get("delay_minutes", 0),
            "current_station": live.get("current_station", ""),
            "terminated":      live.get("terminated", False),
            # speed / lat / lon not available from this endpoint;
            # keep last known values or omit (frontend doesn't require them for display)
            "speed":           None,
            "lat":             None,
            "lon":             None,
        }
        await manager.broadcast(json.dumps(event))


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/telemetry")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=None, description="JWT auth token"),
):
    """
    Live telemetry WebSocket.
    - If a token is provided, it is validated before accepting the connection.
    - Every BROADCAST_INTERVAL_SECONDS, fetches real IRCTC live positions and
      broadcasts them. Falls back to mock if RAPIDAPI_KEY is not set.
    - Also echoes any messages received from the client.
    """
    # Validate token if provided (optional so dashboard can connect in dev)
    if token:
        try:
            verify_token(token)
        except Exception:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
            return

    # Evict any existing connection from the same client host to prevent duplicates
    client_host = websocket.client.host if websocket.client else None
    if client_host:
        stale = [
            conn for conn in list(manager.active_connections)
            if conn.client and conn.client.host == client_host
        ]
        for old_conn in stale:
            try:
                await old_conn.close(code=1000)
            except Exception:
                pass
            manager.disconnect(old_conn)

    await manager.connect(websocket)

    async def send_periodic():
        """Background task: broadcast real telemetry every BROADCAST_INTERVAL_SECONDS."""
        # Brief stabilisation delay before the first broadcast
        await asyncio.sleep(2)
        while True:
            try:
                await _broadcast_live_telemetry()
            except Exception as exc:
                # Never crash the loop — log and continue
                logger.error("Telemetry broadcast error: %s", exc)
            await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)

    task = asyncio.create_task(send_periodic())

    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f'{{"type":"ECHO","data":{data}}}')
    except WebSocketDisconnect:
        task.cancel()
        manager.disconnect(websocket)
    except Exception:
        task.cancel()
        manager.disconnect(websocket)
