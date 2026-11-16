# OpenChat Deployment Guide

## Prerequisites
- Docker & Docker Compose (for database/redis)
- Python 3.12+ (for backend)
- Node.js 18+ (for frontend)

## Architecture
```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Admin      │────▶│              │     │              │
│  Portal     │     │   Backend    │────▶│  PostgreSQL  │
│  (React)    │     │  (FastAPI)   │     │              │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                           │ WebSocket / HTTP
                           │
              ┌────────────┴─────────────┐
              │                          │
     ┌────────▼────────┐     ┌─────────▼──────────┐
     │   Agent         │     │   Redis            │
     │   Portal        │     │   (rate limiting,  │
     │   (React)       │     │    caching)        │
     └────────┬────────┘     └────────────────────┘
              │
              │ embed.js (cross-origin)
              │
     ┌────────▼────────────────────────────────┐
     │  Embedded Widget (customer websites)    │
     │  - Guest sessions                      │
     │  - Authenticated host mode (JWT)        │
     └─────────────────────────────────────────┘
```

## Quick Start (Development)

### 1. Start infrastructure
```bash
docker compose up -d
```

### 2. Start backend
```bash
cd backend
pip install -e .
python -m alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Verify
- Admin: http://localhost:3000/admin
- Agent: http://localhost:3000/agent
- Widget test: http://localhost:3000/widget-test.html

## Production Deployment

### Backend (FastAPI)
```bash
# Install dependencies
cd backend
pip install -e .

# Run migrations
python -m alembic upgrade head

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run build
npm start
```

### Health Checks
- Backend: `GET /health` → `{"status": "ok"}`
- Database: `pg_isready -U openchat -d openchat`
- Redis: `redis-cli -a "$REDIS_PASSWORD" ping` → `PONG`

## Environment Variables

See `.env.example` for all configuration options.

### Key Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_KEY` | JWT signing key (32+ hex chars) | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `REDIS_PASSWORD` | Redis password | Yes |
| `HOST_IDENTITY_PUBLIC_KEY` | PEM public key for host JWT verification | No |
| `HOST_IDENTITY_JWKS_URL` | JWKS endpoint URL | No |
| `HOST_IDENTITY_ISSUER` | Expected JWT issuer | No |
| `HOST_IDENTITY_AUDIENCE` | Expected JWT audience | No |

## Database Schema
All migrations are in `backend/migrations/versions/`. Apply with:
```bash
cd backend && python -m alembic upgrade head
```

## Monitoring
- Backend logs: `docker logs openchat-backend`
- Health: `curl http://localhost:8000/health`
- Active connections: `SELECT count(*) FROM pg_stat_activity;`