#!/bin/bash
# ==============================================================================
# OpenChat PostgreSQL Automated Backup to S3
# Dumps PostgreSQL database, compresses, and streams directly to encrypted S3.
# ==============================================================================
set -euo pipefail

BACKUP_BUCKET="${1:-}"
if [ -z "$BACKUP_BUCKET" ]; then
    echo "Usage: $0 <s3-backup-bucket-name>"
    exit 1
fi

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="openchat_backup_${TIMESTAMP}.sql.gz"
S3_URI="s3://${BACKUP_BUCKET}/postgres_backups/${BACKUP_FILE}"

echo "[*] Starting PostgreSQL backup at $(date -u)..."

docker exec openchat-postgres pg_dump -U openchat -d openchat --clean --if-exists | gzip | aws s3 cp - "$S3_URI" --sse AES256

echo "[+] Successfully created and uploaded backup to: $S3_URI"
