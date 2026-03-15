# RailTrack AI 🚂

**Intelligent Railway Management System** for section controllers of Indian Railways.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-316192?logo=postgresql)](https://postgresql.org)
[![OR-Tools](https://img.shields.io/badge/OR--Tools-CP--SAT-4285F4?logo=google)](https://developers.google.com/optimization)

---

## Overview

RailTrack AI provides real-time decision support for section controllers managing train traffic on the Indian Railways network. The system combines live IRCTC data, AI-assisted conflict detection, and OR-Tools optimization to help controllers minimize delays and maximize throughput.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, TypeScript, TailwindCSS, TanStack Query |
| **Backend** | FastAPI, Python 3.11, SQLAlchemy (async), Alembic |
| **Database** | PostgreSQL 16 |
| **AI/Optimization** | OR-Tools CP-SAT Solver, Groq (Llama 3.1) |
| **Auth** | JWT (python-jose), bcrypt (passlib) |
| **Email** | Gmail SMTP via App Password |
| **Live Data** | IRCTC RapidAPI |

---

## Features

- 🚆 **Real-time Train Dashboard** — live status, delays, and section assignments
- 🧠 **AI-Powered Schedule Optimization** — OR-Tools CP-SAT solver minimises total delay under disruption scenarios
- 💬 **AI Chat Assistant** — Groq-powered assistant with live DB context (trains, conflicts)
- 📊 **Analytics & KPIs** — punctuality %, avg delay, throughput, conflict rates with sparkline history
- 🛡️ **Admin Panel** — user management (invite, edit, delete), system health telemetry
- ✉️ **Email Invite System** — invite users via Gmail SMTP; invited accounts activate via `/auth/setup`
- 🔐 **Role-Based Access Control** — `ADMIN` / `CONTROLLER` / `SUPERVISOR` / `LOGISTICS`
- 🔒 **Authenticated WebSocket** — live train state sync via JWT-protected WS connection

---

## Project Structure

```
RailTrack/
├── backend/                  # FastAPI + Python
│   ├── routers/              # auth, trains, simulate, analytics, admin, ai, conflicts
│   ├── utils/email.py        # Gmail SMTP invite sender
│   ├── algorithm/solver.py   # OR-Tools CP-SAT precedence optimizer
│   ├── models.py             # SQLAlchemy ORM models
│   ├── database.py           # Async engine + session factory
│   ├── auth_utils.py         # JWT + bcrypt + FastAPI dependencies
│   ├── alembic/              # Database migration scripts
│   ├── seed.py               # Initial data seeder
│   ├── .env.example          # Template — copy to .env
│   └── main.py               # FastAPI app entry point
└── railtrack-ai/             # Next.js 15 frontend
    ├── src/app/              # Pages: dashboard, simulate, analytics, admin, auth
    ├── src/components/       # Reusable components
    ├── src/lib/              # API client, auth context
    ├── src/middleware.ts     # JWT route protection (Edge)
    └── .env.example          # Template — copy to .env.local
```

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16

### Backend

```bash
cd backend

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL, SECRET_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, etc.

# 3. Run database migrations
alembic upgrade head

# 4. Seed initial data (trains, users, conflicts)
python seed.py

# 5. Start the FastAPI dev server
uvicorn main:app --reload --port 8000
```

API docs available at: [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd railtrack-ai

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_API_URL=http://localhost:8000

# 3. Start the Next.js dev server
npm run dev
```

App available at: [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (asyncpg driver) |
| `SECRET_KEY` | ✅ | JWT signing secret — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GMAIL_USER` | ✅ | Gmail address for invite emails |
| `GMAIL_APP_PASSWORD` | ✅ | Gmail App Password (not your account password) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated list of allowed CORS origins |
| `FRONTEND_URL` | ✅ | Base URL of the frontend — used in invite email links |
| `RAPIDAPI_KEY` | ✅ | RapidAPI key for IRCTC live train tracker |
| `RAPIDAPI_HOST` | ✅ | `indian-railway-irctc.p.rapidapi.com` |
| `GROQ_API_KEY` | ✅ | Groq API key for the AI chat assistant |
| `ALGORITHM` | ❌ | JWT algorithm (default: `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | JWT expiry in minutes (default: `1440`) |
| `GOOGLE_CLIENT_ID` | ❌ | Google OAuth client ID (for Google Sign-In) |

See `backend/.env.example` for a full template.

### Frontend (`railtrack-ai/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ❌ | Google OAuth client ID (for Google Sign-In button) |

See `railtrack-ai/.env.example` for a full template.

---

## Deployment

### Backend → Railway.app

1. Create a Railway project and add a PostgreSQL plugin.
2. Set all required environment variables in Railway's service settings.
3. Deploy — Railway auto-detects the Python `Dockerfile`.

### Frontend → Vercel

1. Push to GitHub and import the repo into Vercel.
2. Set root directory to `railtrack-ai`.
3. Set `NEXT_PUBLIC_API_URL` to your Railway backend URL.

### Post-Deploy

```bash
# Run migrations (from Railway CLI or shell)
alembic upgrade head

# Seed initial data
python seed.py
```

---

## Security

- Passwords hashed with **bcrypt** (passlib).
- All protected routes require a valid **JWT Bearer token**.
- Admin routes additionally verify the `ADMIN` role.
- Invited users (`hashed_password="INVITED"`, `is_active=False`) **cannot log in** until they complete account setup via `/auth/setup`.
- CORS origins are controlled via `ALLOWED_ORIGINS` env var — no wildcard `*` in production.
- `.env` and `.env.local` are excluded from git via `.gitignore`.

---

## License

MIT
