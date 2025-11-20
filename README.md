# Guild Wars 2 API Dashboard

A comprehensive web dashboard for Guild Wars 2 with real-time WvW tracking, account management, trading post analysis, and character inventory management.

## Features

### 🌐 Web Dashboard
- **Account Management** - View account info, characters, wallet, bank, and materials
- **Trading Post** - Search items by name, analyze market economics, track transactions
- **WvW War Room** - Interactive maps showing real-time objective ownership and guild claims
- **Dashboard Analytics** - Historical charts for K/D ratios, objective capture activity, and points-per-tick

### 📊 Historical Tracking
- 7 days of K/D ratio tracking with 15-minute snapshots
- Objective ownership history showing team performance over time
- Automatic guild discovery and tracking on WvW objectives
- Points-per-tick timeline for WvW match progress

### 🎨 User Features
- **Multi-tenant Authentication** - Secure JWT-based login with multi-user support
- **Dark Theme UI** - Professional dark interface for extended viewing
- **Responsive Design** - Works on desktop and mobile devices
- **Instant Item Search** - PostgreSQL-backed search with 27,000+ tradeable items
- **Market Analysis** - Detailed economics for trading post items with buy/sell recommendations

## Getting Started

### Quick Start

**Development Mode** (Simple, no database):
```bash
git clone https://github.com/captainlinky/GW2API.git
cd GW2API
./scripts/deploy-ubuntu.sh  # Auto-installs dependencies
nano .env  # Add your GW2_API_KEY
./scripts/startup/start_ui.sh
```
Access at: http://localhost:5555

**Production Mode** (VPS with domain):
```bash
git clone https://github.com/captainlinky/GW2API.git
cd GW2API
sudo ./scripts/deploy-ubuntu.sh yourdomain.com admin@example.com
```
Access at: https://yourdomain.com/gw2api/

### Prerequisites
- Ubuntu 20.04+ (or any Linux with Python 3.7+)
- GW2 API key (free from https://account.arena.net/applications)
- For production: Domain name, sudo access, ~2GB RAM

### Manual Installation

1. Clone and install
```bash
git clone https://github.com/captainlinky/GW2API.git
cd GW2API
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

2. Configure environment
```bash
cp .env.example .env
# Edit .env and add your GW2_API_KEY
# - DATABASE_URL (PostgreSQL connection)
# - JWT_SECRET_KEY and other security keys
```

4. Initialize database
```bash
# Database tables are created automatically on first run
python app.py
```

5. Open in browser
```
https://gridserv.io/gw2api  (production)
http://localhost:5555       (local development)
```

## Usage

### Web Dashboard Tabs

**Dashboard**
- Real-time account stats
- 7-day historical charts for K/D ratio, objective activity, and points-per-tick
- Guild tracking for claimed objectives

**Account**
- View all character information
- Account wallet and currency totals
- Bank and material storage contents

**Characters**
- Character list with levels and professions
- Equipment and build information
- Specialization and trait details

**Trading Post**
- Search for items by friendly name (no item IDs needed)
- View current buy/sell prices
- Market analysis with supply/demand metrics
- Transaction history (buys, sells, listings)

**War Room**
- Interactive maps for all 4 WvW maps (Eternal Battlegrounds, Red/Green/Blue Borderlands)
- Real-time objective ownership with team colors
- Guild claim information and territory control
- 15-second auto-refresh for live updates

**Settings**
- Configure polling intervals
- Manage API keys
- Change world/alliance names

### Authentication

1. **Register** - Create a new account with email and password
2. **Login** - Use credentials to access your dashboard
3. **Add API Key** - Store your GW2 API key securely (encrypted in database)
4. **JWT Tokens** - 7-day expiration for secure session management

## Architecture

### Backend
- **Flask** - Python web framework
- **PostgreSQL** - Multi-tenant database with user isolation
- **JWT Authentication** - Secure token-based auth
- **Background Threads** - Automatic tracking and data collection

### Frontend
- **Vanilla JavaScript** - No build process, no dependencies
- **Canvas API** - Custom chart rendering
- **SVG Maps** - Interactive WvW objective visualization
- **LocalStorage** - Client-side JWT token management

### Data Storage
- **PostgreSQL** - User accounts, API keys, settings
- **In-Memory Cache** - Real-time match data with 30-second TTL
- **Background Snapshots** - 7-day historical data with 15-minute intervals

## Repository Structure

```
GW2API/
├── Core Application      # app.py, auth.py, cli.py, gw2api.py, wvw_tracker.py
├── config/               # Server configuration templates
├── docs/                 # Documentation and guides
├── scripts/              # Deployment and utility scripts
│   ├── startup/          # Server startup scripts
│   └── tools/            # Development utilities
├── static/               # Frontend assets (CSS, JS, images)
└── templates/            # HTML templates
```

See [STRUCTURE.md](STRUCTURE.md) for detailed repository organization.

## API Documentation

### Authentication Required
All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### Key Endpoints

**Account**
- `GET /api/account` - Account information
- `GET /api/characters` - Character list
- `GET /api/wallet` - Account wallet
- `GET /api/bank` - Bank contents
- `GET /api/materials` - Material storage

**Trading Post**
- `GET /api/tp/prices?ids=<id>` - Current prices
- `GET /api/tp/listings/<id>` - Detailed listings
- `GET /api/tp/economics/<id>` - Market analysis
- `GET /api/tp/transactions/<type>` - Transaction history
- `GET /api/items/search?q=<query>` - Item search

**WvW**
- `GET /api/wvw/match/<world_id>` - Current match data
- `GET /api/wvw/activity/<world_id>` - Objective history
- `GET /api/wvw/kdr/<world_id>` - K/D ratio history
- `GET /api/wvw/ppt/<world_id>` - Points-per-tick history
- `GET /api/wvw/tracked-guilds/<match_id>` - Guild tracking

## Configuration

### .env Variables
```
DATABASE_URL=postgresql://user:password@localhost/gw2api
GW2_API_KEY=<your-api-key>
JWT_SECRET_KEY=<32-byte-hex-key>
SECRET_KEY=<32-byte-hex-key>
API_KEY_ENCRYPTION_KEY=<fernet-key>
FLASK_ENV=production
```

### Polling Intervals
Configure how often data is refreshed:
- **Dashboard**: 30 seconds (configurable)
- **Maps**: 15 seconds (configurable)
- **Background Tracking**: 5 minutes (match data collection)
- **Item Cache**: 6 hours (trading post items)

## Performance

### Optimization Features
- PostgreSQL item search (< 100ms responses)
- In-memory match data caching (30-second TTL)
- Batch API requests (200 items per request)
- Progressive chart loading (low-res then high-res)
- WebP image support with JPG fallbacks

### Resource Usage
- Memory: ~100-200MB (depends on historical data)
- Disk: ~50MB (database + map images)
- Network: ~5KB per polling cycle
- GW2 API: Well within rate limits (600 req/min, 30k/hour)

## Troubleshooting

### Maps Not Loading
- Check nginx configuration for `/gw2api/static/` paths
- Verify map files exist in `static/maps/`
- Clear browser cache and reload

### Item Search Slow
- First search loads 27,000+ items into PostgreSQL (2-3 minutes)
- Subsequent searches return instantly (< 100ms)
- Background thread handles loading, shows "loading" message while in progress

### Authentication Issues
- JWT tokens expire after 7 days
- Clear browser storage and log in again
- Check `.env` for valid JWT_SECRET_KEY

### Database Connection
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check DATABASE_URL in `.env`
- Ensure user has permissions: `CREATE TABLE`, `INSERT`, `SELECT`

## Deployment

### Production Setup
1. Use HTTPS with valid SSL certificate
2. Configure nginx reverse proxy at `/gw2api/` path
3. Set `FLASK_ENV=production` in `.env`
4. Configure PostgreSQL with strong passwords
5. Use systemd service for auto-restart
6. Enable HSTS header for security

### Example nginx config:
```nginx
location /gw2api/static/ {
    alias /home/GW2API/GW2API/static/;
    expires 30d;
}

location /gw2api/ {
    rewrite ^/gw2api/(.*) /$1 break;
    proxy_pass http://localhost:5555;
    proxy_set_header Authorization $http_authorization;
}
```

## License

This project interfaces with the Guild Wars 2 API. Please review [ArenaNet's API Terms of Use](https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/).

## Support

For issues, feature requests, or documentation:
1. Check existing GitHub issues
2. Review [CLAUDE.md](docs/CLAUDE.md) for technical details
3. Check [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for production setup

## Recent Updates

- **Database-Backed Item Search** - 27,000+ tradeable items stored in PostgreSQL
- **Multi-Tenant Authentication** - Secure user accounts with JWT tokens
- **Interactive War Room Maps** - Real-time WvW objective visualization
- **Market Economics** - Detailed buy/sell analysis for trading post items
- **7-Day Historical Tracking** - K/D ratios, objective activity, and guild claims

---

Built with ❤️ for the GW2 community
