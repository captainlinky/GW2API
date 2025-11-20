#!/bin/bash
# Database backup script for GW2API
# Run daily via cron: 0 2 * * * /opt/gw2api/scripts/backup-db.sh

BACKUP_DIR="/opt/gw2api/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="gw2api_${DATE}.sql.gz"

mkdir -p $BACKUP_DIR

# Create backup
echo "Creating database backup..."
pg_dump -U gw2api_user gw2api | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days of backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "gw2api_*.sql.gz" -mtime +7 -delete

echo "Backup created: $FILENAME"
echo "Backup location: $BACKUP_DIR/$FILENAME"
