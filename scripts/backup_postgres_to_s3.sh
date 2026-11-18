#!/bin/bash
# ==============================================================================
# OpenChat PostgreSQL Automated Backup to S3
# Dumps PostgreSQL database using PostgreSQL Custom Format (-Fc) and uploads to S3.
# ==============================================================================
set -euo pipefail

BACKUP_BUCKET="${1:-}"
if [ -z "$BACKUP_BUCKET" ]; then
    echo "Usage: $0 <s3-backup-bucket-name>"
    exit 1
fi

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="openchat_backup_${TIMESTAMP}.dump"
S3_URI="s3://${BACKUP_BUCKET}/postgres_backups/${BACKUP_FILE}"

echo "[*] Starting PostgreSQL custom-format backup at $(date -u)..."

docker exec openchat-postgres pg_dump -U openchat -d openchat -Fc | aws s3 cp - "$S3_URI" --sse AES256

echo "[+] Successfully created and uploaded custom-format backup to: $S3_URI"
