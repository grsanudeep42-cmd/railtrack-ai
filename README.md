# RailTrack AI — Intelligent Railway Traffic Decision Support System

> **SIH (Smart India Hackathon) 2024 Project**  
> *Production-grade, full-stack intelligent decision-support system for Indian Railways section controllers.*

---

## 🚄 Overview

RailTrack AI assists controllers in making real-time, AI-optimized decisions for train precedence, crossings, and conflict resolution across shared track infrastructure. It solves the large-scale combinatorial problem of train scheduling using Google OR-Tools CP-SAT, and provides real-time re-optimization when disruptions occur.

**Stack:**
- **Frontend:** Next.js 14, TypeScript, React Query, NextAuth.js
- **Backend API:** FastAPI (Python 3.11), SQLAlchemy async + asyncpg, JWT/bcrypt auth
- **Solver/ML:** Google OR-Tools CP-SAT, XGBoost, scikit-learn
- **Database:** PostgreSQL (via docker-compose)

---

## 🚀 Quick Start

### 1. Prerequisites
- Docker & Docker Compose (for PostgreSQL)
- Python 3.11 + pip
- Node.js 18+

### 2. Clone & Configure

```bash
git clone https://github.com/username/railtrack-ai.git
cd railtrack-ai
```

**Backend `.env`** — copy and edit:
```bash
cp backend/.env.example backend/.env
```
> If there's no `.env.example`, create `backend/.env` with:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/railtrack
SECRET_KEY=railtrack-super-secret-key-change-in-prod
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

**Frontend `.env.local`** — create `railtrack-ai/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=railtrack-nextauth-secret-change-in-prod
```

### 3. Start PostgreSQL

```bash
docker-compose up -d postgres
```

### 4. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 5. Run Database Migrations

```bash
# Option A — Alembic (recommended, keeps migration history)
alembic upgrade head

# Option B — Auto-create (no migration history, simpler)
# Tables are auto-created on first server startup via lifespan event
```

### 6. Seed the Database

```bash
python seed.py
```

Output confirms 15 trains, 5 users, NR-42 schedules, and 3 conflicts were inserted.

### 7. Start the Backend API

```bash
uvicorn main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 8. Start the Frontend

```bash
cd ../railtrack-ai
npm install
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

---

## 👤 Demo Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Section Controller** | `controller@demo.rail` | `demo1234` | Live dashboard, conflict resolution |
| **Traffic Supervisor** | `supervisor@demo.rail` | `demo1234` | Analytics, multi-section KPIs |
| **Logistics Operator** | `logistics@demo.rail`  | `demo1234` | Freight scheduling, simulation |
| **System Admin**       | `admin@demo.rail`      | `demo1234` | User management, system config |
| **Gov Controller**     | `rajesh.sharma@railways.gov.in` | `demo1234` | Controller access |

> ⚠ **Security**: All passwords are bcrypt-hashed in the database. Never stored as plaintext.

---

## 🔐 Authentication Flow

1. `POST /api/auth/login` — returns a signed JWT (24hr expiry)
2. Frontend stores JWT in `rt_token` cookie
3. Next.js middleware validates the cookie on every protected route
4. All API calls include `Authorization: Bearer <token>` header
5. Google OAuth supported via NextAuth.js → FastAPI `/api/auth/google-verify`

---

## 🧪 Running the Auth Test Suite

```bash
cd backend
python test_auth.py
```

Tests: health check → login (all 4 roles) → `/api/auth/me` → unauthorized trains GET (expect 401) → authorized trains GET → conflicts GET → invalid credential rejection.

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | ❌ | Email + password → JWT |
| `GET`  | `/api/auth/me` | ✅ | Current user profile |
| `POST` | `/api/auth/register` | ✅ Admin | Create new user |
| `POST` | `/api/auth/google-verify` | ❌ | Google token → JWT |
| `GET`  | `/api/trains/` | ✅ | List trains (filter: `?section=NR-42`) |
| `GET`  | `/api/trains/{id}` | ✅ | Train detail + schedule |
| `PATCH`| `/api/trains/{id}/status` | ✅ | Update train status |
| `GET`  | `/api/conflicts/` | ✅ | Active unresolved conflicts |
| `POST` | `/api/conflicts/{id}/resolve` | ✅ | Resolve conflict |
| `POST` | `/api/simulate/run` | ✅ | Run OR-Tools simulation |
| `GET`  | `/health` | ❌ | Health check |
| `WS`   | `/ws/telemetry?token=xxx` | opt | Live telemetry stream |

---

## 🎨 Design System

**"Industrial Precision"** aesthetic — designed for command-center environments:
- Dark background (`#0A0C10`) with neon cyan accent (`#00D4FF`)
- Space Mono + JetBrains Mono typography
- Strict color tokens: Cyan = Live/Active, Amber = Warning, Red = Conflict, Green = Safe

---

## 📄 License

MIT License
