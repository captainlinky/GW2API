#!/bin/bash

set -e  # Exit on error

# Auto-detect script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$SCRIPT_DIR"

echo "🚀 Starting deployment..."
echo "📁 Application directory: $APP_DIR"

# Navigate to app directory
cd "$APP_DIR"

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull origin main

# Detect virtual environment (try .venv first, then venv)
if [ -d "$APP_DIR/.venv" ]; then
    VENV_DIR="$APP_DIR/.venv"
elif [ -d "$APP_DIR/venv" ]; then
    VENV_DIR="$APP_DIR/venv"
else
    echo "❌ Virtual environment not found. Please run:"
    echo "   python3 -m venv .venv"
    echo "   .venv/bin/pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo "🐍 Using virtual environment: $VENV_DIR"
source "$VENV_DIR/bin/activate"

# Install/update dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# Run database migrations (if you add a migration system later)
# flask db upgrade

# Restart service
echo "♻️  Restarting application..."
sudo systemctl restart gw2api

# Wait a moment and check status
sleep 2
if sudo systemctl is-active --quiet gw2api; then
    echo "✅ Deployment successful!"
    echo "📊 Service status:"
    sudo systemctl status gw2api --no-pager
else
    echo "❌ Deployment failed - service did not start"
    echo "📋 Check logs:"
    echo "  sudo journalctl -u gw2api -n 50"
    exit 1
fi

echo "🎉 Deployment complete!"
