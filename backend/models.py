"""
models.py — SQLAlchemy ORM models for RailTrack AI.
All models use the shared Base from database.py so async engine can manage them.
"""

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey,
    Boolean, Text, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import enum


# ─── Enumerations ──────────────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    CONTROLLER = "CONTROLLER"
    SUPERVISOR = "SUPERVISOR"
    LOGISTICS   = "LOGISTICS"
    ADMIN       = "ADMIN"


class PriorityEnum(str, enum.Enum):
    EXPRESS     = "EXPRESS"
    FREIGHT     = "FREIGHT"
    LOCAL       = "LOCAL"
    MAINTENANCE = "MAINTENANCE"


class TrainStatusEnum(str, enum.Enum):
    ON_TIME   = "ON_TIME"
    DELAYED   = "DELAYED"
    RUNNING   = "RUNNING"
    HALTED    = "HALTED"
    CONFLICT  = "CONFLICT"
    SCHEDULED = "SCHEDULED"
    CANCELLED = "CANCELLED"


class SeverityEnum(str, enum.Enum):
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"
    CRITICAL = "CRITICAL"


class ConflictTypeEnum(str, enum.Enum):
    CROSSING  = "CROSSING"
    PLATFORM  = "PLATFORM"
    HEADWAY   = "HEADWAY"
    LOOP      = "LOOP"


class DecisionSourceEnum(str, enum.Enum):
    AI     = "AI"
    MANUAL = "MANUAL"


# ─── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True, index=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)   # nullable for OAuth users
    name            = Column(String, nullable=False)
    role            = Column(SQLEnum(RoleEnum), nullable=False)
    section         = Column(String, nullable=False, default="NR-42")
    is_active       = Column(Boolean, default=True)
    google_id       = Column(String, nullable=True, unique=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    decisions = relationship("Decision", back_populates="operator")


class Train(Base):
    __tablename__ = "trains"

    id          = Column(String, primary_key=True, index=True)  # e.g. "12301"
    name        = Column(String, nullable=False)
    priority    = Column(SQLEnum(PriorityEnum), nullable=False)
    origin      = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    section     = Column(String, nullable=False, default="NR-42")
    status      = Column(SQLEnum(TrainStatusEnum), nullable=False, default=TrainStatusEnum.SCHEDULED)
    delay       = Column(Integer, default=0)          # minutes late
    speed       = Column(Float,   default=0.0)        # km/h current speed
    platform    = Column(Integer, nullable=True)      # current/last platform
    created_at  = Column(DateTime, default=datetime.utcnow)

    schedules = relationship("Schedule", back_populates="train", cascade="all, delete-orphan")
    conflicts_as_a = relationship("Conflict", foreign_keys="Conflict.train_a_id",  back_populates="train_a")
    conflicts_as_b = relationship("Conflict", foreign_keys="Conflict.train_b_id",  back_populates="train_b")


class Schedule(Base):
    __tablename__ = "schedules"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    train_id       = Column(String, ForeignKey("trains.id", ondelete="CASCADE"), nullable=False)
    station        = Column(String, nullable=False)
    station_code   = Column(String, nullable=False)
    sequence       = Column(Integer, nullable=False)   # stop order
    arrival_time   = Column(DateTime, nullable=True)
    departure_time = Column(DateTime, nullable=True)
    platform       = Column(Integer, nullable=True)
    distance_km    = Column(Float,   nullable=True)    # cumulative distance from origin

    train = relationship("Train", back_populates="schedules")


class Conflict(Base):
    __tablename__ = "conflicts"

    id              = Column(String, primary_key=True, index=True)
    train_a_id      = Column(String, ForeignKey("trains.id"), nullable=False)
    train_b_id      = Column(String, ForeignKey("trains.id"), nullable=False)
    location        = Column(String, nullable=False)
    severity        = Column(SQLEnum(SeverityEnum), nullable=False, default=SeverityEnum.MEDIUM)
    conflict_type   = Column(SQLEnum(ConflictTypeEnum), nullable=False, default=ConflictTypeEnum.CROSSING)
    time_to_conflict = Column(Integer, nullable=True)   # seconds until conflict
    recommendation  = Column(Text, nullable=True)
    confidence      = Column(Integer, default=85)       # AI confidence %
    time_saving     = Column(Integer, default=0)        # minutes saved if AI rec followed
    detected_at     = Column(DateTime, default=datetime.utcnow)
    resolved        = Column(Boolean, default=False)
    resolved_at     = Column(DateTime, nullable=True)

    train_a   = relationship("Train", foreign_keys=[train_a_id], back_populates="conflicts_as_a")
    train_b   = relationship("Train", foreign_keys=[train_b_id], back_populates="conflicts_as_b")
    decisions = relationship("Decision", back_populates="conflict")


class Decision(Base):
    __tablename__ = "decisions"

    id          = Column(String, primary_key=True, index=True)
    conflict_id = Column(String, ForeignKey("conflicts.id"), nullable=True)
    action      = Column(String, nullable=False)   # e.g. "ACCEPT_AI" / "MANUAL_OVERRIDE"
    operator_id = Column(String, ForeignKey("users.id"), nullable=True)
    source      = Column(SQLEnum(DecisionSourceEnum), default=DecisionSourceEnum.AI)
    notes       = Column(Text, nullable=True)
    timestamp   = Column(DateTime, default=datetime.utcnow)

    conflict = relationship("Conflict", back_populates="decisions")
    operator = relationship("User",     back_populates="decisions")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(String, nullable=True)
    action    = Column(String, nullable=False)
    entity    = Column(String, nullable=True)    # e.g. "train:12301"
    detail    = Column(Text,   nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    event_type        = Column(String,  nullable=False)
    location          = Column(String,  nullable=False)
    duration_min      = Column(Integer, nullable=False)
    objective         = Column(String,  nullable=False)
    baseline_delay    = Column(Integer, nullable=True)
    optimized_delay   = Column(Integer, nullable=True)
    delay_delta       = Column(Integer, nullable=True)
    conflicts_avoided = Column(Integer, nullable=True)
    result_json       = Column(Text,    nullable=True)   # full JSON blob
    run_by            = Column(String,  nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
