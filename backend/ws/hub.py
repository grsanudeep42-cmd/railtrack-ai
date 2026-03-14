"""
ws/hub.py — WebSocket telemetry hub for RailTrack AI.
Accepts optional JWT token as query param: ws://host/ws/telemetry?token=xxx
"""

import asyncio
import json
import random
from datetime import datetime
from typing import List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi import status as http_status

from auth_utils import verify_token

router = APIRouter()


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


def _make_telemetry_event():
    """Generate a realistic-looking live telemetry packet."""
    train_ids = ["12301", "12951", "12002", "11077", "58101", "58201", "12627", "12049"]
    train_id = random.choice(train_ids)
    return {
        "type": "TELEMETRY",
        "train_id": train_id,
        "timestamp": datetime.utcnow().isoformat(),
        "speed": round(random.uniform(45, 160), 1),
        "lat": round(25.0 + random.uniform(-1.0, 3.5), 6),
        "lon": round(76.0 + random.uniform(-0.5, 3.0), 6),
        "delay": random.randint(0, 30),
        "signal": random.choice(["GREEN", "GREEN", "GREEN", "YELLOW", "RED"]),
    }


@router.websocket("/ws/telemetry")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=None, description="JWT auth token"),
):
    """
    Live telemetry WebSocket.
    - If a token is provided, it is validated before accepting the connection.
    - After connection, sends a telemetry event every 3 seconds.
    - Also echoes any messages received from the client.
    """
    # Validate token if provided (not required so dashboard can connect unauthenticated in dev)
    if token:
        try:
            verify_token(token)
        except Exception:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
            return

    await manager.connect(websocket)

    async def send_periodic():
        """Background task: push telemetry every 3 seconds."""
        while True:
            await asyncio.sleep(3)
            event = _make_telemetry_event()
            await websocket.send_text(json.dumps(event))

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
