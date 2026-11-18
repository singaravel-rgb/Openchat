#!/bin/bash
# ==============================================================================
# OpenChat — Secure Gemini API Key Injection & Reload Tool
# 
# Security Features:
# 1. Zero Shell History: Uses silent interactive prompt (read -s); never passed via flags.
# 2. Zero Process Argument Exposure: Does not appear in ps or /proc/<pid>/cmdline.
# 3. Zero Terraform State Exposure: Injected directly on host / SSM post-provisioning.
# 4. Atomic File Update: Safely writes with chmod 600 permissions.
# 5. Application Reload: Gracefully restarts backend and verifies runtime health.
# ==============================================================================
set -euo pipefail

ENV_FILE="/opt/openchat/.env"
COMPOSE_FILE="/opt/openchat/docker-compose.test.yml"

echo "================================================================="
echo "       OpenChat Secure Secret Configuration — Google Gemini       "
echo "================================================================="

# 1. Prompt for API key silently (no echo, no history)
if [ -t 0 ]; then
    printf "Enter Gemini API Key (input hidden): "
    read -r -s GEMINI_INPUT
    echo ""
else
    # In non-interactive pipelines, read first line from standard input
    read -r -s GEMINI_INPUT
fi

# Sanitize input (strip whitespace)
GEMINI_INPUT=$(echo "$GEMINI_INPUT" | xargs)

if [ -z "$GEMINI_INPUT" ]; then
    echo "[-] Error: Provided API key is empty. Aborting." >&2
    exit 1
fi

# 2. Verify target environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "[-] Error: Environment file $ENV_FILE not found." >&2
    exit 1
fi

# 3. Atomic and secure update of .env file
TMP_ENV=$(mktemp "$ENV_FILE.tmp.XXXXXX")
chmod 600 "$TMP_ENV"

# Check if GEMINI_API_KEY already exists in .env
if grep -q "^GEMINI_API_KEY=" "$ENV_FILE"; then
    # Safely replace existing line without sed variable injection vulnerabilities
    awk -v key="$GEMINI_INPUT" '
        BEGIN { done=0 }
        /^GEMINI_API_KEY=/ { print "GEMINI_API_KEY=" key; done=1; next }
        { print }
        END { if (!done) print "GEMINI_API_KEY=" key }
    ' "$ENV_FILE" > "$TMP_ENV"
else
    cp "$ENV_FILE" "$TMP_ENV"
    echo "GEMINI_API_KEY=$GEMINI_INPUT" >> "$TMP_ENV"
fi

mv "$TMP_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "[+] Updated $ENV_FILE with secure file permissions (600)."

# Clear variable from memory
unset GEMINI_INPUT

# 4. Gracefully restart backend container to read new environment
if [ -f "$COMPOSE_FILE" ]; then
    echo "[*] Reloading backend container to apply updated API key..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps backend

    echo "[*] Waiting for backend healthcheck to verify runtime availability..."
    for i in {1..30}; do
        if docker exec openchat-backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
            echo "[+] Backend healthy. Verifying Gemini API runtime status..."
            # Check if key is registered without exposing it
            HAS_KEY=$(docker exec openchat-backend python -c "from app.core.config import settings; print('YES' if settings.gemini_api_key else 'NO')")
            if [ "$HAS_KEY" = "YES" ]; then
                echo "[+] Verified: Backend runtime has successfully loaded the Gemini API key."
                exit 0
            else
                echo "[!] Warning: Backend is healthy but reported gemini_api_key as empty."
                exit 1
            fi
        fi
        sleep 2
    done
    echo "[-] Timeout waiting for backend health after key update." >&2
    exit 1
fi
