#!/bin/bash
# GW2API startup script

set -e

cd /home/GW2API/GW2API

# Activate virtual environment
source venv/bin/activate

# Load environment
export $(cat .env.production | grep -v '^#' | xargs)

# Start Flask app
python3 app.py
