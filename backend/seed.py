"""
seed.py — Populate the RailTrack AI database with realistic Indian Railways data.
Run: python seed.py  (PostgreSQL must be running and railtrack DB must exist)
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal, create_all_tables
from models import (
    User, Train, Schedule, Conflict, RoleEnum, PriorityEnum,
    TrainStatusEnum, SeverityEnum, ConflictTypeEnum
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# ─── Base datetime for today at midnight (UTC) ────────────────────────────────
BASE_DATE = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


def t(hour: int, minute: int = 0) -> datetime:
    """Return a datetime on today's date at given hour:minute (UTC)."""
    return BASE_DATE + timedelta(hours=hour, minutes=minute)


# ─── USERS ─────────────────────────────────────────────────────────────────────
USERS = [
    {
        "id": "U-001",
        "email": "controller@demo.rail",
        "hashed_password": hash_password("demo1234"),
        "name": "Rajesh Sharma",
        "role": RoleEnum.CONTROLLER,
        "section": "NR-42",
    },
    {
        "id": "U-002",
        "email": "supervisor@demo.rail",
        "hashed_password": hash_password("demo1234"),
        "name": "Priya Mehta",
        "role": RoleEnum.SUPERVISOR,
        "section": "All Zones",
    },
    {
        "id": "U-003",
        "email": "logistics@demo.rail",
        "hashed_password": hash_password("demo1234"),
        "name": "Arun Kumar",
        "role": RoleEnum.LOGISTICS,
        "section": "WR-15",
    },
    {
        "id": "U-004",
        "email": "admin@demo.rail",
        "hashed_password": hash_password("demo1234"),
        "name": "Vikram Singh",
        "role": RoleEnum.ADMIN,
        "section": "HQ",
    },
    {
        "id": "U-005",
        "email": "rajesh.sharma@railways.gov.in",
        "hashed_password": hash_password("demo1234"),
        "name": "Rajesh Sharma (Gov)",
        "role": RoleEnum.CONTROLLER,
        "section": "NR-42",
    },
]

# ─── TRAINS ────────────────────────────────────────────────────────────────────
# 15 trains based on real Indian Railways trains
TRAINS = [
    {"id": "12301", "name": "Howrah Rajdhani Express",         "priority": PriorityEnum.EXPRESS,  "origin": "NDLS", "destination": "HWH",  "status": TrainStatusEnum.RUNNING,   "delay": 0,  "speed": 118.0, "platform": 2, "section": "NR-42"},
    {"id": "12951", "name": "Mumbai Rajdhani Express",          "priority": PriorityEnum.EXPRESS,  "origin": "NDLS", "destination": "MMCT", "status": TrainStatusEnum.DELAYED,   "delay": 14, "speed": 98.0,  "platform": 1, "section": "NR-42"},
    {"id": "12002", "name": "Bhopal Shatabdi Express",          "priority": PriorityEnum.EXPRESS,  "origin": "NDLS", "destination": "BPL",  "status": TrainStatusEnum.ON_TIME,   "delay": 0,  "speed": 110.0, "platform": 3, "section": "NR-42"},
    {"id": "11077", "name": "Jhelum Express",                   "priority": PriorityEnum.LOCAL,    "origin": "NDLS", "destination": "JAT",  "status": TrainStatusEnum.ON_TIME,   "delay": 0,  "speed": 72.0,  "platform": 4, "section": "NR-42"},
    {"id": "14311", "name": "Ala Hazrat Express",               "priority": PriorityEnum.LOCAL,    "origin": "BE",   "destination": "BME",  "status": TrainStatusEnum.DELAYED,   "delay": 22, "speed": 55.0,  "platform": None, "section": "NR-42"},
    {"id": "63107", "name": "NDLS-GZB EMU Local",              "priority": PriorityEnum.LOCAL,    "origin": "NDLS", "destination": "GZB",  "status": TrainStatusEnum.RUNNING,   "delay": 4,  "speed": 60.0,  "platform": 5, "section": "NR-42"},
    {"id": "58101", "name": "Steel Freight — TATA to NDLS",    "priority": PriorityEnum.FREIGHT,  "origin": "TATA", "destination": "NDLS", "status": TrainStatusEnum.RUNNING,   "delay": 0,  "speed": 52.0,  "platform": None, "section": "NR-42"},
    {"id": "58201", "name": "Cement Freight — KTE to NDLS",    "priority": PriorityEnum.FREIGHT,  "origin": "KTE",  "destination": "NDLS", "status": TrainStatusEnum.CONFLICT,  "delay": 8,  "speed": 48.0,  "platform": None, "section": "NR-42"},
    {"id": "12627", "name": "Karnataka Express",                "priority": PriorityEnum.EXPRESS,  "origin": "SBC",  "destination": "NDLS", "status": TrainStatusEnum.ON_TIME,   "delay": 0,  "speed": 105.0, "platform": 2, "section": "NR-42"},
    {"id": "12431", "name": "Trivandrum Rajdhani Express",      "priority": PriorityEnum.EXPRESS,  "origin": "NDLS", "destination": "TVC",  "status": TrainStatusEnum.SCHEDULED, "delay": 0,  "speed": 0.0,   "platform": 6, "section": "NR-42"},
    {"id": "12910", "name": "Garib Rath Express",               "priority": PriorityEnum.EXPRESS,  "origin": "BVI",  "destination": "BDTS", "status": TrainStatusEnum.RUNNING,   "delay": 6,  "speed": 88.0,  "platform": 3, "section": "NR-42"},
    {"id": "22691", "name": "Rajdhani Express (Bengaluru)",     "priority": PriorityEnum.EXPRESS,  "origin": "SBC",  "destination": "NDLS", "status": TrainStatusEnum.ON_TIME,   "delay": 0,  "speed": 115.0, "platform": 1, "section": "NR-42"},
    {"id": "58301", "name": "Ore Freight — Rourkela to Bokaro","priority": PriorityEnum.FREIGHT,  "origin": "ROU",  "destination": "BKSC", "status": TrainStatusEnum.HALTED,    "delay": 35, "speed": 0.0,   "platform": None, "section": "NR-42"},
    {"id": "12049", "name": "Gatimaan Express",                 "priority": PriorityEnum.EXPRESS,  "origin": "NDLS", "destination": "AGC",  "status": TrainStatusEnum.ON_TIME,   "delay": 0,  "speed": 160.0, "platform": 2, "section": "NR-42"},
    {"id": "04061", "name": "Track Inspection Special",         "priority": PriorityEnum.MAINTENANCE,"origin": "GWL","destination": "AGC",  "status": TrainStatusEnum.SCHEDULED, "delay": 0,  "speed": 40.0,  "platform": None, "section": "NR-42"},
]

# ─── SCHEDULES ─────────────────────────────────────────────────────────────────
# NR-42 corridor: NDLS → MTJ → AGC → DHO → GWL → JHS → BPL
# Station: (name, code, km from NDLS)
NR42_STATIONS = [
    ("New Delhi",            "NDLS", 0),
    ("Mathura Junction",     "MTJ",  141),
    ("Agra Cantt",           "AGC",  195),
    ("Dhaulpur",             "DHO",  247),
    ("Gwalior Junction",     "GWL",  321),
    ("Jhansi Junction",      "JHS",  403),
    ("Bhopal Junction",      "BPL",  571),
]

def make_schedules(train_id: str, dep_hour: int, dep_minute: int, avg_speed_kmh: float, skip_stations: list = None) -> list:
    """
    Generate realistic schedule for a train on the NR-42 corridor.
    dep_hour/dep_minute = departure from NDLS (or from origin if not NDLS).
    Returns list of Schedule dicts.
    """
    skip_stations = skip_stations or []
    schedules = []
    current_time = t(dep_hour, dep_minute)
    seq = 1
    for station_name, code, km in NR42_STATIONS:
        if code in skip_stations:
            continue
        if km == 0:
            arrival = None
            departure = current_time
        else:
            travel_minutes = int((km / avg_speed_kmh) * 60)
            arrival = current_time + timedelta(minutes=travel_minutes)
            halt = 2 if code not in ("NDLS", "BPL") else 5
            departure = arrival + timedelta(minutes=halt)
            current_time = departure

        schedules.append({
            "train_id":       train_id,
            "station":        station_name,
            "station_code":   code,
            "sequence":       seq,
            "arrival_time":   arrival,
            "departure_time": departure,
            "platform":       (seq % 6) + 1,
            "distance_km":    float(km),
        })
        seq += 1
    return schedules


# Build schedule data for all trains
SCHEDULES_DATA = []

# Express trains — full corridor
SCHEDULES_DATA += make_schedules("12301", 6,  0,  110)   # Howrah Rajdhani — NDLS early morning
SCHEDULES_DATA += make_schedules("12951", 16, 25, 105)   # Mumbai Rajdhani — evening
SCHEDULES_DATA += make_schedules("12002", 6,  15, 108)   # Bhopal Shatabdi
SCHEDULES_DATA += make_schedules("12627", 7,  45, 100)   # Karnataka Express (reverse direction — BPL first stop)
SCHEDULES_DATA += make_schedules("12431", 20, 0,  102)   # Trivandrum Rajdhani — night departure
SCHEDULES_DATA += make_schedules("22691", 8,  30, 112)   # Bengaluru Rajdhani
SCHEDULES_DATA += make_schedules("12910", 9,  10, 90)    # Garib Rath
SCHEDULES_DATA += make_schedules("12049", 10, 10, 155, skip_stations=["MTJ", "DHO", "GWL", "JHS"])  # Gatimaan — NDLS↔AGC only

# Local trains — subset of stations
SCHEDULES_DATA += make_schedules("11077", 7,  0,  70)    # Jhelum Express
SCHEDULES_DATA += make_schedules("14311", 11, 30, 60, skip_stations=["MTJ"])  # Ala Hazrat
SCHEDULES_DATA += make_schedules("63107", 8,  0,  58, skip_stations=["DHO", "GWL", "JHS", "BPL"])  # EMU Local — short run

# Freight trains
SCHEDULES_DATA += make_schedules("58101", 3,  0,  50)    # Steel freight — night run
SCHEDULES_DATA += make_schedules("58201", 4,  30, 48)    # Cement freight — early morning
SCHEDULES_DATA += make_schedules("58301", 5,  0,  45, skip_stations=["MTJ", "AGC"])  # Ore freight

# Maintenance
SCHEDULES_DATA += make_schedules("04061", 14, 0,  40, skip_stations=["NDLS", "MTJ", "AGC"])  # Track inspection GWL→BPL section

# ─── CONFLICTS ─────────────────────────────────────────────────────────────────
CONFLICTS = [
    {
        "id": "CF-001",
        "train_a_id": "12301",
        "train_b_id": "58201",
        "location": "Junction J-2 (Gwalior North)",
        "severity": SeverityEnum.HIGH,
        "conflict_type": ConflictTypeEnum.CROSSING,
        "time_to_conflict": 184,
        "recommendation": (
            "Hold 58201 (Cement Freight) at Signal S-14 for 4 minutes. "
            "Allow 12301 (Howrah Rajdhani) to clear junction first. "
            "Estimated time saving: 18 minutes total delay."
        ),
        "confidence": 94,
        "time_saving": 18,
        "resolved": False,
    },
    {
        "id": "CF-002",
        "train_a_id": "12951",
        "train_b_id": "11077",
        "location": "Platform 1, Agra Cantt",
        "severity": SeverityEnum.MEDIUM,
        "conflict_type": ConflictTypeEnum.PLATFORM,
        "time_to_conflict": 420,
        "recommendation": (
            "Reroute 11077 (Jhelum Express) to Platform 3. "
            "Platform 1 occupied by delayed 12951 (Mumbai Rajdhani) until 17:18."
        ),
        "confidence": 88,
        "time_saving": 9,
        "resolved": False,
    },
    {
        "id": "CF-003",
        "train_a_id": "58101",
        "train_b_id": "58201",
        "location": "Loop at Dhaulpur (Signal DHO-E)",
        "severity": SeverityEnum.MEDIUM,
        "conflict_type": ConflictTypeEnum.LOOP,
        "time_to_conflict": 720,
        "recommendation": (
            "Allow 58101 (Steel Freight) to occupy Dhaulpur loop first. "
            "Hold 58201 (Cement Freight) at Approach Signal for 8 minutes. "
            "Both trains can clear headway without further delay."
        ),
        "confidence": 91,
        "time_saving": 12,
        "resolved": False,
    },
]


# ─── SEED FUNCTION ─────────────────────────────────────────────────────────────
async def seed(db: AsyncSession):
    print("🌱  Seeding RailTrack AI database...")

    # Users
    print("   → Inserting users...")
    for u in USERS:
        user = User(**u)
        db.add(user)
    await db.flush()

    # Trains
    print("   → Inserting trains...")
    for tr in TRAINS:
        train = Train(**tr)
        db.add(train)
    await db.flush()

    # Schedules
    print(f"   → Inserting {len(SCHEDULES_DATA)} schedule stops...")
    for s in SCHEDULES_DATA:
        schedule = Schedule(**s)
        db.add(schedule)
    await db.flush()

    # Conflicts
    print("   → Inserting conflicts...")
    for c in CONFLICTS:
        conflict = Conflict(**c)
        db.add(conflict)

    await db.commit()
    print("✅  Seeding complete!")
    print()
    print("Demo credentials:")
    print("  controller@demo.rail  / demo1234  (CONTROLLER — NR-42)")
    print("  supervisor@demo.rail  / demo1234  (SUPERVISOR — All Zones)")
    print("  logistics@demo.rail   / demo1234  (LOGISTICS  — WR-15)")
    print("  admin@demo.rail       / demo1234  (ADMIN      — HQ)")
    print("  rajesh.sharma@railways.gov.in / demo1234 (CONTROLLER — NR-42)")


async def main():
    await create_all_tables()
    async with AsyncSessionLocal() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
