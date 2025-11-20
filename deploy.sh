#!/bin/bash

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Navigate to app directory
cd /opt/gw2api/app

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull origin main

# Activate virtual environment
source venv/bin/activate

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
