"""
database.py â€” SQLAlchemy async engine + session factory for RailTrack AI.
Reads DATABASE_URL from environment (loaded via python-dotenv in main.py).
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

# Load .env from the backend directory
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/railtrack")

# Create the async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,          # Set True to log SQL statements during development
    pool_pre_ping=True,  # Verify connection health before using from pool
    pool_size=10,
    max_overflow=20,
)

# Session factory â€” used by get_db() dependency
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

# Declarative base â€” imported by models.py
Base = declarative_base()


async def get_db():
    """
    FastAPI dependency: yields an async database session and ensures it is
    closed after the request, even if an exception occurs.

    Usage:
        db: AsyncSession = Depends(get_db)
    """
    async with AsyncSessionLocal() as session:
        yield session


async def create_all_tables():
    """
    Called once at application startup to create all tables defined in models.py.
    In production, prefer Alembic migrations over this function.
    """
    # Import here to avoid circular imports â€” models must register with Base first
    from models import Base as ModelsBase  # noqa: F401 (side-effect: registers models)
    async with engine.begin() as conn:
        await conn.run_sync(ModelsBase.metadata.create_all)
    print("[DB] All tables are ready âœ“")

