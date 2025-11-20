# GW2API Repository Structure

This document describes the organization of the GW2API repository.

## Directory Layout

```
GW2API/
├── Core Application
│   ├── app.py                  # Main Flask application
│   ├── auth.py                 # Authentication & user management
│   ├── cli.py                  # Command-line interface
│   ├── crypto_utils.py         # Encryption utilities
│   ├── database.py             # Database connection & queries
│   ├── gw2api.py               # GW2 API client library
│   └── wvw_tracker.py          # WvW guild tracking system
│
├── Configuration
│   ├── requirements.txt        # Python dependencies
│   ├── schema.sql              # Database schema
│   ├── alliance_names.json     # World/alliance name mappings
│   └── .env.example            # Environment variable template
│
├── Frontend
│   ├── static/                 # Static assets (CSS, JS, images)
│   │   ├── app.js              # Main frontend application
│   │   ├── wvw-maps.js         # Interactive WvW maps
│   │   ├── style.css           # Styling
│   │   ├── manifest.json       # PWA manifest
│   │   └── maps/               # Map images
│   └── templates/              # HTML templates
│       └── index.html          # Main dashboard template
│
├── config/                     # Server configuration templates
│   ├── gw2api.service          # Systemd service file
│   ├── logrotate.conf          # Log rotation config
│   └── nginx-gw2api.conf       # Nginx reverse proxy config
│
├── scripts/                    # Deployment & maintenance scripts
│   ├── deploy-ubuntu.sh        # Universal Ubuntu deployment
│   ├── deploy-production.sh   # Production deployment (legacy)
│   ├── deploy.sh               # Quick update script
│   ├── setup-local-production.sh  # Local production setup
│   ├── verify-setup.sh         # Installation verification
│   │
│   ├── startup/                # Server startup scripts
│   │   ├── start_ui.sh         # Start development server
│   │   ├── start-local-production.sh  # Start local production
│   │   ├── start-gw2api.sh     # Generic startup
│   │   └── start_windows.ps1   # Windows startup
│   │
│   ├── tools/                  # Utility scripts
│   │   ├── examples.py         # Interactive API examples
│   │   ├── examples.sh         # Example wrapper script
│   │   ├── generate_icons.py   # Icon generation
│   │   └── quickref.py         # Quick reference tool
│   │
│   ├── backup-db.sh            # Database backup (runtime)
│   └── health-check.sh         # Health monitoring (runtime)
│
├── docs/                       # Documentation
│   ├── README.md               # Main documentation
│   ├── DEPLOYMENT.md           # Deployment guide
│   ├── DEPLOYMENT_GUIDE.md     # Detailed deployment
│   ├── QUICKSTART.md           # Quick start guide
│   ├── CLAUDE.md               # AI assistant guide
│   ├── WEB_UI_GUIDE.md         # Web interface guide
│   ├── WVW_DASHBOARD.md        # WvW dashboard features
│   ├── WVW_GUIDE.md            # WvW API reference
│   ├── PROJECT_STRUCTURE.md    # Project structure
│   └── [other documentation]
│
└── Runtime Data (gitignored)
    ├── .env                    # Environment variables (dev)
    ├── .env.production         # Environment variables (prod)
    ├── server.log              # Application logs
    ├── activity_history.json   # WvW activity tracking
    ├── kdr_history.json        # WvW K/D ratio tracking
    └── wvw_data/               # WvW match data
        └── current_match.json
```

## Quick Start

### Development Mode
```bash
# Install dependencies
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env and add your GW2_API_KEY

# Run
./scripts/startup/start_ui.sh
```

### Production Mode (Local)
```bash
# Set up local production environment
./scripts/setup-local-production.sh

# Start server
./scripts/startup/start-local-production.sh
```

### Production Deployment (VPS)
```bash
# Deploy to Ubuntu server
sudo ./scripts/deploy-ubuntu.sh yourdomain.com admin@example.com
```

## File Categories

### Core Application Files
**Purpose**: Main application logic
**Location**: Root directory
**Files**: `app.py`, `auth.py`, `cli.py`, `crypto_utils.py`, `database.py`, `gw2api.py`, `wvw_tracker.py`

### Configuration Files
**Purpose**: Application configuration and dependencies
**Location**: Root directory
**Files**: `requirements.txt`, `schema.sql`, `alliance_names.json`, `.env.example`

### Server Configuration
**Purpose**: Production server configuration templates
**Location**: `config/`
**Files**: Systemd service, nginx config, log rotation

### Scripts
**Purpose**: Deployment, startup, and utility scripts
**Location**: `scripts/`
**Subdirectories**:
- `scripts/` - Deployment and maintenance
- `scripts/startup/` - Server startup scripts
- `scripts/tools/` - Utility and development tools

### Documentation
**Purpose**: Project documentation and guides
**Location**: `docs/`
**Key Files**:
- `README.md` - Main documentation
- `DEPLOYMENT.md` - Deployment guide
- `CLAUDE.md` - AI assistant guide
- `WEB_UI_GUIDE.md` - User guide

### Frontend Assets
**Purpose**: Web interface files
**Location**: `static/` and `templates/`
**Key Files**:
- `static/app.js` - Main frontend logic
- `static/style.css` - Styling
- `templates/index.html` - HTML template

## Important Paths

### Startup Scripts
```bash
# Development (simple, no database)
./scripts/startup/start_ui.sh

# Local production (with database, /gw2api prefix)
./scripts/startup/start-local-production.sh

# Windows
./scripts/startup/start_windows.ps1
```

### Deployment Scripts
```bash
# Universal deployment (works anywhere)
./scripts/deploy-ubuntu.sh

# Production deployment with domain
sudo ./scripts/deploy-ubuntu.sh yourdomain.com admin@example.com

# Quick update (existing deployment)
./scripts/deploy.sh
```

### Utility Tools
```bash
# Interactive API examples
python3 scripts/tools/examples.py

# Quick reference
python3 scripts/tools/quickref.py

# Command-line interface
python3 cli.py --help
```

## Configuration Locations

### Environment Variables
- **Development**: `.env` (gitignored)
- **Production**: `.env.production` (gitignored)
- **Template**: `.env.example` (checked into git)

### Server Configs
- **Systemd**: `config/gw2api.service`
- **Nginx**: `config/nginx-gw2api.conf`
- **Log Rotation**: `config/logrotate.conf`

### Application Data
- **Alliance Names**: `alliance_names.json`
- **Database Schema**: `schema.sql`
- **Python Dependencies**: `requirements.txt`

## Documentation Index

| Document | Purpose |
|----------|---------|
| `README.md` | Main project documentation |
| `docs/DEPLOYMENT.md` | Complete deployment guide |
| `docs/QUICKSTART.md` | Quick start guide |
| `docs/CLAUDE.md` | AI assistant guide for development |
| `docs/WEB_UI_GUIDE.md` | Web interface user guide |
| `docs/WVW_DASHBOARD.md` | WvW dashboard features |
| `docs/PROJECT_STRUCTURE.md` | Detailed code structure |
| `STRUCTURE.md` (this file) | Repository organization |

## Maintenance

### Adding New Scripts
- Deployment scripts → `scripts/`
- Startup scripts → `scripts/startup/`
- Utility tools → `scripts/tools/`

### Adding Documentation
- User guides → `docs/`
- Code documentation → Docstrings in source files
- Setup guides → `docs/`

### Modifying Configuration
- Development config → `.env`
- Production config → `.env.production`
- Server templates → `config/`

## Version Control

### Tracked Files
- All source code (`*.py`)
- Configuration templates (`.env.example`, `config/*`)
- Documentation (`docs/*`, `*.md`)
- Scripts (`scripts/*`)
- Frontend assets (`static/*`, `templates/*`)

### Ignored Files (.gitignore)
- Environment files (`.env`, `.env.production`)
- Runtime data (`*.json` - activity, kdr, wvw_data)
- Logs (`*.log`)
- Python cache (`__pycache__`, `*.pyc`)
- Virtual environments (`.venv`, `venv`)

---

**Last Updated**: 2025-11-20
**Repository**: https://github.com/captainlinky/GW2API
