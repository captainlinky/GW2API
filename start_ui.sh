#!/bin/bash
# Start the GW2 API Web UI

cd "$(dirname "$0")"

echo "=================================================="
echo "  Starting Guild Wars 2 API Web Interface"
echo "=================================================="
echo ""
echo "  The web UI will open at: http://localhost:5555"
echo ""
echo "  Press Ctrl+C to stop the server"
echo ""
echo "=================================================="
echo ""

# Activate virtual environment and run
.venv/bin/python app.py
