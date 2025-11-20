#!/bin/bash
# Start GW2API in local production mode (matching VPS)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"
cd "$APP_DIR"

# Use .env.production instead of .env
if [ -f .env.production ]; then
    export $(grep -v '^#' .env.production | xargs)
fi

echo "========================================="
echo "  GW2API - Local Production Mode"
echo "========================================="
echo "  Running with APP_PREFIX: $APP_PREFIX"
echo "  Access at: http://localhost:5555$APP_PREFIX/"
echo "  Press Ctrl+C to stop"
echo "========================================="
echo ""

.venv/bin/python app.py
