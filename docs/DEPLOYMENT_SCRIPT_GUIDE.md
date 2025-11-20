# GW2API Deployment Script Guide

Complete documentation for the automated `deploy-production.sh` script.

## Overview

The `deploy-production.sh` script is a comprehensive, production-ready deployment automation tool that handles the complete setup of GW2API on a fresh Ubuntu server. It performs 14+ steps automatically with minimal manual intervention.

**Features:**
- ✅ Fully automated end-to-end deployment
- ✅ Comprehensive error handling and validation
- ✅ Let's Encrypt SSL certificate integration
- ✅ PostgreSQL database setup and configuration
- ✅ Nginx reverse proxy with security headers
- ✅ Systemd service management
- ✅ Automatic database backups
- ✅ Health monitoring and alerting
- ✅ Log rotation
- ✅ Detailed progress output
- ✅ Verification tests included

## Requirements

### System Requirements
- **OS:** Ubuntu 20.04 LTS or later (or Debian 11+)
- **RAM:** Minimum 2GB (4GB+ recommended)
- **Disk Space:** Minimum 20GB
- **CPU:** 1 core minimum (2+ recommended)
- **Network:** Public IP address

### Access Requirements
- **SSH Access:** Root or sudo privileges
- **Network:** Port 80 and 443 must be open
- **DNS:** Domain name must be registered and pointing to server

### Prerequisites
1. Fresh Ubuntu installation (recommended)
2. Domain name registered (e.g., gridserv.io)
3. Valid email address for SSL certificates
4. SSH key configured (recommended)
5. Git installed (if cloning from repository)

## Installation

### Step 1: Get the Script

**Option A: Clone from Repository**
```bash
git clone <repository-url> /tmp/gw2api
cd /tmp/gw2api
chmod +x deploy-production.sh
```

**Option B: Download from Existing Installation**
```bash
scp user@existing-server:/home/GW2API/GW2API/deploy-production.sh .
chmod +x deploy-production.sh
```

**Option C: Copy from Repository Files**
The script is located at `/home/GW2API/GW2API/deploy-production.sh`

### Step 2: Prepare Configuration

Before running the script, ensure you have:
- Domain name: `your-domain.io`
- Email address: `admin@your-domain.io`
- DNS records pointing domain to server IP

## Usage

### Basic Syntax

```bash
sudo bash deploy-production.sh <domain> <email>
```

### Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `domain` | Domain name for your server | `gridserv.io` |
| `email` | Email for Let's Encrypt SSL | `admin@gridserv.io` |

### Examples

**Example 1: Basic Deployment**
```bash
sudo bash deploy-production.sh gridserv.io admin@gridserv.io
```

**Example 2: Different Domain**
```bash
sudo bash deploy-production.sh myapp.com support@myapp.com
```

**Example 3: Subdomain**
```bash
sudo bash deploy-production.sh api.example.com admin@example.com
```

### Running the Script

```bash
# SSH into your server
ssh root@your-server-ip

# Navigate to script location (if not already there)
cd /tmp/gw2api

# Run the deployment
sudo bash deploy-production.sh gridserv.io admin@gridserv.io

# The script will run for approximately 5-10 minutes
# Watch the colored output for progress
```

## What the Script Does

### Phase 1: System Preparation (Step 1)
- Updates package lists
- Upgrades system packages
- Ensures system is ready for installation

### Phase 2: Dependencies (Step 2)
Installs:
- Python 3 and development tools
- PostgreSQL 14+
- Nginx web server
- Certbot for SSL/TLS
- Build tools for Python packages

### Phase 3: Python Setup (Step 3)
- Creates Python virtual environment
- Upgrades pip and setuptools
- Installs all dependencies from requirements.txt
- Configures Python environment

### Phase 4: Database Setup (Step 4)
- Creates PostgreSQL user: `gw2api_user`
- Creates database: `gw2api`
- Applies database schema (8 tables)
- Configures user permissions

### Phase 5: Security Keys (Step 5)
Generates:
- JWT_SECRET_KEY (32-byte random hex)
- SECRET_KEY (32-byte random hex)
- API_KEY_ENCRYPTION_KEY (Fernet key)

### Phase 6: Environment Configuration (Step 6)
Creates `.env.production` with:
- Database connection string
- Security keys
- Flask configuration
- Rate limiting settings
- Server configuration
- File permissions: 600 (read-only by root)

### Phase 7: Nginx Setup (Step 7)
- Creates nginx configuration for domain
- Sets up reverse proxy to Flask (127.0.0.1:5555)
- Configures HTTP → HTTPS redirect
- Adds security headers
- Creates status page
- Enables site and tests configuration

### Phase 8: Systemd Service (Step 8)
- Creates `/etc/systemd/system/gw2api.service`
- Configures auto-start on boot
- Sets up auto-restart on failure
- Configures logging to systemd journal

### Phase 9: SSL/TLS Setup (Step 9)
**Primary:**
- Requests Let's Encrypt certificate
- Validates domain ownership
- Updates nginx with certificate paths
- Enables HTTPS

**Fallback (if Let's Encrypt fails):**
- Creates self-signed certificate
- Configures for HTTPS
- Provides instructions to upgrade

### Phase 10: Start Services (Step 10)
- Starts PostgreSQL
- Starts GW2API (via systemd)
- Starts Nginx
- Verifies all services are running

### Phase 11: Verification (Step 11)
- Tests Flask API on localhost
- Tests nginx reverse proxy
- Tests user registration endpoint
- Confirms all systems working

### Phase 12: Database Backups (Step 12)
- Creates backup script: `/opt/gw2api/scripts/backup-db.sh`
- Configures daily backups at 2 AM
- 7-day retention policy
- Automatic cleanup of old backups

### Phase 13: Health Monitoring (Step 13)
- Creates health check script: `/opt/gw2api/scripts/health-check.sh`
- Configures to run every 5 minutes
- Automatically restarts failed services
- Logs results to `/opt/gw2api/logs/health-check.log`

### Phase 14: Log Rotation (Step 14)
- Configures logrotate for application logs
- Daily rotation
- 7-day retention
- Automatic compression
- Post-rotation service reload

### Phase 15: Summary (Step 15)
- Displays final configuration summary
- Shows access information
- Provides next steps
- Lists important file locations

## Output and Logging

### Console Output

The script provides colored output for easy reading:

```
[INFO]    - Information messages (blue)
[✓]       - Success messages (green)
[ERROR]   - Error messages (red)
[WARNING] - Warning messages (yellow)
========  - Section headers (blue)
```

### Log Files

After deployment, logs are stored in:
- **Application:** `journalctl -u gw2api -f`
- **Nginx Errors:** `/var/log/nginx/your-domain_error.log`
- **Nginx Access:** `/var/log/nginx/your-domain_access.log`
- **Health Check:** `/opt/gw2api/logs/health-check.log`
- **Backups:** `/opt/gw2api/backups/`

## Configuration Files Created

### Application Configuration
- **Location:** `/home/GW2API/GW2API/.env.production`
- **Permissions:** 600 (read-only by root)
- **Contains:** Database URL, security keys, Flask config

### Systemd Service
- **Location:** `/etc/systemd/system/gw2api.service`
- **Type:** Simple service with auto-restart
- **User:** root
- **Restart Policy:** On failure (10s delay)

### Nginx Configuration
- **Location:** `/etc/nginx/sites-available/your-domain.io`
- **Enabled:** `/etc/nginx/sites-enabled/your-domain.io`
- **Features:** HTTPS, security headers, reverse proxy, status page

### SSL Certificate
- **Location:** `/etc/letsencrypt/live/your-domain.io/`
- **Files:**
  - `fullchain.pem` - Server certificate + chain
  - `privkey.pem` - Private key
- **Auto-renewal:** Via certbot (30 days before expiration)

### Database Configuration
- **Database:** gw2api
- **User:** gw2api_user
- **Password:** Auto-generated and stored in .env.production
- **Schema:** 8 tables with proper indexes

### Backup Script
- **Location:** `/opt/gw2api/scripts/backup-db.sh`
- **Frequency:** Daily at 2 AM (via crontab)
- **Retention:** 7 days
- **Location:** `/opt/gw2api/backups/`

### Health Check Script
- **Location:** `/opt/gw2api/scripts/health-check.sh`
- **Frequency:** Every 5 minutes (via crontab)
- **Actions:** Restart failed services, log status

## Success Indicators

The script is successful when:

✅ All steps complete without errors
✅ No [ERROR] messages in output
✅ Final summary shows all services running
✅ API responds to status check
✅ User registration test succeeds
✅ HTTPS certificate is installed (Let's Encrypt or self-signed)

## Common Issues and Solutions

### "Domain validation failed"

**Issue:** Let's Encrypt cannot validate domain ownership

**Solution 1:** Check DNS records
```bash
nslookup your-domain.io
# Should show your server IP
```

**Solution 2:** Wait for DNS propagation
```bash
# DNS changes can take up to 24 hours
# Meanwhile, script creates self-signed certificate
```

**Solution 3:** Retry Let's Encrypt after DNS is set
```bash
certbot certonly --webroot -w /var/www/certbot \
  -d your-domain.io --non-interactive --agree-tos \
  --email your-email@example.com
```

### "Address already in use"

**Issue:** Port 80 or 443 already occupied

**Solution:** Check what's using the ports
```bash
sudo netstat -tlnp | grep -E ':(80|443|5555)'
# Stop the conflicting service or use different ports
```

### "PostgreSQL connection failed"

**Issue:** Database not created properly

**Solution:** Verify PostgreSQL is running
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT 1;"
# Check /home/GW2API/GW2API/.env.production for correct credentials
```

### "Flask not responding"

**Issue:** Flask application didn't start

**Solution:** Check service logs
```bash
sudo journalctl -u gw2api -n 50
# Look for error messages
sudo systemctl restart gw2api
```

## Automation and Unattended Deployment

### Using in CI/CD Pipeline

```bash
#!/bin/bash
set -e

# Variables from environment
DOMAIN=$DEPLOY_DOMAIN
EMAIL=$DEPLOY_EMAIL
REPO=$REPO_URL

# Clone repo
git clone $REPO /opt/gw2api-temp
cd /opt/gw2api-temp

# Run deployment
sudo bash deploy-production.sh $DOMAIN $EMAIL

# Perform post-deployment tests
curl -k https://$DOMAIN/gw2api/api/status

echo "✅ Deployment successful"
```

### Scheduled Deployment

```bash
# Deploy at specific time
at 2:00 AM tomorrow <<EOF
cd /tmp/gw2api && sudo bash deploy-production.sh gridserv.io admin@gridserv.io
EOF
```

### Scripted Deployment with Multiple Servers

```bash
#!/bin/bash

servers=(
  "server1.example.com:root"
  "server2.example.com:root"
  "server3.example.com:root"
)

for server in "${servers[@]}"; do
  host=$(echo $server | cut -d: -f1)
  user=$(echo $server | cut -d: -f2)

  echo "Deploying to $host..."
  ssh $user@$host 'cd /tmp && bash deploy-production.sh '$DOMAIN' '$EMAIL
done
```

## Post-Deployment Tasks

### Immediate (Day 1)

1. **Verify Services**
   ```bash
   systemctl status gw2api postgresql nginx
   ```

2. **Test Endpoints**
   ```bash
   curl https://your-domain.io/gw2api/api/status
   curl -k -X POST https://your-domain.io/gw2api/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"TestPass123"}'
   ```

3. **Monitor Logs**
   ```bash
   sudo journalctl -u gw2api -f
   ```

4. **Check Certificate**
   ```bash
   sudo openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -dates
   ```

### Short Term (Week 1)

1. **Security Hardening**
   - Configure firewall
   - Set SSH key-based auth only
   - Disable password authentication

2. **Monitoring**
   - Set up external monitoring (Uptime Robot, etc.)
   - Configure email alerts
   - Monitor disk usage

3. **Backups**
   - Verify backups are being created
   - Test restore procedure
   - Consider cloud backup

### Medium Term (Month 1)

1. **Frontend Integration**
   - Deploy web UI
   - Test login workflow
   - Configure API key management

2. **Performance**
   - Monitor resource usage
   - Enable caching if needed
   - Optimize database queries

3. **Documentation**
   - Document your setup
   - Create runbooks
   - Document custom changes

## Customization

### Changing Database Password

```bash
# Before running script, modify DB_PASS variable in deploy-production.sh
# Or after deployment:
sudo -u postgres psql -c "ALTER USER gw2api_user WITH PASSWORD 'newpassword';"
# Update in .env.production
sudo nano /home/GW2API/GW2API/.env.production
sudo systemctl restart gw2api
```

### Using Different Python Version

```bash
# Modify the script to use specific Python version:
# Change: python3 -m venv "$VENV_DIR"
# To: python3.11 -m venv "$VENV_DIR"
```

### Changing Service Port

```bash
# Modify FLASK_PORT in deploy-production.sh:
# Change: FLASK_PORT="5555"
# To: FLASK_PORT="8000"
```

### Custom Nginx Configuration

```bash
# After deployment, edit:
sudo nano /etc/nginx/sites-available/your-domain.io
# Then test and reload:
sudo nginx -t
sudo systemctl reload nginx
```

## Performance Tuning

### Database Optimization
```bash
# In .env.production, add:
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

### Nginx Optimization
```bash
# Edit /etc/nginx/nginx.conf:
worker_processes auto;
worker_connections 2048;
```

### Flask Optimization
```bash
# Run with Gunicorn instead:
pip install gunicorn
gunicorn -w 4 -b 127.0.0.1:5555 app:app
```

## Troubleshooting

### Enable Debug Mode

```bash
# Modify .env.production:
FLASK_DEBUG=True

# Restart:
sudo systemctl restart gw2api

# View detailed logs:
sudo journalctl -u gw2api -f
```

### Test Database Directly

```bash
sudo -u postgres psql gw2api
# Then in psql:
\dt              # List tables
SELECT * FROM users;
```

### Verify All Services

```bash
sudo systemctl is-active gw2api postgresql nginx
curl http://127.0.0.1:5555/api/status
curl https://localhost/gw2api/api/status
```

## Uninstallation

To completely remove deployment:

```bash
# Stop services
sudo systemctl stop gw2api postgresql nginx

# Disable services
sudo systemctl disable gw2api postgresql nginx

# Remove service files
sudo rm /etc/systemd/system/gw2api.service

# Remove nginx config
sudo rm /etc/nginx/sites-{available,enabled}/your-domain.io

# Remove SSL certificates
sudo rm -rf /etc/letsencrypt/live/your-domain.io

# Remove application
sudo rm -rf /home/GW2API/GW2API /opt/gw2api

# Remove database
sudo -u postgres psql -c "DROP DATABASE gw2api;"
sudo -u postgres psql -c "DROP USER gw2api_user;"

# Clean up crontab
crontab -e
# Remove health-check and backup-db.sh lines
```

## Support and Assistance

### Getting Help

1. **Check logs first:**
   ```bash
   sudo journalctl -u gw2api -n 100
   tail -f /var/log/nginx/your-domain_error.log
   ```

2. **Review documentation:**
   - QUICK_DEPLOY.md
   - PRODUCTION_SETUP_COMPLETE.md
   - MULTI_TENANT_README.md

3. **Test endpoints:**
   ```bash
   curl -v https://your-domain.io/gw2api/api/status
   ```

4. **Check system resources:**
   ```bash
   free -h
   df -h
   ps aux | grep python3
   ```

## Version Information

- **Script Version:** 1.0
- **Target OS:** Ubuntu 20.04+
- **Python:** 3.13+
- **PostgreSQL:** 14+
- **Nginx:** 1.26+
- **Last Updated:** November 20, 2025

## License and Usage

This script is part of the GW2API project. It's provided as-is for automated deployment purposes. Feel free to modify for your specific needs.

---

**Have questions?** Check the documentation files or review the script comments for additional details.
