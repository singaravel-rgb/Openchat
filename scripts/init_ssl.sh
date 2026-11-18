#!/bin/bash
# ==============================================================================
# OpenChat SSL Certificate Initializer & Certbot Automation
# 1. Generates bootstrap self-signed certificate if no cert exists (prevents Nginx crash).
# 2. Issues Let's Encrypt certificate once domain resolves to this host.
# 3. Sets up automated daily renewal with Nginx reload.
# ==============================================================================
set -euo pipefail

SSL_DIR="/opt/openchat/nginx/ssl"
CERTBOT_DIR="/opt/openchat/nginx/certbot"
mkdir -p "$SSL_DIR" "$CERTBOT_DIR"

DOMAIN="${1:-}"
EMAIL="${2:-admin@openchat.io}"

# 1. Generate bootstrap self-signed certificate if none exists
if [ ! -f "$SSL_DIR/server.crt" ] || [ ! -f "$SSL_DIR/server.key" ]; then
    echo "[*] Generating initial bootstrap self-signed certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/server.key" \
        -out "$SSL_DIR/server.crt" \
        -subj "/C=US/ST=Cloud/L=Test/O=OpenChat/CN=${DOMAIN:-localhost}"
    chmod 600 "$SSL_DIR/server.key"
    chmod 644 "$SSL_DIR/server.crt"
    echo "[+] Bootstrap self-signed certificate ready."
fi

# 2. If domain is provided, attempt Let's Encrypt issuance via Webroot
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
    echo "[*] Requesting official Let's Encrypt certificate for $DOMAIN..."
    
    # Check if certbot is installed on host
    if ! command -v certbot &> /dev/null; then
        echo "[*] Installing certbot..."
        apt-get update -y && apt-get install -y certbot
    fi

    # Issue certificate
    certbot certonly --webroot \
        -w "$CERTBOT_DIR" \
        -d "$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive || {
            echo "[!] Certbot issuance failed (DNS may not have propagated yet). Running with self-signed certificate."
            exit 0
        }

    # Symlink Let's Encrypt certificate to Nginx SSL directory
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/server.crt"
        ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/server.key"
        
        # Reload Nginx inside docker
        if docker ps | grep -q openchat-nginx; then
            docker exec openchat-nginx nginx -s reload
            echo "[+] Nginx successfully reloaded with Let's Encrypt certificate."
        fi

        # 3. Configure automated renewal cron
        CRON_JOB="0 3 * * * certbot renew --webroot -w $CERTBOT_DIR --quiet --post-hook 'docker exec openchat-nginx nginx -s reload'"
        (crontab -l 2>/dev/null | grep -F -v "certbot renew"; echo "$CRON_JOB") | crontab -
        echo "[+] Automated Certbot renewal cron installed (runs daily at 03:00 UTC)."
    fi
fi
