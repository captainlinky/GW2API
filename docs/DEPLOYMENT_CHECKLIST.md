# GW2API Multi-Tenant Deployment Checklist

This checklist guides you through deploying GW2API as a multi-tenant cloud service on a VPS.

## Pre-Deployment Preparation

### System Requirements
- [ ] Ubuntu 20.04 LTS or later (Debian 11+ also works)
- [ ] Minimum 1GB RAM (2GB+ recommended)
- [ ] 20GB disk space (for logs and database)
- [ ] Domain name pointing to your VPS
- [ ] Root or sudo access

### Information to Gather
- [ ] Domain name (e.g., `your-domain.com`)
- [ ] VPS IP address
- [ ] SSH key or password for VPS access
- [ ] Email for Let's Encrypt certificate

## Phase 1: System Setup

### 1.1 Update System
```bash
ssh root@your-vps-ip
sudo apt update && sudo apt upgrade -y
```
- [ ] System updated

### 1.2 Install Required Packages
```bash
sudo apt install -y \
    python3 python3-pip python3-venv \
    postgresql postgresql-contrib \
    nginx \
    certbot python3-certbot-nginx \
    git \
    curl wget
```
- [ ] All packages installed

### 1.3 Create Application User
```bash
sudo useradd -m -s /bin/bash gw2api
sudo usermod -aG sudo gw2api
sudo mkdir -p /opt/gw2api
sudo chown gw2api:gw2api /opt/gw2api
```
- [ ] Application user created
- [ ] Directory structure created

## Phase 2: Database Setup

### 2.1 Create PostgreSQL Database
```bash
sudo -u postgres psql
```
Then in PostgreSQL prompt:
```sql
CREATE DATABASE gw2api;
CREATE USER gw2api_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE gw2api TO gw2api_user;
\q
```
- [ ] Database created
- [ ] User created with secure password
- [ ] Permissions granted
- [ ] Strong password stored securely

### 2.2 Apply Database Schema
```bash
sudo -u postgres psql gw2api < /opt/gw2api/app/schema.sql
```
- [ ] Schema applied successfully
- [ ] Tables created
- [ ] Indexes created

### 2.3 Verify Database
```bash
sudo -u postgres psql gw2api -c "\dt"
```
- [ ] All tables visible
- [ ] Schema looks correct

## Phase 3: Application Setup

### 3.1 Clone Repository
```bash
sudo su - gw2api
cd /opt/gw2api
git clone YOUR_REPO_URL app
cd app
```
- [ ] Repository cloned

### 3.2 Create Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
- [ ] Virtual environment created
- [ ] Dependencies installed

### 3.3 Generate Security Keys
```bash
python3 << 'EOF'
import secrets
from cryptography.fernet import Fernet

print("=== Security Keys ===")
print("\nJWT_SECRET_KEY:")
print(secrets.token_hex(32))
print("\nSECRET_KEY:")
print(secrets.token_hex(32))
print("\nAPI_KEY_ENCRYPTION_KEY:")
print(Fernet.generate_key().decode())
EOF
```
- [ ] JWT_SECRET_KEY generated and noted
- [ ] SECRET_KEY generated and noted
- [ ] API_KEY_ENCRYPTION_KEY generated and noted

### 3.4 Create Production Environment File
Create `/opt/gw2api/app/.env.production`:
```bash
# Database
DATABASE_URL=postgresql://gw2api_user:YOUR_PASSWORD@localhost/gw2api

# Security (from step 3.3)
JWT_SECRET_KEY=<your-generated-key>
SECRET_KEY=<your-generated-key>
API_KEY_ENCRYPTION_KEY=<your-generated-key>

# Flask
FLASK_ENV=production
FLASK_DEBUG=False

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60

# Server
HOST=0.0.0.0
PORT=5555

# Application Prefix
APP_PREFIX=/gw2
```
- [ ] .env.production created
- [ ] All keys added
- [ ] Secure passwords used
- [ ] File permissions: chmod 600 .env.production

## Phase 4: Systemd Service Setup

### 4.1 Create Systemd Service File
Copy `gw2api.service` to `/etc/systemd/system/`:
```bash
sudo cp /opt/gw2api/app/gw2api.service /etc/systemd/system/
```
- [ ] Service file copied

### 4.2 Create Log Directory
```bash
sudo mkdir -p /opt/gw2api/logs
sudo chown gw2api:gw2api /opt/gw2api/logs
sudo chmod 755 /opt/gw2api/logs
```
- [ ] Log directory created with correct permissions

### 4.3 Enable and Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable gw2api
sudo systemctl start gw2api
sudo systemctl status gw2api
```
- [ ] Service enabled for auto-start
- [ ] Service started successfully
- [ ] Status shows "active (running)"

### 4.4 Test Service
```bash
curl http://localhost:5555/api/status
```
- [ ] API responding on localhost:5555

## Phase 5: Nginx Setup

### 5.1 Configure Nginx
Copy `nginx-gw2api.conf` to `/etc/nginx/sites-available/`:
```bash
sudo cp /opt/gw2api/app/nginx-gw2api.conf /etc/nginx/sites-available/your-domain
```
- [ ] Nginx config copied
- [ ] Config updated with your domain name

### 5.2 Update Flask App for Proxy
In `/opt/gw2api/app/app.py`, add after Flask initialization:
```python
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
```
- [ ] ProxyFix middleware added to app.py

### 5.3 Enable Nginx Site
```bash
sudo ln -s /etc/nginx/sites-available/your-domain /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Optional
```
- [ ] Site symlink created

### 5.4 Test Nginx Configuration
```bash
sudo nginx -t
```
- [ ] Nginx configuration is valid

### 5.5 Restart Nginx
```bash
sudo systemctl restart nginx
sudo systemctl status nginx
```
- [ ] Nginx restarted
- [ ] Status shows "active (running)"

### 5.6 Test HTTP Access
```bash
curl http://your-domain.com/gw2/api/status
```
- [ ] API accessible via domain
- [ ] Returns valid JSON response

## Phase 6: SSL Certificate Setup

### 6.1 Obtain Certificate with Let's Encrypt
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```
Follow the prompts:
- [ ] Email provided
- [ ] Terms accepted
- [ ] Certificate obtained
- [ ] Nginx config auto-updated

### 6.2 Verify SSL
```bash
curl https://your-domain.com/gw2/api/status
```
- [ ] HTTPS works
- [ ] Redirect from HTTP to HTTPS works

### 6.3 Test Auto-Renewal
```bash
sudo certbot renew --dry-run
```
- [ ] Auto-renewal configured correctly

## Phase 7: Monitoring and Backups

### 7.1 Set Up Database Backups
```bash
sudo chmod +x /opt/gw2api/app/scripts/backup-db.sh
sudo cp /opt/gw2api/app/scripts/backup-db.sh /opt/gw2api/scripts/
```

Add to crontab:
```bash
sudo crontab -e
# Add line: 0 2 * * * /opt/gw2api/scripts/backup-db.sh
```
- [ ] Backup script in place
- [ ] Cron job configured for daily backups

### 7.2 Set Up Health Check
```bash
sudo chmod +x /opt/gw2api/app/scripts/health-check.sh
```

Add to crontab:
```bash
sudo crontab -e
# Add line: */5 * * * * /opt/gw2api/scripts/health-check.sh >> /opt/gw2api/logs/health-check.log 2>&1
```
- [ ] Health check script in place
- [ ] Cron job configured

### 7.3 Set Up Log Rotation
```bash
sudo cp /opt/gw2api/app/logrotate.conf /etc/logrotate.d/gw2api
```
- [ ] Log rotation configured

## Phase 8: Application Testing

### 8.1 Create Test User
```bash
curl -X POST https://your-domain.com/gw2/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123"}'
```
- [ ] Registration endpoint works
- [ ] Token received
- [ ] Token saved for next tests

### 8.2 Test Login
```bash
curl -X POST https://your-domain.com/gw2/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123"}'
```
- [ ] Login endpoint works
- [ ] Token received
- [ ] Tokens match format

### 8.3 Add API Key
```bash
TOKEN="<from-login-response>"

curl -X POST https://your-domain.com/gw2/api/user/api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"api_key": "YOUR-GW2-API-KEY", "name": "Main Key"}'
```
- [ ] API key endpoint works
- [ ] GW2 API key validated
- [ ] Key stored successfully

### 8.4 Test Protected Endpoint
```bash
TOKEN="<from-login-response>"

curl https://your-domain.com/gw2/api/account \
  -H "Authorization: Bearer $TOKEN"
```
- [ ] Account data returned
- [ ] User-scoped data visible

## Phase 9: Monitoring and Verification

### 9.1 Check Application Logs
```bash
sudo journalctl -u gw2api -n 50
tail -f /opt/gw2api/logs/app.log
```
- [ ] No errors in logs
- [ ] Service logging properly

### 9.2 Check System Resources
```bash
top -u gw2api
df -h
free -h
```
- [ ] CPU usage reasonable
- [ ] Memory usage reasonable
- [ ] Disk space available

### 9.3 Database Verification
```bash
sudo -u postgres psql gw2api -c "SELECT COUNT(*) FROM users;"
```
- [ ] Database accessible
- [ ] Test user visible
- [ ] No errors

### 9.4 Monitor 24 Hours
- [ ] No errors in first hour
- [ ] Background tracking working (check logs for [TRACKING])
- [ ] No crashes or restarts
- [ ] Database backup completed

## Phase 10: Security Hardening

### 10.1 Firewall Configuration
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```
- [ ] Firewall configured
- [ ] Only needed ports open

### 10.2 SSH Security
```bash
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no (if using keys)
sudo systemctl restart ssh
```
- [ ] Root login disabled
- [ ] Password auth disabled (key-based only)

### 10.3 File Permissions
```bash
sudo chmod 600 /opt/gw2api/app/.env.production
sudo chmod 700 /opt/gw2api
sudo chmod 700 /opt/gw2api/backups
```
- [ ] Sensitive files protected
- [ ] Only gw2api user can read .env

### 10.4 Database Permissions
```bash
sudo -u postgres psql -c "ALTER USER gw2api_user WITH PASSWORD 'NEW_SECURE_PASSWORD';"
```
- [ ] Database password confirmed secure

## Troubleshooting

### Service Won't Start
```bash
sudo journalctl -u gw2api -n 100
cat /opt/gw2api/app/.env.production
# Check DATABASE_URL, keys, etc.
```

### API Not Responding
```bash
curl http://localhost:5555/api/status  # Direct
curl https://your-domain.com/gw2/api/status  # Via nginx
sudo systemctl status gw2api
```

### Database Connection Issues
```bash
sudo -u postgres psql gw2api -c "SELECT 1;"
echo "postgresql://gw2api_user:password@localhost/gw2api" | psql
```

### SSL Certificate Issues
```bash
sudo certbot certificates
sudo certbot renew --force-renewal
```

## Post-Deployment

- [ ] Document your domain for team
- [ ] Create admin user for management
- [ ] Test user registration and login flow
- [ ] Test GW2 API key addition
- [ ] Monitor logs for 48 hours
- [ ] Set up external monitoring (Uptime Robot, etc.)
- [ ] Create runbook for common operations
- [ ] Document backup/restore procedures
- [ ] Schedule security updates (weekly review of logs)

## Maintenance Tasks

### Daily
- [ ] Check health check logs: `tail -f /opt/gw2api/logs/health-check.log`

### Weekly
- [ ] Review application logs for errors
- [ ] Verify backups are being created
- [ ] Check disk usage

### Monthly
- [ ] Review security logs
- [ ] Update system packages: `sudo apt update && sudo apt upgrade`
- [ ] Test restore from backup
- [ ] Review user accounts and permissions

## Success Criteria

Your deployment is successful when:
- ✅ HTTPS works (no certificate warnings)
- ✅ User registration works
- ✅ User login works
- ✅ API key validation works
- ✅ Protected endpoints require authentication
- ✅ Background tracking thread running (check logs)
- ✅ Database backups working
- ✅ Health checks passing
- ✅ No errors in logs after 24 hours
- ✅ System resources stable
