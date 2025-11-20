#!/bin/bash

################################################################################
# Setup Local Production Environment
# This script sets up your local machine to match the VPS production environment
################################################################################

set -e

echo "========================================="
echo "  GW2API Local Production Setup"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}[1/5] Installing PostgreSQL...${NC}"
sudo apt-get update -qq
sudo apt-get install -y postgresql postgresql-contrib

echo -e "${GREEN}✓ PostgreSQL installed${NC}"
echo ""

echo -e "${BLUE}[2/5] Creating database and user...${NC}"

# Create database user and database
sudo -u postgres psql <<EOF
-- Drop existing if they exist
DROP DATABASE IF EXISTS gw2api;
DROP USER IF EXISTS gw2api_user;

-- Create user and database
CREATE USER gw2api_user WITH PASSWORD 'GW2API_Secure_Pass_12345';
CREATE DATABASE gw2api OWNER gw2api_user;
GRANT ALL PRIVILEGES ON DATABASE gw2api TO gw2api_user;
EOF

echo -e "${GREEN}✓ Database created${NC}"
echo ""

echo -e "${BLUE}[3/5] Applying database schema...${NC}"

if [ -f "schema.sql" ]; then
    sudo -u postgres psql gw2api < schema.sql

    # Grant permissions
    sudo -u postgres psql gw2api <<EOF
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gw2api_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gw2api_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gw2api_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gw2api_user;
EOF

    echo -e "${GREEN}✓ Schema applied${NC}"
else
    echo -e "${GREEN}⚠ schema.sql not found, skipping${NC}"
fi
echo ""

echo -e "${BLUE}[4/5] Setting up environment...${NC}"

# Check if .env.production exists, if not create it
if [ ! -f ".env.production" ]; then
    JWT_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    ENC_KEY=$(.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

    cat > .env.production <<EOF
# GW2API Local Production Configuration
# Generated on $(date)

# ===== Multi-Tenant Database =====
DATABASE_URL=postgresql://gw2api_user:GW2API_Secure_Pass_12345@localhost/gw2api

# ===== Security Keys =====
JWT_SECRET_KEY=$JWT_KEY
SECRET_KEY=$SECRET_KEY
API_KEY_ENCRYPTION_KEY=$ENC_KEY

# ===== Flask Configuration =====
FLASK_ENV=production
FLASK_DEBUG=False

# ===== Rate Limiting =====
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60

# ===== Server Configuration =====
HOST=127.0.0.1
PORT=5555

# ===== Application Prefix (IMPORTANT: Matches VPS) =====
APP_PREFIX=/gw2api
EOF
    echo -e "${GREEN}✓ Created .env.production${NC}"
else
    echo -e "${GREEN}✓ .env.production exists${NC}"
fi
echo ""

echo -e "${BLUE}[5/5] Creating startup script...${NC}"

cat > start-local-production.sh <<'EOF'
#!/bin/bash
# Start GW2API in local production mode (matching VPS)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

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
EOF

chmod +x start-local-production.sh
echo -e "${GREEN}✓ Created start-local-production.sh${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Your local machine is now configured to match the VPS production environment."
echo ""
echo "To start the server in production mode:"
echo "  ${BLUE}./start-local-production.sh${NC}"
echo ""
echo "Access the app at:"
echo "  ${BLUE}http://localhost:5555/gw2api/${NC}"
echo ""
echo "This matches your VPS exactly:"
echo "  - PostgreSQL database with multi-tenant auth"
echo "  - APP_PREFIX=/gw2api (same URL structure)"
echo "  - Production configuration"
echo ""
echo "For development mode (no prefix), use:"
echo "  ${BLUE}./start_ui.sh${NC}"
echo ""
