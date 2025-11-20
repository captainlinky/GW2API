#!/bin/bash
# Verification script for GW2API multi-tenant implementation
# Checks that all files are in place and dependencies are correct

set +e  # Don't exit on error - we want to collect all results

echo "================================"
echo "GW2API Multi-Tenant Setup Verification"
echo "================================"
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

check_python_module() {
    python3 -c "import $1" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Python module: $1"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Missing Python module: $1 (run: pip install -r requirements.txt)"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

echo "Checking Authentication Files..."
check_file "auth.py"
check_file "database.py"
check_file "crypto_utils.py"

echo ""
echo "Checking Database Files..."
check_file "schema.sql"

echo ""
echo "Checking Configuration Files..."
check_file ".env.example"

echo ""
echo "Checking Deployment Files..."
check_file "gw2api.service"
check_file "nginx-gw2api.conf"
check_file "deploy.sh"
check_file "logrotate.conf"

echo ""
echo "Checking Scripts..."
check_file "scripts/backup-db.sh"
check_file "scripts/health-check.sh"

echo ""
echo "Checking Documentation..."
check_file "DEPLOYMENT_CHECKLIST.md"
check_file "IMPLEMENTATION_SUMMARY.md"
check_file "DEPLOYMENT_GUIDE.md"

echo ""
echo "Checking Dependencies in requirements.txt..."
grep -q "psycopg2-binary" requirements.txt && echo -e "${GREEN}✓${NC} psycopg2-binary found" || echo -e "${YELLOW}⚠${NC} psycopg2-binary missing"
grep -q "PyJWT" requirements.txt && echo -e "${GREEN}✓${NC} PyJWT found" || echo -e "${YELLOW}⚠${NC} PyJWT missing"
grep -q "bcrypt" requirements.txt && echo -e "${GREEN}✓${NC} bcrypt found" || echo -e "${YELLOW}⚠${NC} bcrypt missing"
grep -q "cryptography" requirements.txt && echo -e "${GREEN}✓${NC} cryptography found" || echo -e "${YELLOW}⚠${NC} cryptography missing"
grep -q "Flask-Login" requirements.txt && echo -e "${GREEN}✓${NC} Flask-Login found" || echo -e "${YELLOW}⚠${NC} Flask-Login missing"
grep -q "Flask-Limiter" requirements.txt && echo -e "${GREEN}✓${NC} Flask-Limiter found" || echo -e "${YELLOW}⚠${NC} Flask-Limiter missing"

echo ""
echo "Checking Authentication Routes in app.py..."
grep -q "@app.route('/api/auth/register'" app.py && echo -e "${GREEN}✓${NC} Registration route found" || echo -e "${RED}✗${NC} Registration route missing"
grep -q "@app.route('/api/auth/login'" app.py && echo -e "${GREEN}✓${NC} Login route found" || echo -e "${RED}✗${NC} Login route missing"
grep -q "@app.route('/api/user/api-key'" app.py && echo -e "${GREEN}✓${NC} API key route found" || echo -e "${RED}✗${NC} API key route missing"

echo ""
echo "Checking Python 3..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}✓${NC} Python 3 found: $PYTHON_VERSION"
else
    echo -e "${RED}✗${NC} Python 3 not found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Checking Flask..."
python3 -c "from flask import Flask; print('Flask version:', Flask.__version__)" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Flask is installed"
else
    echo -e "${YELLOW}⚠${NC} Flask not found (run: pip install -r requirements.txt)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version)
    echo -e "${GREEN}✓${NC} PostgreSQL client found: $PSQL_VERSION"
else
    echo -e "${YELLOW}⚠${NC} PostgreSQL client not found (needed for production)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "Checking Nginx..."
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1)
    echo -e "${GREEN}✓${NC} Nginx found: $NGINX_VERSION"
else
    echo -e "${YELLOW}⚠${NC} Nginx not found (needed for production)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "================================"
echo "Verification Summary"
echo "================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install dependencies: pip install -r requirements.txt"
    echo "2. Configure .env file with your GW2 API key (single-user mode)"
    echo "3. Or set DATABASE_URL for multi-tenant mode"
    echo "4. Run: python3 app.py"
    echo ""
    echo "For production deployment, see DEPLOYMENT_CHECKLIST.md"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo ""
    echo "The application should work but some features may be unavailable."
    echo "Install dependencies: pip install -r requirements.txt"
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    echo ""
    echo "Please fix the above issues before running the application."
    exit 1
fi
