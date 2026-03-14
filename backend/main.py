"""
main.py — FastAPI application entry point for RailTrack AI.
Loads env variables, creates DB tables on startup, registers all routers.
"""

from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load .env before anything imports os.getenv()
load_dotenv(override=True)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from database import create_all_tables
from routers import auth, trains, conflicts, simulate, analytics
from ws.hub import router as websocket_router
from auth_utils import verify_token


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup (idempotent — does not drop/recreate)."""
    await create_all_tables()
    yield
    # Shutdown: nothing to teardown (connection pool closes automatically)


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="RailTrack AI API",
    description="Intelligent Decision Support System for Section Controllers",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/auth",       tags=["Auth"])
app.include_router(trains.router,     prefix="/api/trains",     tags=["Trains"])
app.include_router(conflicts.router,  prefix="/api/conflicts",  tags=["Conflicts"])
app.include_router(simulate.router,   prefix="/api/simulate",   tags=["Simulator"])
app.include_router(analytics.router,  prefix="/api/analytics",  tags=["Analytics"])

# WebSocket hub (handles /ws/telemetry)
app.include_router(websocket_router)


# ─── Health check (public) ────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "UP",
        "version": "2.0.0",
        "services": {
            "postgres": "UP",
            "auth":     "JWT/bcrypt",
        },
    }
