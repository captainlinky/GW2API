#!/bin/bash

################################################################################
# GW2API Universal Ubuntu Deployment Script
#
# This script works on any Ubuntu machine and makes no assumptions about paths.
# It auto-detects the current directory and deploys from there.
#
# Usage:
#   Development mode (local):    ./deploy-ubuntu.sh
#   Production mode (with SSL):  sudo ./deploy-ubuntu.sh <domain> <email>
#
# Examples:
#   ./deploy-ubuntu.sh                                    # Local development
#   sudo ./deploy-ubuntu.sh gridserv.io admin@example.com # Production VPS
#
# Requirements:
# - Ubuntu 20.04+
# - Internet connection
# - For production: sudo access, domain pointing to server
#
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Auto-detect configuration
################################################################################

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$SCRIPT_DIR"

# Deployment mode detection
if [ -z "$1" ]; then
    DEPLOY_MODE="development"
    DOMAIN="localhost"
    EMAIL=""
else
    DEPLOY_MODE="production"
    DOMAIN="${1:?Domain name required for production mode}"
    EMAIL="${2:?Email required for production mode}"
fi

# Configuration
VENV_DIR="${APP_DIR}/.venv"
DB_USER="gw2api_user"
DB_NAME="gw2api"
DB_PASS=$(openssl rand -base64 32 2>/dev/null || echo "changeme_$(date +%s)")
FLASK_PORT="5555"
SERVICE_NAME="gw2api"

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

check_ubuntu() {
    if [ ! -f /etc/lsb-release ]; then
        log_error "This script is designed for Ubuntu. Other distributions may not work correctly."
        exit 1
    fi
    source /etc/lsb-release
    log_success "Detected Ubuntu ${DISTRIB_RELEASE}"
}

check_root_if_production() {
    if [ "$DEPLOY_MODE" = "production" ] && [[ $EUID -ne 0 ]]; then
        log_error "Production mode requires sudo/root access"
        log_info "Run with: sudo $0 $DOMAIN $EMAIL"
        exit 1
    fi
}

################################################################################
# STEP 1: System Dependencies
################################################################################

step_install_dependencies() {
    log_step "STEP 1: Installing System Dependencies"

    if [ "$DEPLOY_MODE" = "production" ]; then
        log_info "Installing production dependencies..."
        apt-get update -qq
        apt-get install -y -qq \
            python3 \
            python3-pip \
            python3-venv \
            postgresql \
            postgresql-contrib \
            nginx \
            certbot \
            python3-certbot-nginx \
            curl \
            wget \
            git \
            build-essential \
            python3-dev \
            openssl 2>&1 | grep -E "^(Setting up|Processing)" || true
    else
        log_info "Checking development dependencies..."

        # Check for python3
        if ! command -v python3 &> /dev/null; then
            log_warning "python3 not found. Installing basic dependencies..."
            if command -v apt-get &> /dev/null; then
                sudo apt-get update -qq
                sudo apt-get install -y python3 python3-pip python3-venv
            else
                log_error "Please install python3, python3-pip, and python3-venv manually"
                exit 1
            fi
        fi
    fi

    log_success "Dependencies installed"
}

################################################################################
# STEP 2: Python Environment
################################################################################

step_python_setup() {
    log_step "STEP 2: Python Environment Setup"

    cd "$APP_DIR"

    if [ ! -d "$VENV_DIR" ]; then
        log_info "Creating Python virtual environment at $VENV_DIR"
        python3 -m venv "$VENV_DIR"
    else
        log_info "Using existing virtual environment"
    fi

    log_info "Upgrading pip and installing dependencies"
    "$VENV_DIR/bin/pip" install -q --upgrade pip setuptools wheel

    if [ -f "$APP_DIR/requirements.txt" ]; then
        log_info "Installing Python packages from requirements.txt"
        "$VENV_DIR/bin/pip" install -q -r "$APP_DIR/requirements.txt"
    else
        log_error "requirements.txt not found at $APP_DIR/requirements.txt"
        exit 1
    fi

    log_success "Python environment configured"
}

################################################################################
# STEP 3: Configuration Files
################################################################################

step_create_env_file() {
    log_step "STEP 3: Creating Environment Configuration"

    local env_file="$APP_DIR/.env"

    if [ "$DEPLOY_MODE" = "production" ]; then
        env_file="$APP_DIR/.env.production"

        # Generate security keys
        local jwt_key=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        local secret_key=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        local encryption_key=$("$VENV_DIR/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

        cat > "$env_file" <<EOF
# GW2API Production Configuration
# Generated on $(date)
# Deployed at: $APP_DIR

# ===== Database Configuration =====
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost/$DB_NAME

# ===== Security Keys =====
JWT_SECRET_KEY=$jwt_key
SECRET_KEY=$secret_key
API_KEY_ENCRYPTION_KEY=$encryption_key

# ===== Flask Configuration =====
FLASK_ENV=production
FLASK_DEBUG=False

# ===== Rate Limiting =====
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60

# ===== Server Configuration =====
HOST=127.0.0.1
PORT=$FLASK_PORT

# ===== Application Prefix =====
APP_PREFIX=/gw2api
EOF
        chmod 600 "$env_file"
        log_success "Production environment file created: $env_file"
    else
        # Development mode
        if [ ! -f "$env_file" ]; then
            if [ -f "$APP_DIR/.env.example" ]; then
                cp "$APP_DIR/.env.example" "$env_file"
                log_success "Development environment file created: $env_file"
                log_warning "Please edit $env_file and add your GW2_API_KEY"
            else
                log_warning ".env.example not found, skipping .env creation"
            fi
        else
            log_info "Using existing .env file"
        fi
    fi
}

################################################################################
# STEP 4: Database Setup (Production Only)
################################################################################

step_database_setup() {
    if [ "$DEPLOY_MODE" != "production" ]; then
        return 0
    fi

    log_step "STEP 4: Database Setup"

    log_info "Starting PostgreSQL service"
    systemctl start postgresql
    systemctl enable postgresql

    log_info "Creating PostgreSQL database and user"

    # Check if user exists
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        log_info "Database user already exists, updating password"
        sudo -u postgres psql <<EOF > /dev/null 2>&1
ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';
EOF
    else
        log_info "Creating new database user"
        sudo -u postgres psql <<EOF > /dev/null 2>&1
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
EOF
    fi

    # Check if database exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_info "Database already exists"
    else
        log_info "Creating new database"
        sudo -u postgres psql <<EOF > /dev/null 2>&1
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
    fi

    # Apply schema if it exists
    if [ -f "$APP_DIR/schema.sql" ]; then
        log_info "Applying database schema"
        sudo -u postgres psql "$DB_NAME" < "$APP_DIR/schema.sql" > /dev/null 2>&1 || log_warning "Schema may already be applied"
    fi

    log_info "Configuring database permissions"
    sudo -u postgres psql "$DB_NAME" <<EOF > /dev/null 2>&1
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOF

    log_success "Database configured"
}

################################################################################
# STEP 5: Systemd Service (Production Only)
################################################################################

step_systemd_service() {
    if [ "$DEPLOY_MODE" != "production" ]; then
        return 0
    fi

    log_step "STEP 5: Creating Systemd Service"

    cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=GW2API Multi-Tenant Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$APP_DIR
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$APP_DIR/.env.production
ExecStart=$VENV_DIR/bin/python3 $APP_DIR/app.py
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}" > /dev/null 2>&1

    log_success "Systemd service created: ${SERVICE_NAME}.service"
}

################################################################################
# STEP 6: Nginx Configuration (Production Only)
################################################################################

step_nginx_setup() {
    if [ "$DEPLOY_MODE" != "production" ]; then
        return 0
    fi

    log_step "STEP 6: Configuring Nginx Reverse Proxy"

    local nginx_config="/etc/nginx/sites-available/$DOMAIN"

    cat > "$nginx_config" <<'NGINX_CONFIG'
# Nginx configuration for GW2API
upstream gw2api {
    server 127.0.0.1:5555;
}

# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server block
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    # SSL certificates (will be updated by certbot)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root location
    location = / {
        return 301 /gw2api/;
    }

    # GW2API Service
    location /gw2api/ {
        rewrite ^/gw2api/(.*) /$1 break;

        proxy_pass http://gw2api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /gw2api;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location /gw2api/static/ {
        alias APP_DIR_PLACEHOLDER/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    access_log /var/log/nginx/DOMAIN_PLACEHOLDER_access.log;
    error_log /var/log/nginx/DOMAIN_PLACEHOLDER_error.log;
}
NGINX_CONFIG

    # Replace placeholders
    sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$nginx_config"
    sed -i "s|APP_DIR_PLACEHOLDER|$APP_DIR|g" "$nginx_config"

    # Enable site
    ln -sf "$nginx_config" "/etc/nginx/sites-enabled/$DOMAIN"
    rm -f /etc/nginx/sites-enabled/default

    # Test configuration
    if nginx -t > /dev/null 2>&1; then
        log_success "Nginx configuration is valid"
    else
        log_error "Nginx configuration test failed"
        nginx -t
        exit 1
    fi
}

################################################################################
# STEP 7: SSL Certificate (Production Only)
################################################################################

step_letsencrypt() {
    if [ "$DEPLOY_MODE" != "production" ]; then
        return 0
    fi

    log_step "STEP 7: Setting Up HTTPS with Let's Encrypt"

    mkdir -p /var/www/certbot

    log_info "Starting nginx"
    systemctl start nginx
    systemctl reload nginx

    log_info "Requesting SSL certificate for $DOMAIN"

    if certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --quiet 2>/dev/null; then

        log_success "SSL certificate obtained successfully"

        # Update nginx config with certificate paths
        sed -i "s|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" "/etc/nginx/sites-available/$DOMAIN"
        sed -i "s|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" "/etc/nginx/sites-available/$DOMAIN"

        systemctl reload nginx
        log_success "Nginx updated with Let's Encrypt certificate"
    else
        log_warning "Let's Encrypt certificate request failed"
        log_info "Creating self-signed certificate as fallback"

        mkdir -p "/etc/letsencrypt/live/$DOMAIN"
        openssl req -x509 -newkey rsa:4096 \
            -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
            -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
            -days 365 -nodes -subj "/CN=$DOMAIN" > /dev/null 2>&1

        sed -i "s|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" "/etc/nginx/sites-available/$DOMAIN"
        sed -i "s|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" "/etc/nginx/sites-available/$DOMAIN"

        systemctl reload nginx
        log_warning "Using self-signed certificate (update DNS and retry certbot)"
    fi
}

################################################################################
# STEP 8: Start Services
################################################################################

step_start_services() {
    log_step "STEP 8: Starting Services"

    cd "$APP_DIR"

    if [ "$DEPLOY_MODE" = "production" ]; then
        log_info "Starting ${SERVICE_NAME} service"
        systemctl start "${SERVICE_NAME}"
        sleep 2

        if systemctl is-active --quiet "${SERVICE_NAME}"; then
            log_success "${SERVICE_NAME} service started"
        else
            log_error "${SERVICE_NAME} service failed to start"
            journalctl -u "${SERVICE_NAME}" -n 20
            exit 1
        fi

        log_info "Reloading nginx"
        systemctl reload nginx
        log_success "All services started"
    else
        log_info "Development mode: Service not started automatically"
        log_info "To start the development server, run:"
        log_info "  cd $APP_DIR"
        log_info "  ./.venv/bin/python app.py"
        log_info "Or use the startup script:"
        log_info "  cd $APP_DIR && ./start_ui.sh"
    fi
}

################################################################################
# STEP 9: Verification
################################################################################

step_verification() {
    log_step "STEP 9: Verification"

    if [ "$DEPLOY_MODE" = "production" ]; then
        log_info "Waiting for services to start"
        sleep 3

        log_info "Testing Flask on localhost"
        if curl -s http://127.0.0.1:5555/api/status > /dev/null 2>&1; then
            log_success "Flask API responding"
        else
            log_warning "Flask API not responding yet"
        fi

        log_info "Testing nginx reverse proxy"
        if curl -k -s https://localhost/gw2api/api/status > /dev/null 2>&1; then
            log_success "Nginx reverse proxy working"
        else
            log_warning "Nginx reverse proxy not responding yet"
        fi
    else
        log_info "Development deployment complete"

        # Quick Python syntax check
        if "$VENV_DIR/bin/python" -m py_compile "$APP_DIR/app.py" 2>/dev/null; then
            log_success "Python syntax check passed"
        else
            log_warning "Python syntax check had issues"
        fi
    fi
}

################################################################################
# STEP 10: Monitoring Setup (Production Only)
################################################################################

step_monitoring_setup() {
    if [ "$DEPLOY_MODE" != "production" ]; then
        return 0
    fi

    log_step "STEP 10: Setting Up Monitoring"

    # Create directories
    mkdir -p "$APP_DIR/backups"
    mkdir -p "$APP_DIR/logs"
    mkdir -p "$APP_DIR/scripts"

    # Backup script
    cat > "$APP_DIR/scripts/backup-db.sh" <<'EOF'
#!/bin/bash
BACKUP_DIR="BACKUP_DIR_PLACEHOLDER"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="gw2api_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"
pg_dump -U DB_USER_PLACEHOLDER DB_NAME_PLACEHOLDER | gzip > "$BACKUP_DIR/$FILENAME"
find "$BACKUP_DIR" -name "gw2api_*.sql.gz" -mtime +7 -delete
echo "Backup created: $FILENAME"
EOF

    sed -i "s|BACKUP_DIR_PLACEHOLDER|$APP_DIR/backups|g" "$APP_DIR/scripts/backup-db.sh"
    sed -i "s|DB_USER_PLACEHOLDER|$DB_USER|g" "$APP_DIR/scripts/backup-db.sh"
    sed -i "s|DB_NAME_PLACEHOLDER|$DB_NAME|g" "$APP_DIR/scripts/backup-db.sh"
    chmod +x "$APP_DIR/scripts/backup-db.sh"

    # Health check script
    cat > "$APP_DIR/scripts/health-check.sh" <<'EOF'
#!/bin/bash
set +e

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
SERVICE_NAME_PLACEHOLDER="SERVICE_NAME_PLACEHOLDER"

if ! systemctl is-active --quiet "$SERVICE_NAME_PLACEHOLDER"; then
    echo "[$TIMESTAMP] Service not running, restarting..."
    systemctl start "$SERVICE_NAME_PLACEHOLDER"
fi

if ! curl -f -s http://localhost:5555/api/status > /dev/null 2>&1; then
    echo "[$TIMESTAMP] API not responding, restarting..."
    systemctl restart "$SERVICE_NAME_PLACEHOLDER"
fi
EOF

    sed -i "s|SERVICE_NAME_PLACEHOLDER|$SERVICE_NAME|g" "$APP_DIR/scripts/health-check.sh"
    chmod +x "$APP_DIR/scripts/health-check.sh"

    # Add to crontab
    (crontab -l 2>/dev/null || echo "") | grep -v "gw2api" | \
        (cat; echo "0 2 * * * $APP_DIR/scripts/backup-db.sh >> $APP_DIR/logs/backup.log 2>&1") | \
        (cat; echo "*/5 * * * * $APP_DIR/scripts/health-check.sh >> $APP_DIR/logs/health.log 2>&1") | crontab -

    log_success "Monitoring configured"
}

################################################################################
# Final Summary
################################################################################

step_summary() {
    log_step "Deployment Complete!"

    cat <<EOF

${GREEN}✅ GW2API Deployed Successfully!${NC}

${BLUE}Deployment Information:${NC}
  Mode: ${DEPLOY_MODE}
  Location: $APP_DIR
  Python: $VENV_DIR

EOF

    if [ "$DEPLOY_MODE" = "production" ]; then
        cat <<EOF
${BLUE}Access URLs:${NC}
  Application: https://$DOMAIN/gw2api/
  API Status: https://$DOMAIN/gw2api/api/status

${BLUE}Service Management:${NC}
  Status:  systemctl status ${SERVICE_NAME}
  Logs:    journalctl -u ${SERVICE_NAME} -f
  Restart: systemctl restart ${SERVICE_NAME}

${BLUE}Database:${NC}
  Name: $DB_NAME
  User: $DB_USER
  Password saved in: $APP_DIR/.env.production

${BLUE}Files:${NC}
  Config: $APP_DIR/.env.production
  Service: /etc/systemd/system/${SERVICE_NAME}.service
  Nginx: /etc/nginx/sites-available/$DOMAIN
  Backups: $APP_DIR/backups/
  Logs: $APP_DIR/logs/

${YELLOW}Next Steps:${NC}
  1. Ensure DNS points $DOMAIN to this server
  2. Test: curl https://$DOMAIN/gw2api/api/status
  3. Register first user via web interface
  4. Monitor logs: journalctl -u ${SERVICE_NAME} -f

EOF
    else
        cat <<EOF
${BLUE}Development Mode:${NC}

${YELLOW}To start the server:${NC}
  cd $APP_DIR
  ./start_ui.sh

  Or manually:
  $VENV_DIR/bin/python app.py

${YELLOW}Access:${NC}
  http://localhost:5555

${YELLOW}Configuration:${NC}
  Edit $APP_DIR/.env to add your GW2_API_KEY
  Get API key from: https://account.arena.net/applications

${YELLOW}For production deployment:${NC}
  sudo $0 <domain> <email>

EOF
    fi

    log_success "Deployment script finished!"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo ""
    log_info "GW2API Universal Ubuntu Deployment Script"
    log_info "Mode: ${DEPLOY_MODE}"
    log_info "Directory: $APP_DIR"
    echo ""

    check_ubuntu
    check_root_if_production

    step_install_dependencies
    step_python_setup
    step_create_env_file

    if [ "$DEPLOY_MODE" = "production" ]; then
        step_database_setup
        step_systemd_service
        step_nginx_setup
        step_letsencrypt
        step_monitoring_setup
    fi

    step_start_services
    step_verification
    step_summary
}

# Run main function
main
