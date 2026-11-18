#!/bin/bash
# ==============================================================================
# OpenChat PostgreSQL Backup Restore & Verification Tool
# Downloads a database dump from S3 and restores it into the PostgreSQL container.
# Usage:
#   ./scripts/restore_postgres_from_s3.sh <s3-backup-bucket> [backup-filename]
# ==============================================================================
set -euo pipefail

BACKUP_BUCKET="${1:-}"
SPECIFIC_FILE="${2:-}"

if [ -z "$BACKUP_BUCKET" ]; then
    echo "Usage: $0 <s3-backup-bucket-name> [optional-backup-filename]"
    exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if [ -z "$SPECIFIC_FILE" ]; then
    echo "[*] Discovering latest backup in s3://${BACKUP_BUCKET}/postgres_backups/ ..."
    LATEST_S3_PATH=$(aws s3 ls "s3://${BACKUP_BUCKET}/postgres_backups/" | sort | tail -n 1 | awk '{print $4}')
    if [ -z "$LATEST_S3_PATH" ]; then
        echo "[-] Error: No backups found in bucket ${BACKUP_BUCKET}!"
        exit 1
    fi
    BACKUP_FILE="$LATEST_S3_PATH"
else
    BACKUP_FILE="$SPECIFIC_FILE"
fi

echo "[*] Downloading: s3://${BACKUP_BUCKET}/postgres_backups/${BACKUP_FILE} ..."
aws s3 cp "s3://${BACKUP_BUCKET}/postgres_backups/${BACKUP_FILE}" "$TMP_DIR/backup.sql.gz"

echo "[*] Verifying gzip archive integrity..."
gzip -t "$TMP_DIR/backup.sql.gz"
echo "[+] Archive integrity verified."

echo "[*] Restoring into openchat-postgres container..."
gunzip -c "$TMP_DIR/backup.sql.gz" | docker exec -i openchat-postgres psql -U openchat -d openchat

echo "[+] Database restore completed successfully."

# Run post-restore sanity check
RECORD_COUNT=$(docker exec openchat-postgres psql -U openchat -d openchat -t -c "SELECT count(*) FROM users;" | xargs)
echo "[+] Verification query: users table contains ${RECORD_COUNT} records."
