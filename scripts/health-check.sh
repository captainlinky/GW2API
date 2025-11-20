#!/bin/bash
# Health check script for GW2API
# Run every 5 minutes via cron: */5 * * * * /opt/gw2api/scripts/health-check.sh >> /opt/gw2api/logs/health-check.log 2>&1

set +e  # Don't exit on error - we want to collect status

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ERRORS=0

echo "[$TIMESTAMP] Running health check..."

# Check if service is running
if ! systemctl is-active --quiet gw2api; then
    echo "[$TIMESTAMP] ❌ GW2API service is not running"
    echo "[$TIMESTAMP] Attempting to restart..."
    sudo systemctl start gw2api
    sleep 2
    if ! systemctl is-active --quiet gw2api; then
        echo "[$TIMESTAMP] ❌ Failed to restart service"
        ERRORS=$((ERRORS + 1))
    else
        echo "[$TIMESTAMP] ✅ Service restarted successfully"
    fi
fi

# Check if API is responding
if ! curl -f -s http://localhost:5555/api/status > /dev/null 2>&1; then
    echo "[$TIMESTAMP] ❌ GW2API is not responding"
    echo "[$TIMESTAMP] Attempting to restart..."
    sudo systemctl restart gw2api
    sleep 2
    if ! curl -f -s http://localhost:5555/api/status > /dev/null 2>&1; then
        echo "[$TIMESTAMP] ❌ API still not responding after restart"
        ERRORS=$((ERRORS + 1))
    else
        echo "[$TIMESTAMP] ✅ API responding after restart"
    fi
fi

# Check database connection (if PostgreSQL is configured)
if command -v psql &> /dev/null; then
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw gw2api; then
        echo "[$TIMESTAMP] ❌ Database connection failed"
        ERRORS=$((ERRORS + 1))
    else
        echo "[$TIMESTAMP] ✅ Database connected"
    fi
fi

# Final status
if [ $ERRORS -eq 0 ]; then
    echo "[$TIMESTAMP] ✅ All systems operational"
    exit 0
else
    echo "[$TIMESTAMP] ⚠️  Health check completed with $ERRORS error(s)"
    exit 1
fi
