"""
main.py — FastAPI application entry point for RailTrack AI.
Loads env variables, creates DB tables on startup, registers all routers.
"""

from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
import logging

# Load .env before anything imports os.getenv()
load_dotenv(override=True)

# Safety check for production deployments
secret_key = os.getenv("SECRET_KEY", "")
if "change" in secret_key.lower():
    logging.warning("⚠️ CRITICAL SECURITY WARNING: SECRET_KEY contains the word 'change'. "
                    "Do NOT use default/weak keys in production. "
                    "Run `python -c \"import secrets; print(secrets.token_hex(32))\"` to generate a secure key.")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import create_all_tables
from routers import auth, trains, conflicts, simulate, analytics, admin, ai, disruptions
from routers.auth import limiter
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

# ─── Rate limiting ────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/auth",       tags=["Auth"])
app.include_router(trains.router,     prefix="/api/trains",     tags=["Trains"])
app.include_router(conflicts.router,  prefix="/api/conflicts",  tags=["Conflicts"])
app.include_router(simulate.router,   prefix="/api/simulate",   tags=["Simulator"])
app.include_router(analytics.router,  prefix="/api/analytics",   tags=["Analytics"])
app.include_router(admin.router,      prefix="/api/admin",       tags=["Admin"])
app.include_router(ai.router,         prefix="/api/ai",          tags=["AI"])
app.include_router(disruptions.router,prefix="/api/disruptions", tags=["Disruptions"])
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
