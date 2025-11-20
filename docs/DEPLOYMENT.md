# GW2API Deployment Guide

This guide covers all deployment options for GW2API, from local development to production VPS deployment.

## Quick Start

All deployment scripts auto-detect their location and work from any directory where you clone the repository.

### Local Development

```bash
# Clone the repository
git clone https://github.com/captainlinky/GW2API.git
cd GW2API

# Deploy (creates virtual environment and installs dependencies)
./deploy-ubuntu.sh

# Edit .env and add your GW2_API_KEY
nano .env

# Start the server
./start_ui.sh
```

Access at: http://localhost:5555

### Production VPS Deployment

```bash
# Clone the repository
git clone https://github.com/captainlinky/GW2API.git
cd GW2API

# Deploy with your domain and email
sudo ./deploy-ubuntu.sh yourdomain.com admin@yourdomain.com
```

Access at: https://yourdomain.com/gw2api/

---

## Available Deployment Scripts

### 1. `deploy-ubuntu.sh` (Recommended - Universal)

**The one-script solution that works everywhere.**

- **Auto-detects** script location
- **Works on any Ubuntu machine**
- **Two modes**: Development and Production
- **No hardcoded paths**

#### Development Mode (No sudo required)

```bash
./deploy-ubuntu.sh
```

Does:
- Creates Python virtual environment (`.venv`)
- Installs all dependencies
- Creates `.env` configuration file
- Ready to run with `./start_ui.sh`

#### Production Mode (Requires sudo)

```bash
sudo ./deploy-ubuntu.sh <domain> <email>
```

Does everything in development mode, plus:
- Installs system dependencies (nginx, PostgreSQL, certbot)
- Sets up PostgreSQL database with secure password
- Creates systemd service
- Configures nginx reverse proxy
- Obtains SSL certificate from Let's Encrypt
- Sets up automated backups (daily at 2 AM)
- Configures health monitoring (every 5 minutes)
- Sets up log rotation

### 2. `deploy-production.sh` (Legacy Production)

Full production deployment with PostgreSQL and nginx. Same as `deploy-ubuntu.sh` production mode but production-only.

**Updated**: Now auto-detects location, no hardcoded paths.

```bash
sudo ./deploy-production.sh <domain> <email>
```

### 3. `deploy.sh` (Quick Update)

For updating an existing deployment after git pull.

**Updated**: Now auto-detects location and virtual environment.

```bash
./deploy.sh  # Will automatically find .venv or venv
```

Does:
- Pulls latest changes from git
- Installs/updates dependencies
- Restarts systemd service (if configured)

---

## Deployment Scenarios

### Scenario 1: Local Development on Ubuntu

Perfect for: Local testing, development, single-user use

```bash
# Initial setup
git clone https://github.com/captainlinky/GW2API.git
cd GW2API
./deploy-ubuntu.sh

# Configure
nano .env  # Add GW2_API_KEY

# Run
./start_ui.sh

# Access
# http://localhost:5555
```

### Scenario 2: VPS Production Deployment

Perfect for: Public deployment, multi-user, HTTPS

```bash
# On your VPS (Ubuntu 20.04+)
git clone https://github.com/captainlinky/GW2API.git
cd GW2API

# Deploy (ensure DNS points to your server)
sudo ./deploy-ubuntu.sh example.com admin@example.com

# Access
# https://example.com/gw2api/
```

### Scenario 3: Updating Existing Deployment

```bash
cd GW2API
git pull origin main
./deploy.sh
```

### Scenario 4: Different Installation Paths

All scripts work from any path:

```bash
# Install anywhere you want
mkdir -p /var/www/apps
cd /var/www/apps
git clone https://github.com/captainlinky/GW2API.git
cd GW2API

# Scripts auto-detect location
./deploy-ubuntu.sh

# Or production
sudo ./deploy-ubuntu.sh mysite.com admin@example.com
```

---

## What Gets Installed

### Development Mode

**Python Environment:**
- Python 3 virtual environment (`.venv/`)
- All dependencies from `requirements.txt`

**Configuration:**
- `.env` file (copied from `.env.example`)

**Ready to run with:**
- `./start_ui.sh` or `.venv/bin/python app.py`

### Production Mode

**System Packages:**
- python3, python3-pip, python3-venv
- postgresql, postgresql-contrib
- nginx
- certbot (Let's Encrypt)
- build-essential, python3-dev

**Database:**
- PostgreSQL database: `gw2api`
- Database user: `gw2api_user`
- Secure random password (saved in `.env.production`)

**Web Server:**
- Nginx reverse proxy on port 80/443
- SSL/TLS certificate from Let's Encrypt
- Path-based routing: `/gw2api/`

**Service:**
- Systemd service: `gw2api.service`
- Auto-start on boot
- Auto-restart on failure

**Monitoring:**
- Daily database backups (2 AM, 7-day retention)
- Health checks every 5 minutes
- Log rotation (7-day retention)

---

## Directory Structure After Deployment

### Development Mode

```
GW2API/
├── .venv/                  # Python virtual environment
├── .env                    # Your configuration (API key)
├── app.py                  # Main application
├── requirements.txt        # Python dependencies
├── deploy-ubuntu.sh        # Deployment script
├── start_ui.sh            # Startup script
└── [other project files]
```

### Production Mode

```
GW2API/
├── .venv/                      # Python virtual environment
├── .env.production             # Production configuration
├── app.py                      # Main application
├── backups/                    # Database backups
│   └── gw2api_YYYYMMDD_*.sql.gz
├── logs/                       # Application logs
│   ├── backup.log
│   └── health-check.log
├── scripts/                    # Maintenance scripts
│   ├── backup-db.sh
│   └── health-check.sh
├── wvw_data/                   # WvW tracking data
│   └── current_match.json
├── kdr_history.json            # Historical K/D data
├── activity_history.json       # Historical activity data
└── [other project files]
```

---

## Configuration Files

### `.env` (Development Mode)

```bash
# Your Guild Wars 2 API Key
GW2_API_KEY=your-api-key-here

# Polling intervals (optional)
POLLING_DASHBOARD_INTERVAL=60
POLLING_MAPS_INTERVAL=30
```

Get API key from: https://account.arena.net/applications

**Required permissions:** account, characters, inventories, guilds, tradingpost, progression

### `.env.production` (Production Mode)

Auto-generated during deployment. Contains:
- Database connection string
- Security keys (JWT, Flask secret)
- API key encryption key
- Flask configuration
- Rate limiting settings

**Important:** This file is created with 600 permissions and should never be committed to git.

---

## Service Management (Production)

### Systemd Service

```bash
# Check status
sudo systemctl status gw2api

# View logs
sudo journalctl -u gw2api -f

# Restart service
sudo systemctl restart gw2api

# Stop service
sudo systemctl stop gw2api

# Start service
sudo systemctl start gw2api

# Disable auto-start
sudo systemctl disable gw2api

# Enable auto-start
sudo systemctl enable gw2api
```

### Nginx

```bash
# Check status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# View access logs
sudo tail -f /var/log/nginx/<domain>_access.log

# View error logs
sudo tail -f /var/log/nginx/<domain>_error.log
```

### PostgreSQL

```bash
# Access database
sudo -u postgres psql gw2api

# View database credentials
cat .env.production | grep DATABASE_URL

# Manual backup
sudo -u postgres pg_dump gw2api | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c backup_YYYYMMDD.sql.gz | sudo -u postgres psql gw2api
```

---

## Troubleshooting

### Development Mode Issues

#### Virtual environment not found

```bash
# Recreate virtual environment
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

#### Server won't start - API key error

```bash
# Check .env file exists
ls -la .env

# Add your API key
nano .env
# Add: GW2_API_KEY=your-actual-key-here
```

#### Port 5555 already in use

```bash
# Find what's using the port
sudo lsof -i :5555

# Kill the process
sudo kill -9 <PID>
```

### Production Mode Issues

#### SSL certificate failed

```bash
# Check DNS is pointing to server
nslookup yourdomain.com

# Manually request certificate
sudo certbot certonly --webroot -w /var/www/certbot -d yourdomain.com
```

#### Service won't start

```bash
# Check service status
sudo systemctl status gw2api

# View detailed logs
sudo journalctl -u gw2api -n 50

# Check Python syntax
cd /path/to/GW2API
.venv/bin/python -m py_compile app.py

# Test manually
cd /path/to/GW2API
.venv/bin/python app.py
```

#### Database connection failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
sudo -u postgres psql -l

# Check credentials in .env.production
cat .env.production | grep DATABASE_URL
```

#### Nginx configuration error

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Verify site is enabled
ls -la /etc/nginx/sites-enabled/
```

---

## Updating Your Deployment

### Development Mode

```bash
cd GW2API
git pull origin main
.venv/bin/pip install -r requirements.txt
# Restart server (Ctrl+C and ./start_ui.sh)
```

Or use:

```bash
./deploy.sh
```

### Production Mode

```bash
cd GW2API
git pull origin main
./deploy.sh
# Service will automatically restart
```

---

## Security Considerations

### Development Mode
- Runs on localhost only by default
- No authentication required
- API key stored in `.env` (gitignored)
- Suitable for single-user local use

### Production Mode
- Multi-tenant authentication with JWT
- API keys encrypted in database
- HTTPS with Let's Encrypt
- Rate limiting enabled
- Nginx reverse proxy
- Database with secure random password
- Restricted file permissions (600 on sensitive files)

---

## Performance & Monitoring

### Production Monitoring

**Automated Health Checks** (every 5 minutes):
- Service status check
- API response verification
- Database connectivity test
- Auto-restart on failure

**Logs:**
```bash
# Application logs
sudo journalctl -u gw2api -f

# Health check logs
tail -f logs/health-check.log

# Backup logs
tail -f logs/backup.log

# Nginx access logs
sudo tail -f /var/log/nginx/<domain>_access.log
```

**Database Backups:**
- Automatic daily backups at 2 AM
- 7-day retention
- Stored in: `backups/`
- Cron job: `0 2 * * * /path/to/scripts/backup-db.sh`

---

## Uninstalling

### Development Mode

```bash
# Remove virtual environment and generated files
rm -rf .venv .env kdr_history.json activity_history.json wvw_data/ server.log

# Optional: Remove entire directory
cd ..
rm -rf GW2API
```

### Production Mode

```bash
# Stop services
sudo systemctl stop gw2api
sudo systemctl disable gw2api

# Remove systemd service
sudo rm /etc/systemd/system/gw2api.service
sudo systemctl daemon-reload

# Remove nginx configuration
sudo rm /etc/nginx/sites-enabled/<domain>
sudo rm /etc/nginx/sites-available/<domain>
sudo systemctl reload nginx

# Remove SSL certificates (optional)
sudo certbot delete --cert-name <domain>

# Remove database (optional)
sudo -u postgres psql -c "DROP DATABASE gw2api;"
sudo -u postgres psql -c "DROP USER gw2api_user;"

# Remove cron jobs
crontab -l | grep -v "gw2api" | crontab -

# Remove application directory
cd ..
sudo rm -rf GW2API
```

---

## Requirements

### Minimum System Requirements

**Development:**
- Ubuntu 20.04+ (or any Linux with Python 3.7+)
- 512 MB RAM
- 1 GB disk space
- Internet connection

**Production:**
- Ubuntu 20.04+
- 2 GB RAM
- 20 GB disk space
- Domain name pointing to server
- Internet connection
- Sudo/root access

### Software Dependencies

**Installed automatically by deploy scripts:**
- Python 3.7+
- pip
- venv
- PostgreSQL (production only)
- nginx (production only)
- certbot (production only)

---

## Support

### Documentation
- Main README: `README.md`
- Project Structure: `PROJECT_STRUCTURE.md`
- Web UI Guide: `WEB_UI_GUIDE.md`
- WvW Dashboard: `WVW_DASHBOARD.md`
- Claude AI Guide: `CLAUDE.md`

### Issues
Report issues at: https://github.com/captainlinky/GW2API/issues

### Guild Wars 2 API
- API Documentation: https://wiki.guildwars2.com/wiki/API:Main
- Get API Key: https://account.arena.net/applications

---

## License

This project follows Guild Wars 2 Content Terms of Use:
https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/

---

**Last Updated:** 2025-11-20
