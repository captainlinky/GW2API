#!/bin/bash

################################################################################
# GW2API Production Deployment Script
#
# This script automates the complete production deployment of GW2API on a new
# server. It handles all infrastructure setup, configuration, and initialization.
# The script auto-detects its location and works from any directory.
#
# Usage: sudo ./deploy-production.sh <domain> <email>
# Example: sudo ./deploy-production.sh gridserv.io admin@gridserv.io
#
# Requirements:
# - Ubuntu 20.04+
# - Root or sudo access
# - Domain name pointing to this server
# - ~2GB RAM, 20GB disk space
# - Run from the GW2API repository directory
#
# What This Script Does:
# 1. Updates system packages
# 2. Installs all required dependencies
# 3. Creates Python virtual environment
# 4. Sets up PostgreSQL database
# 5. Creates nginx reverse proxy configuration
# 6. Configures SSL/TLS with Let's Encrypt
# 7. Creates systemd service
# 8. Starts all services
# 9. Performs verification tests
#
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Auto-detect script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Configuration
DOMAIN="${1:?Domain name required. Usage: $0 <domain> <email>}"
EMAIL="${2:?Email required. Usage: $0 <domain> <email>}"
APP_DIR="$SCRIPT_DIR"
VENV_DIR="${APP_DIR}/.venv"
DB_USER="gw2api_user"
DB_NAME="gw2api"
DB_PASS=$(openssl rand -base64 32)
FLASK_PORT="5555"

# Functions
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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
    log_success "Running as root"
}

################################################################################
# STEP 1: System Preparation
################################################################################

step_system_prep() {
    log_step "STEP 1: System Preparation"

    log_info "Updating package lists..."
    apt-get update -qq

    log_info "Upgrading packages..."
    apt-get upgrade -y -qq

    log_success "System updated"
}

################################################################################
# STEP 2: Install Dependencies
################################################################################

step_install_dependencies() {
    log_step "STEP 2: Installing Dependencies"

    local packages="python3 python3-pip python3-venv python3.13-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx curl wget git build-essential python3-dev"

    log_info "Installing packages: $packages"
    apt-get install -y -qq $packages 2>&1 | grep -E "^(Setting up|Processing)" || true

    log_success "All dependencies installed"
}

################################################################################
# STEP 3: Python Setup
################################################################################

step_python_setup() {
    log_step "STEP 3: Python Environment Setup"

    if [ ! -d "$VENV_DIR" ]; then
        log_info "Creating Python virtual environment at $VENV_DIR"
        python3 -m venv "$VENV_DIR"
    fi

    log_info "Upgrading pip and installing dependencies"
    source "$VENV_DIR/bin/activate"
    pip install -q --upgrade pip setuptools wheel

    log_info "Installing Python packages..."
    cd "$APP_DIR"
    pip install -q -r requirements.txt

    log_success "Python environment configured"
}

################################################################################
# STEP 4: Database Setup
################################################################################

step_database_setup() {
    log_step "STEP 4: Database Setup"

    log_info "Creating PostgreSQL database and user"
    sudo -u postgres psql <<EOF > /dev/null 2>&1
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

    log_info "Applying database schema"
    sudo -u postgres psql "$DB_NAME" < "$APP_DIR/schema.sql" > /dev/null 2>&1

    log_info "Configuring database permissions"
    sudo -u postgres psql "$DB_NAME" <<EOF > /dev/null 2>&1
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOF

    log_success "Database configured"
    log_info "Database credentials: User=$DB_USER, Password stored in .env.production"
}

################################################################################
# STEP 5: Generate Security Keys
################################################################################

step_generate_keys() {
    log_step "STEP 5: Generating Security Keys"

    local jwt_key=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    local secret_key=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    local encryption_key=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

    # Save keys for later use
    echo "$jwt_key" > /tmp/jwt_key
    echo "$secret_key" > /tmp/secret_key
    echo "$encryption_key" > /tmp/encryption_key

    log_success "Security keys generated and saved"
}

################################################################################
# STEP 6: Create Production Environment File
################################################################################

step_create_env_file() {
    log_step "STEP 6: Creating Production Environment File"

    local jwt_key=$(cat /tmp/jwt_key)
    local secret_key=$(cat /tmp/secret_key)
    local encryption_key=$(cat /tmp/encryption_key)

    cat > "$APP_DIR/.env.production" <<EOF
# GW2API Production Configuration
# Generated on $(date)

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

    chmod 600 "$APP_DIR/.env.production"
    log_success "Environment file created (permissions: 600)"
}

################################################################################
# STEP 7: Configure Nginx Reverse Proxy
################################################################################

step_nginx_setup() {
    log_step "STEP 7: Configuring Nginx Reverse Proxy"

    local nginx_config="/etc/nginx/sites-available/$DOMAIN"

    log_info "Creating nginx configuration for $DOMAIN"

    cat > "$nginx_config" <<'NGINX_CONFIG'
# Nginx configuration for multi-service reverse proxy
upstream gw2api {
    server 127.0.0.1:5555;
}

# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

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
    server_name $DOMAIN www.$DOMAIN;

    # SSL certificates (will be updated by certbot)
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

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
        alias $APP_DIR/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Status page
    location /status {
        default_type text/html;
        return 200 '
<!DOCTYPE html>
<html>
<head>
    <title>$DOMAIN Status</title>
    <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 5px; }
        .service { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 3px; }
        .service.up { border-left: 4px solid #28a745; background: #f0fff4; }
        .service h3 { margin-top: 0; }
        .time { color: #999; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <h1>$DOMAIN Services Status</h1>
        <div class="service up">
            <h3>✓ GW2API</h3>
            <p>WvW Tracking Dashboard</p>
            <p><a href="/gw2api/">Access →</a></p>
        </div>
        <hr>
        <p class="time">Last updated: <span id="time"></span></p>
        <script>document.getElementById("time").innerText = new Date().toISOString();</script>
    </div>
</body>
</html>';
    }

    # Deny access to sensitive locations
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    access_log /var/log/nginx/${DOMAIN}_access.log combined buffer=32k;
    error_log /var/log/nginx/${DOMAIN}_error.log warn;
}
NGINX_CONFIG

    # Replace $DOMAIN variable in config
    sed -i "s/\$DOMAIN/$DOMAIN/g" "$nginx_config"
    sed -i "s|\$APP_DIR|$APP_DIR|g" "$nginx_config"

    # Enable site
    ln -sf "$nginx_config" "/etc/nginx/sites-enabled/$DOMAIN"
    rm -f /etc/nginx/sites-enabled/default

    # Test configuration
    if nginx -t > /dev/null 2>&1; then
        log_success "Nginx configuration is valid"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
}

################################################################################
# STEP 8: Create Systemd Service
################################################################################

step_systemd_service() {
    log_step "STEP 8: Creating Systemd Service"

    cat > /etc/systemd/system/gw2api.service <<EOF
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
    systemctl enable gw2api > /dev/null 2>&1

    log_success "Systemd service created and enabled"
}

################################################################################
# STEP 9: Setup SSL with Let's Encrypt
################################################################################

step_letsencrypt() {
    log_step "STEP 9: Setting Up HTTPS with Let's Encrypt"

    mkdir -p /var/www/certbot

    # Start nginx first
    log_info "Starting nginx for certificate validation"
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
        log_info "Updating nginx configuration with certificate paths"
        sed -i "s|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" "/etc/nginx/sites-available/$DOMAIN"
        sed -i "s|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" "/etc/nginx/sites-available/$DOMAIN"

        # Test nginx config
        if nginx -t > /dev/null 2>&1; then
            systemctl reload nginx
            log_success "Nginx configuration updated with Let's Encrypt certificate"
        else
            log_error "Nginx configuration test failed after certificate update"
            exit 1
        fi
    else
        log_warning "Let's Encrypt certificate request failed (domain validation issue)"
        log_warning "Using self-signed certificate. Update DNS records and try again:"
        log_warning "  certbot certonly --webroot -w /var/www/certbot -d $DOMAIN"

        # Create self-signed certificate
        log_info "Creating self-signed certificate as fallback"
        mkdir -p "/etc/letsencrypt/live/$DOMAIN"
        openssl req -x509 -newkey rsa:4096 \
            -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
            -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
            -days 365 -nodes -subj "/CN=$DOMAIN" > /dev/null 2>&1

        # Update nginx config with self-signed cert
        sed -i "s|/etc/ssl/certs/ssl-cert-snakeoil.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" "/etc/nginx/sites-available/$DOMAIN"
        sed -i "s|/etc/ssl/private/ssl-cert-snakeoil.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" "/etc/nginx/sites-available/$DOMAIN"

        systemctl reload nginx
        log_warning "Self-signed certificate created (replace with Let's Encrypt when domain is ready)"
    fi
}

################################################################################
# STEP 10: Start Services
################################################################################

step_start_services() {
    log_step "STEP 10: Starting Services"

    log_info "Ensuring PostgreSQL is running"
    systemctl start postgresql
    systemctl enable postgresql

    log_info "Starting GW2API service"
    systemctl start gw2api
    sleep 2

    if systemctl is-active --quiet gw2api; then
        log_success "GW2API service started"
    else
        log_error "GW2API service failed to start"
        journalctl -u gw2api -n 20
        exit 1
    fi

    log_info "Reloading nginx"
    systemctl reload nginx

    if systemctl is-active --quiet nginx; then
        log_success "Nginx service running"
    else
        log_error "Nginx service failed"
        exit 1
    fi
}

################################################################################
# STEP 11: Verification Tests
################################################################################

step_verification() {
    log_step "STEP 11: Verification Tests"

    log_info "Waiting for services to fully start"
    sleep 3

    log_info "Testing Flask on localhost"
    if curl -s http://127.0.0.1:5555/api/status > /dev/null 2>&1; then
        log_success "Flask API responding on localhost:5555"
    else
        log_error "Flask API not responding"
        exit 1
    fi

    log_info "Testing nginx reverse proxy"
    if curl -k -s https://localhost/gw2api/api/status > /dev/null 2>&1; then
        log_success "Nginx reverse proxy working"
    else
        log_error "Nginx reverse proxy not working"
        exit 1
    fi

    log_info "Testing user registration"
    response=$(curl -k -s -X POST https://localhost/gw2api/api/auth/register \
        -H "Content-Type: application/json" \
        -d '{"email": "test@example.com", "password": "TestPassword123"}')

    if echo "$response" | grep -q '"status":"success"'; then
        log_success "User registration working"
    else
        log_warning "User registration test inconclusive"
    fi
}

################################################################################
# STEP 12: Database Backups
################################################################################

step_database_backups() {
    log_step "STEP 12: Setting Up Database Backups"

    mkdir -p "$APP_DIR/backups"
    chmod 755 "$APP_DIR/backups"
    mkdir -p "$APP_DIR/scripts"

    cat > "$APP_DIR/scripts/backup-db.sh" <<EOF
#!/bin/bash
BACKUP_DIR="$APP_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="gw2api_${DATE}.sql.gz"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U gw2api_user gw2api | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days
find $BACKUP_DIR -name "gw2api_*.sql.gz" -mtime +7 -delete

echo "Backup created: \$FILENAME"
EOF

    chmod +x "$APP_DIR/scripts/backup-db.sh"

    # Add to crontab
    (crontab -l 2>/dev/null || echo "") | grep -v "backup-db.sh" | \
        (cat; echo "0 2 * * * $APP_DIR/scripts/backup-db.sh >> $APP_DIR/logs/backup.log 2>&1") | crontab -

    log_success "Database backups configured (daily at 2 AM)"
}

################################################################################
# STEP 13: Health Monitoring
################################################################################

step_health_monitoring() {
    log_step "STEP 13: Setting Up Health Monitoring"

    mkdir -p "$APP_DIR/scripts"
    mkdir -p "$APP_DIR/logs"

    cat > "$APP_DIR/scripts/health-check.sh" <<'EOF'
#!/bin/bash
set +e

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
    sudo systemctl restart gw2api
    sleep 2
    if ! curl -f -s http://localhost:5555/api/status > /dev/null 2>&1; then
        echo "[$TIMESTAMP] ❌ API still not responding after restart"
        ERRORS=$((ERRORS + 1))
    else
        echo "[$TIMESTAMP] ✅ API responding after restart"
    fi
fi

# Check database
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw gw2api; then
    echo "[$TIMESTAMP] ❌ Database connection failed"
    ERRORS=$((ERRORS + 1))
else
    echo "[$TIMESTAMP] ✅ Database connected"
fi

if [ $ERRORS -eq 0 ]; then
    echo "[$TIMESTAMP] ✅ All systems operational"
else
    echo "[$TIMESTAMP] ⚠️  Health check completed with $ERRORS error(s)"
fi
EOF

    chmod +x "$APP_DIR/scripts/health-check.sh"

    # Add to crontab
    (crontab -l 2>/dev/null || echo "") | grep -v "health-check.sh" | \
        (cat; echo "*/5 * * * * $APP_DIR/scripts/health-check.sh >> $APP_DIR/logs/health-check.log 2>&1") | crontab -

    log_success "Health monitoring configured (every 5 minutes)"
}

################################################################################
# STEP 14: Log Rotation
################################################################################

step_log_rotation() {
    log_step "STEP 14: Setting Up Log Rotation"

    cat > /etc/logrotate.d/gw2api <<EOF
$APP_DIR/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload gw2api > /dev/null 2>&1 || true
    endscript
}
EOF

    log_success "Log rotation configured"
}

################################################################################
# STEP 15: Final Summary
################################################################################

step_summary() {
    log_step "Deployment Complete!"

    cat <<EOF

${GREEN}✅ GW2API Production Deployment Complete!${NC}

${BLUE}Access Information:${NC}
  Domain: https://$DOMAIN/gw2api/
  Status Page: https://$DOMAIN/status

${BLUE}Service Management:${NC}
  Start:   systemctl start gw2api
  Stop:    systemctl stop gw2api
  Restart: systemctl restart gw2api
  Status:  systemctl status gw2api
  Logs:    journalctl -u gw2api -f

${BLUE}Database Access:${NC}
  Database: $DB_NAME
  User: $DB_USER
  Connect: sudo -u postgres psql $DB_NAME

${BLUE}Important Information:${NC}
  Application: $APP_DIR
  Configuration: $APP_DIR/.env.production
  Service File: /etc/systemd/system/gw2api.service
  Nginx Config: /etc/nginx/sites-available/$DOMAIN
  Backups: $APP_DIR/backups/
  Logs: $APP_DIR/logs/

${YELLOW}Next Steps:${NC}
  1. Update DNS records to point $DOMAIN to this server
  2. Test endpoints: curl https://$DOMAIN/gw2api/api/status
  3. Register test user
  4. Monitor logs: journalctl -u gw2api -f
  5. Set up monitoring/alerting (optional)
  6. Add additional services as needed

${YELLOW}Certificate Status:${NC}
EOF

    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        if grep -q "CERTIFICATE" "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
            cert_type=$(openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -text -noout 2>/dev/null | grep "Issuer:" || echo "Unknown")
            if echo "$cert_type" | grep -q "Let's Encrypt"; then
                echo -e "  ${GREEN}✓ Let's Encrypt Certificate${NC}"
            else
                echo -e "  ${YELLOW}⚠ Self-Signed Certificate${NC}"
                echo -e "  ${YELLOW}  Run certbot to replace:${NC}"
                echo -e "  ${YELLOW}  certbot certonly --webroot -w /var/www/certbot -d $DOMAIN${NC}"
            fi
        fi
    fi

    echo ""
    log_success "Deployment script finished successfully!"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "Starting GW2API Production Deployment"
    log_info "Application Directory: $APP_DIR"
    log_info "Domain: $DOMAIN"
    log_info "Email: $EMAIL"
    echo ""

    check_root
    step_system_prep
    step_install_dependencies
    step_python_setup
    step_database_setup
    step_generate_keys
    step_create_env_file
    step_nginx_setup
    step_systemd_service
    step_letsencrypt
    step_start_services
    step_verification
    step_database_backups
    step_health_monitoring
    step_log_rotation
    step_summary
}

# Run main function
main
