#!/bin/bash
# ==============================================================================
# OpenChat — Staging Environment Preflight & Migration Tool
#
# Purpose:
# 1. Validates container runtime and environment prerequisites.
# 2. Ensures PostgreSQL and Redis containers are healthy before migrations run.
# 3. Executes Alembic schema migrations in an isolated one-off container,
#    preventing race conditions from concurrent application worker startup.
# 4. Verifies database schema revision head.
# 5. Provides clear instructions for launching the remaining application services.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.test.yml"

echo "================================================================="
echo "       OpenChat Internal Staging — Preflight & Migration        "
echo "================================================================="

cd "${ROOT_DIR}"

# 1. Verify Docker and Docker Compose
echo "[1/5] Verifying Docker runtime..."
if ! command -v docker >/dev/null 2>&1; then
    echo "[-] Error: docker is not installed or not in PATH." >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "[-] Error: docker compose plugin is not available." >&2
    exit 1
fi
echo "[+] Docker and Docker Compose are available."

# 2. Verify Environment Configuration
echo "[2/5] Checking environment configuration..."
ENV_FILE="${ROOT_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    if [ -f "${ROOT_DIR}/.env.staging" ]; then
        ENV_FILE="${ROOT_DIR}/.env.staging"
        echo "[*] Using staging environment file: ${ENV_FILE}"
    else
        echo "[-] Warning: No .env or .env.staging file found at ${ROOT_DIR}."
        echo "    Ensure POSTGRES_PASSWORD, REDIS_PASSWORD, and SECRET_KEY are exported in your environment."
    fi
else
    echo "[+] Found environment file at ${ENV_FILE}"
fi

# 3. Ensure Core Infrastructure Services (PostgreSQL & Redis) are Healthy
echo "[3/5] Starting / verifying PostgreSQL and Redis services..."
docker compose -f "${COMPOSE_FILE}" up -d postgres redis

echo "[*] Waiting for PostgreSQL and Redis health checks..."
RETRIES=30
until [ "${RETRIES}" -le 0 ]; do
    PG_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' openchat-postgres 2>/dev/null || echo '"unknown"')
    REDIS_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' openchat-redis 2>/dev/null || echo '"unknown"')

    if [ "${PG_STATUS}" = '"healthy"' ] && [ "${REDIS_STATUS}" = '"healthy"' ]; then
        echo "[+] PostgreSQL and Redis are healthy."
        break
    fi

    echo "    Postgres: ${PG_STATUS}, Redis: ${REDIS_STATUS}. Waiting 2s (${RETRIES} retries left)..."
    sleep 2
    RETRIES=$((RETRIES - 1))
done

if [ "${RETRIES}" -le 0 ]; then
    echo "[-] Error: Timed out waiting for database or cache services to become healthy." >&2
    docker compose -f "${COMPOSE_FILE}" logs --tail=20 postgres redis
    exit 1
fi

# 4. Execute Alembic Migrations
echo "[4/5] Running Alembic database migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm backend alembic -c backend/alembic.ini upgrade head

echo "[*] Verifying current migration revision..."
docker compose -f "${COMPOSE_FILE}" run --rm backend alembic -c backend/alembic.ini current

# 5. Summary & Next Steps
echo "[5/5] Preflight and migrations completed successfully!"
echo "================================================================="
echo "To start all staging application services, run:"
echo "  docker compose -f docker-compose.test.yml up -d"
echo ""
echo "To verify running containers:"
echo "  docker compose -f docker-compose.test.yml ps"
echo ""
echo "To verify internal HTTP health endpoint:"
echo "  curl -s http://localhost/health"
echo "================================================================="
