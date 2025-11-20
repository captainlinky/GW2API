# GW2API Quick Deployment Guide

This guide shows how to deploy GW2API on a new server in minutes using the automated deployment script.

## Prerequisites

- Ubuntu 20.04 LTS or later (also works on Debian 11+)
- Minimum 2GB RAM, 20GB disk space
- Root or sudo access
- Domain name pointing to your server
- Valid email address for SSL certificates

## Quick Start (3 Steps)

### Step 1: Get the Code

```bash
# SSH into your server
ssh root@your-server-ip

# Clone the repository
cd /tmp
git clone <your-repo-url> gw2api-temp
cd gw2api-temp

# Or if already deployed, use existing code
cd /home/GW2API/GW2API
```

### Step 2: Run the Deployment Script

```bash
# Make script executable
chmod +x deploy-production.sh

# Run deployment (replace with your domain and email)
sudo bash deploy-production.sh gridserv.io admin@gridserv.io
```

The script will:
- ✅ Update system packages
- ✅ Install all dependencies
- ✅ Set up PostgreSQL database
- ✅ Create Python virtual environment
- ✅ Configure nginx reverse proxy
- ✅ Set up SSL with Let's Encrypt
- ✅ Create systemd service
- ✅ Start all services
- ✅ Configure backups
- ✅ Set up health monitoring
- ✅ Run verification tests

### Step 3: Verify Deployment

```bash
# Check service status
systemctl status gw2api

# View logs
journalctl -u gw2api -f

# Test API endpoint
curl https://your-domain.io/gw2api/api/status

# Test registration
curl -k -X POST https://your-domain.io/gw2api/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123"}'
```

## What Gets Installed

### System Packages
- Python 3.13 with venv
- PostgreSQL 14+
- Nginx 1.26+
- Certbot for SSL

### Python Packages
- Flask 3.0+
- PostgreSQL driver (psycopg2)
- JWT (PyJWT)
- Bcrypt for password hashing
- Cryptography (Fernet)
- And all other dependencies in requirements.txt

### Services
- **gw2api** - Flask application (systemd service)
- **postgresql** - Database server
- **nginx** - Web server and reverse proxy

### Features Configured
- ✅ Multi-user authentication system
- ✅ Encrypted API key storage
- ✅ PostgreSQL database with 8 tables
- ✅ HTTPS/SSL with Let's Encrypt
- ✅ Automatic database backups
- ✅ Health monitoring (every 5 minutes)
- ✅ Log rotation
- ✅ Auto-restart on failure

## Directory Structure After Deployment

```
/home/GW2API/GW2API/
├── app.py
├── auth.py
├── database.py
├── crypto_utils.py
├── .env.production          (generated)
├── venv/                    (virtual environment)
├── static/
├── templates/
└── [other files]

/etc/systemd/system/
├── gw2api.service          (generated)

/etc/nginx/sites-available/
├── your-domain.io          (generated)

/etc/letsencrypt/live/your-domain.io/
├── fullchain.pem           (SSL certificate)
└── privkey.pem             (SSL private key)

/opt/gw2api/
├── backups/                (database backups)
├── logs/                   (application logs)
└── scripts/
    ├── backup-db.sh
    └── health-check.sh
```

## Configuration Generated

### .env.production
Contains:
- DATABASE_URL (PostgreSQL connection)
- JWT_SECRET_KEY (JWT signing)
- API_KEY_ENCRYPTION_KEY (Fernet encryption)
- FLASK_ENV=production
- RATE_LIMIT settings

**Location:** `/home/GW2API/GW2API/.env.production`
**Permissions:** 600 (read-only by root)

### Database
- **Database Name:** gw2api
- **Username:** gw2api_user
- **Password:** Generated during deployment (in .env.production)
- **Tables:** 8 tables with proper indexes
- **Backups:** Daily at 2 AM (7-day retention)

### Nginx Configuration
- **Location:** `/etc/nginx/sites-available/your-domain.io`
- **Features:**
  - HTTPS with Let's Encrypt
  - HTTP → HTTPS redirect
  - Path-based routing (/gw2api/)
  - Security headers
  - Status page at /status

### SSL Certificate
- **Type:** Let's Encrypt (or self-signed if validation fails)
- **Location:** `/etc/letsencrypt/live/your-domain.io/`
- **Auto-renewal:** Yes (via certbot)
- **Renewal:** 30 days before expiration

## Common Commands

### Service Management

```bash
# Start service
sudo systemctl start gw2api

# Stop service
sudo systemctl stop gw2api

# Restart service
sudo systemctl restart gw2api

# View status
sudo systemctl status gw2api

# View logs
sudo journalctl -u gw2api -f

# View last 50 lines
sudo journalctl -u gw2api -n 50
```

### Database Management

```bash
# Connect to database
sudo -u postgres psql gw2api

# Check users in database
SELECT id, email, created_at FROM users;

# Check API keys
SELECT user_id, api_key_name FROM user_api_keys;

# Backup database manually
sudo -u postgres pg_dump gw2api | gzip > /opt/gw2api/backups/manual_backup.sql.gz
```

### Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload nginx (no downtime)
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# View error log
sudo tail -f /var/log/nginx/your-domain.io_error.log

# View access log
sudo tail -f /var/log/nginx/your-domain.io_access.log
```

### SSL Certificate

```bash
# Check certificate expiration
sudo openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -dates

# Renew certificate manually
sudo certbot renew --force-renewal

# Verify auto-renewal is configured
sudo systemctl status certbot.timer
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u gw2api -n 100

# Check if port is already in use
sudo netstat -tlnp | grep 5555

# Verify .env.production exists
ls -la /home/GW2API/GW2API/.env.production

# Test database connection
sudo -u postgres psql gw2api -c "SELECT 1;"
```

### Nginx issues

```bash
# Test configuration
sudo nginx -t

# Check if nginx is running
sudo systemctl status nginx

# Check ports
sudo netstat -tlnp | grep -E ':(80|443)'

# Check error log
sudo tail -f /var/log/nginx/your-domain.io_error.log
```

### Database issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Connect and verify
sudo -u postgres psql gw2api

# Check table permissions
\dt
\dp
```

### SSL certificate issues

```bash
# Check if certificate exists
ls -la /etc/letsencrypt/live/your-domain.io/

# Check certificate details
sudo openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -text

# If Let's Encrypt failed, check logs
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# Retry certificate
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.io
```

## Adding Additional Services

The nginx configuration is modular and supports multiple services on different paths.

### To add a new service:

1. **Deploy your application** on a different port (e.g., 6000)

2. **Edit nginx configuration:**
   ```bash
   sudo nano /etc/nginx/sites-available/your-domain.io
   ```

3. **Add upstream block at the top:**
   ```nginx
   upstream myservice {
       server 127.0.0.1:6000;
   }
   ```

4. **Add location block in HTTPS section:**
   ```nginx
   location /myservice/ {
       rewrite ^/myservice/(.*) /$1 break;
       proxy_pass http://myservice;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Forwarded-Prefix /myservice;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_connect_timeout 60s;
       proxy_send_timeout 60s;
       proxy_read_timeout 60s;
   }
   ```

5. **Test and reload:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Access at:** `https://your-domain.io/myservice/`

## Uninstalling / Cleanup

To remove GW2API from your server:

```bash
# Stop services
sudo systemctl stop gw2api postgresql nginx

# Disable from auto-start
sudo systemctl disable gw2api postgresql nginx

# Remove systemd service
sudo rm /etc/systemd/system/gw2api.service
sudo systemctl daemon-reload

# Remove nginx configuration
sudo rm /etc/nginx/sites-enabled/your-domain.io
sudo rm /etc/nginx/sites-available/your-domain.io

# Remove application files
sudo rm -rf /home/GW2API/GW2API
sudo rm -rf /opt/gw2api

# Remove database
sudo -u postgres psql -c "DROP DATABASE gw2api;"
sudo -u postgres psql -c "DROP USER gw2api_user;"

# Remove SSL certificate (optional - Let's Encrypt)
sudo rm -rf /etc/letsencrypt/live/your-domain.io
```

## Performance Tips

1. **Enable compression** in nginx
2. **Set up caching** for static assets
3. **Configure database connection pooling**
4. **Use CDN** for static files
5. **Monitor resource usage** regularly

## Security Best Practices

1. ✅ **SSH key-based authentication** (no password)
2. ✅ **Regular security updates** (`apt upgrade`)
3. ✅ **Keep Let's Encrypt certificate updated** (automatic)
4. ✅ **Use strong database password** (auto-generated)
5. ✅ **Rotate security keys** periodically
6. ✅ **Monitor logs** for suspicious activity
7. ✅ **Backup database** regularly (automated)
8. ✅ **Use firewall** to restrict access

## Support

For issues or questions:

1. Check logs: `sudo journalctl -u gw2api -n 50`
2. Test endpoints with curl
3. Review configuration files
4. Check documentation files in /home/GW2API/GW2API/

## Next Steps

After successful deployment:

1. ✅ Test user registration workflow
2. ✅ Test API key management
3. ✅ Verify all endpoints working
4. ✅ Review security settings
5. ⏳ Integrate frontend login UI
6. ⏳ Configure email notifications
7. ⏳ Set up advanced monitoring
8. ⏳ Plan database backups to cloud storage

---

**Script Version:** 1.0
**Last Updated:** November 20, 2025
**Tested On:** Ubuntu 24.10
