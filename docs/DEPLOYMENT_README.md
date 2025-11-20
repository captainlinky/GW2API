# GW2API Deployment Documentation

## 📋 Quick Navigation

| Document | Purpose |
|----------|---------|
| **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** | Start here - 3-step quick deployment guide |
| **[DEPLOYMENT_SCRIPT_GUIDE.md](DEPLOYMENT_SCRIPT_GUIDE.md)** | Complete script documentation and troubleshooting |
| **[deploy-production.sh](deploy-production.sh)** | Automated deployment script (765 lines) |
| **[PRODUCTION_SETUP_COMPLETE.md](PRODUCTION_SETUP_COMPLETE.md)** | Detailed operational guide |
| **[DEPLOYMENT_COMPLETE.md](DEPLOYMENT_COMPLETE.md)** | Setup summary and next steps |

---

## 🚀 Quick Start

### For New Deployments

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Get the deployment script
git clone <repo-url> /tmp/gw2api
cd /tmp/gw2api

# 3. Run the automated script
sudo bash deploy-production.sh your-domain.io admin@your-domain.io

# That's it! All configuration is automated.
```

**Time required:** ~5-10 minutes
**Complexity:** Very simple (one command)

---

## 📦 What Gets Deployed

### Infrastructure
- ✅ Ubuntu system packages updated
- ✅ Python 3.13 with virtual environment
- ✅ PostgreSQL 14+ database
- ✅ Nginx reverse proxy
- ✅ SSL/TLS with Let's Encrypt

### Application Setup
- ✅ Python dependencies installed
- ✅ Flask application configured
- ✅ Database schema created (8 tables)
- ✅ User authentication system
- ✅ API key encryption
- ✅ Systemd service management

### Automation
- ✅ Daily database backups (7-day retention)
- ✅ Health monitoring (every 5 minutes)
- ✅ Log rotation (daily, 7-day retention)
- ✅ Auto-restart on failure
- ✅ SSL auto-renewal

---

## 📊 Deployment Steps

The `deploy-production.sh` script automatically performs these 15 steps:

| Step | Task | Status |
|------|------|--------|
| 1 | System preparation (apt update/upgrade) | ✅ Auto |
| 2 | Install all dependencies | ✅ Auto |
| 3 | Python virtual environment setup | ✅ Auto |
| 4 | PostgreSQL database configuration | ✅ Auto |
| 5 | Generate security keys | ✅ Auto |
| 6 | Create .env.production configuration | ✅ Auto |
| 7 | Configure Nginx reverse proxy | ✅ Auto |
| 8 | Create systemd service | ✅ Auto |
| 9 | Setup SSL with Let's Encrypt | ✅ Auto |
| 10 | Start all services | ✅ Auto |
| 11 | Run verification tests | ✅ Auto |
| 12 | Configure database backups | ✅ Auto |
| 13 | Setup health monitoring | ✅ Auto |
| 14 | Configure log rotation | ✅ Auto |
| 15 | Display deployment summary | ✅ Auto |

**Total automation:** 100% - No manual steps required after running the script!

---

## 🔑 Key Features

### Automation
- Single command deployment
- Comprehensive error handling
- Automatic verification tests
- Detailed colored output
- Complete logging

### Security
- JWT authentication with 7-day tokens
- Bcrypt password hashing
- Fernet API key encryption (AES-128)
- Let's Encrypt SSL/TLS
- Security headers configured
- Parameterized database queries

### Reliability
- Auto-restart on failure
- Daily database backups
- Health monitoring (5-minute intervals)
- Log rotation and cleanup
- PostgreSQL with proper indexing

### Scalability
- Modular nginx configuration
- Multiple service support
- Database connection pooling ready
- Load balancer compatible

---

## 📋 Requirements

### Minimum System Requirements
- **OS:** Ubuntu 20.04 LTS or later
- **RAM:** 2GB minimum (4GB recommended)
- **Disk:** 20GB minimum
- **CPU:** 1 core minimum (2+ recommended)
- **Network:** Public IP, ports 80/443 open

### Prerequisites
- Domain name registered
- Domain pointing to server IP
- Valid email address (for SSL)
- Root or sudo access
- SSH key configured (recommended)

---

## 📖 Documentation

### For First-Time Users
→ Start with **QUICK_DEPLOY.md** (2-3 minute read)

### For Detailed Information
→ Read **DEPLOYMENT_SCRIPT_GUIDE.md** (comprehensive reference)

### For Operational Management
→ See **PRODUCTION_SETUP_COMPLETE.md** (how to manage your server)

### For Full Implementation Details
→ Review **DEPLOYMENT_COMPLETE.md** (architecture and features)

---

## 🎯 Common Tasks

### Deploy on New Server
```bash
# Copy script to server
scp deploy-production.sh root@new-server:/tmp/

# SSH and run
ssh root@new-server
cd /tmp
sudo bash deploy-production.sh gridserv.io admin@gridserv.io
```

### Check Service Status
```bash
systemctl status gw2api
journalctl -u gw2api -f
```

### View Configuration
```bash
cat /home/GW2API/GW2API/.env.production
cat /etc/nginx/sites-available/your-domain.io
```

### Verify Deployment
```bash
curl https://your-domain.io/gw2api/api/status
curl -k https://your-domain.io/status
```

### Restart Services
```bash
systemctl restart gw2api
systemctl reload nginx
```

### Access Database
```bash
sudo -u postgres psql gw2api
SELECT * FROM users;
```

---

## 🔧 Customization

The script is designed to be self-contained and requires minimal customization. However, you can modify:

1. **Database credentials:** Edit `DB_PASS` variable
2. **Flask port:** Change `FLASK_PORT` variable
3. **Server user:** Modify service `User` directive
4. **Backup schedule:** Edit crontab entries
5. **Nginx configuration:** Edit generated `/etc/nginx/sites-available/your-domain.io`

See **DEPLOYMENT_SCRIPT_GUIDE.md** for detailed customization instructions.

---

## 🐛 Troubleshooting

### Script Fails
1. Check logs: `journalctl -u gw2api -n 100`
2. Verify DNS: `nslookup your-domain.io`
3. Test database: `sudo -u postgres psql gw2api`
4. Check ports: `sudo netstat -tlnp`

### Service Won't Start
1. Check .env file exists: `ls -la /home/GW2API/GW2API/.env.production`
2. View logs: `sudo journalctl -u gw2api -n 50`
3. Restart: `sudo systemctl restart gw2api`

### API Not Responding
1. Test locally: `curl http://127.0.0.1:5555/api/status`
2. Check nginx: `sudo nginx -t`
3. View error log: `tail /var/log/nginx/your-domain_error.log`

### SSL Issues
1. Check certificate: `openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -dates`
2. Retry renewal: `certbot certonly --webroot -w /var/www/certbot -d your-domain.io`
3. Check certbot logs: `tail /var/log/letsencrypt/letsencrypt.log`

See **DEPLOYMENT_SCRIPT_GUIDE.md** for complete troubleshooting guide.

---

## 📈 Performance and Monitoring

### Monitor Services
```bash
# Real-time service status
systemctl status gw2api postgresql nginx

# Follow application logs
journalctl -u gw2api -f

# Health check results
tail -f /opt/gw2api/logs/health-check.log
```

### Database Backups
```bash
# Automatic daily backups created at:
ls -la /opt/gw2api/backups/

# Manual backup:
sudo -u postgres pg_dump gw2api | gzip > /opt/gw2api/backups/manual_backup.sql.gz
```

### SSL Certificate Status
```bash
# Check expiration
openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -dates

# Auto-renewal status
systemctl status certbot.timer
```

---

## 🔐 Security Checklist

After deployment, verify:

- ✅ HTTPS working without browser warnings
- ✅ SSH using key-based authentication
- ✅ Password authentication disabled on SSH
- ✅ Firewall configured (ufw)
- ✅ Regular backups being created
- ✅ Database password is secure and stored safely
- ✅ Security headers present in HTTP responses
- ✅ No sensitive data in logs

---

## 📱 Adding Additional Services

The nginx configuration supports multiple services:

```bash
# 1. Deploy your application on different port (e.g., 6000)
# 2. Edit nginx config
sudo nano /etc/nginx/sites-available/your-domain.io

# 3. Add upstream and location blocks
upstream myapp {
    server 127.0.0.1:6000;
}

location /myapp/ {
    rewrite ^/myapp/(.*) /$1 break;
    proxy_pass http://myapp;
    # [proxy headers...]
}

# 4. Test and reload
sudo nginx -t
sudo systemctl reload nginx

# 5. Access at: https://your-domain.io/myapp/
```

---

## 🆘 Getting Help

### Information Resources
1. **QUICK_DEPLOY.md** - Quick reference
2. **DEPLOYMENT_SCRIPT_GUIDE.md** - Complete documentation
3. **Script comments** - Detailed explanations in `deploy-production.sh`
4. **System logs** - `journalctl -u gw2api -f`

### Debugging Steps
1. Check logs: `sudo journalctl -u gw2api -n 100`
2. Test endpoints: `curl -v https://your-domain.io/gw2api/api/status`
3. Verify services: `systemctl status gw2api postgresql nginx`
4. Check configuration: `cat /home/GW2API/GW2API/.env.production`

### Common Issues
- **"Domain validation failed"** → Wait for DNS propagation or retry certbot
- **"Service won't start"** → Check .env.production and database connection
- **"API not responding"** → Test Flask directly on localhost
- **"SSL certificate issue"** → Use Let's Encrypt or self-signed cert

---

## 📜 File Locations

After deployment, important files are located at:

```
Configuration:
  /home/GW2API/GW2API/.env.production      (secrets, permissions: 600)
  /etc/nginx/sites-available/your-domain   (nginx config)
  /etc/systemd/system/gw2api.service       (service definition)

Application:
  /home/GW2API/GW2API/app.py               (Flask application)
  /home/GW2API/GW2API/venv/                (Python virtual environment)

Database:
  /var/lib/postgresql/                     (PostgreSQL data directory)
  /opt/gw2api/backups/                     (Daily backups)

Logs:
  /var/log/nginx/your-domain_*             (Nginx logs)
  /opt/gw2api/logs/health-check.log        (Health check results)
  journalctl -u gw2api                     (Flask logs)

SSL Certificates:
  /etc/letsencrypt/live/your-domain.io/    (Let's Encrypt certs)
```

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Script completed without errors
- [ ] Services all running: `systemctl status gw2api postgresql nginx`
- [ ] API responds: `curl https://your-domain.io/gw2api/api/status`
- [ ] HTTPS working without warnings
- [ ] User registration works
- [ ] Database backups created
- [ ] Health checks running
- [ ] Logs being generated
- [ ] SSL certificate valid: `openssl x509 -in /etc/letsencrypt/live/your-domain.io/fullchain.pem -noout -text`

---

## 🎓 Learning Resources

### Included Documentation
- All deployment guides are in `/home/GW2API/GW2API/`
- Script includes detailed comments
- Configuration files are well-documented

### External Resources
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Flask Documentation](https://flask.palletsprojects.com/)

---

## 📝 Version Information

| Component | Version |
|-----------|---------|
| Script | 1.0 |
| Target OS | Ubuntu 20.04+ |
| Python | 3.13+ |
| PostgreSQL | 14+ |
| Nginx | 1.26+ |
| Flask | 3.0+ |
| Last Updated | November 20, 2025 |

---

## 🚀 Next Steps

After successful deployment:

1. **Immediate:** Test endpoints and verify service
2. **Day 1:** Monitor logs, check backups, verify SSL
3. **Week 1:** Integrate frontend UI, configure monitoring
4. **Month 1:** Optimize performance, add additional services

---

## 📞 Support Summary

| Need | Solution |
|------|----------|
| Quick deployment | Run `deploy-production.sh` |
| Detailed guide | Read `DEPLOYMENT_SCRIPT_GUIDE.md` |
| Quick reference | Check `QUICK_DEPLOY.md` |
| Troubleshooting | See `DEPLOYMENT_SCRIPT_GUIDE.md` |
| Operations guide | Read `PRODUCTION_SETUP_COMPLETE.md` |
| Service management | Use systemctl commands |
| Logs | View with `journalctl` |
| Backups | Auto at `/opt/gw2api/backups/` |

---

**Your GW2API instance is now ready for production deployment!**

Use the guides above to get started, or run the script to deploy immediately.

For questions, refer to the comprehensive documentation or the script comments.

---

*Last Updated: November 20, 2025*
