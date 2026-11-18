# OpenChat Production Deployment Guide

## Overview
This guide provides the complete production deployment procedure for OpenChat, detailing containerized hosting, reverse proxy configuration, SSL certificates, environment variables, database migrations, and rollback plans.

---

## 1. Production Architecture Overview

```
                                [Internet / Customers & Agents]
                                               │
                                               ▼
                                   [Nginx Reverse Proxy / SSL]
                                               │
                   ┌───────────────────────────┴───────────────────────────┐
                   ▼                                                       ▼
       [Next.js Frontend Container]                             [FastAPI Backend Container]
              (Port 3000)                                             (Port 8000)
                   │                                                       │
                   │                                          ┌────────────┴────────────┐
                   │                                          ▼                         ▼
                   └─────────────────────────────────► [PostgreSQL 17]             [Redis 7]
                                                         (Port 5432)              (Port 6379)
```

---

## 2. Environment Variables Configuration

Create a production `.env` file on the deployment host (never commit to version control):

```bash
# Application Environment
APP_ENV=production
DEBUG=false
SECRET_KEY=generate_with_openssl_rand_hex_32
JWT_SECRET_KEY=generate_with_openssl_rand_hex_32
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database (PostgreSQL)
POSTGRES_DB=openchat
POSTGRES_USER=openchat
POSTGRES_PASSWORD=strong_random_db_password
DATABASE_URL=postgresql+psycopg2://openchat:strong_random_db_password@postgres:5432/openchat

# Cache & Queues (Redis)
REDIS_PASSWORD=strong_random_redis_password
REDIS_URL=redis://:strong_random_redis_password@redis:6379/0

# AI Provider Configuration
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...your_gemini_api_key

# CORS & Domain Restrictions
ALLOWED_ORIGINS=https://openchat.yourdomain.com,https://therewardstore.com
NEXT_PUBLIC_API_URL=https://openchat.yourdomain.com/api/v1
NEXT_PUBLIC_WIDGET_SCRIPT_URL=https://openchat.yourdomain.com/widget/openchat-widget.js

# Outbound Email (SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
SMTP_FROM_EMAIL=support@yourdomain.com
SMTP_TLS=true
```

---

## 3. Production Deployment Execution

### Step 1: Clone Repository & Checkout Release Branch
```bash
git clone https://github.com/singaravel-rgb/Openchat.git /opt/openchat
cd /opt/openchat
git checkout main
```

### Step 2: Database Migrations
Run database schema migrations before launching application containers:
```bash
docker compose -f docker-compose.prod.yml run --rm backend python -m alembic -c backend/alembic.ini upgrade head
```

### Step 3: Build & Launch Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 4: Health Check Verification
```bash
# Verify backend health
curl -f http://localhost:8000/api/v1/health

# Verify frontend response
curl -I http://localhost:3000
```

---

## 4. Database Backup & Disaster Recovery

### Automated Daily Backup Cron:
```bash
0 2 * * * docker exec openchat-postgres-prod pg_dump -U openchat openchat | gzip > /backups/openchat_$(date +\%F).sql.gz
```

### Restoration Procedure:
```bash
gunzip < /backups/openchat_YYYY-MM-DD.sql.gz | docker exec -i openchat-postgres-prod psql -U openchat -d openchat
```

---

## 5. Rollback Procedure
If a production issue occurs during deployment:
1. Revert Git repository to the prior stable release tag:
   ```bash
   git checkout tags/v0.9.x
   ```
2. Downgrade database schema if migration involved breaking changes:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm backend python -m alembic -c backend/alembic.ini downgrade -1
   ```
3. Re-launch previous containers:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
