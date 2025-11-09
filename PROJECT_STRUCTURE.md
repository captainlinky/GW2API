# Project Structure

## Overview
```
GW2API/
├── Core Application
│   ├── app.py                  # Flask web server with WvW tracking
│   ├── gw2api.py              # GW2 API client library
│   ├── cli.py                 # Command-line interface
│   └── wvw_tracker.py         # Guild tracking system
│
├── Web Interface
│   ├── templates/
│   │   └── index.html         # Dashboard HTML
│   └── static/
│       ├── app.js             # Frontend logic & charts
│       ├── style.css          # Styling
│       └── wvw-maps.js        # WvW map rendering
│
├── Configuration
│   ├── .env                   # API keys (not in git)
│   ├── .env.example           # Template for API keys
│   ├── .gitignore            # Git exclusions
│   └── requirements.txt       # Python dependencies
│
├── Documentation
│   ├── README.md              # Main project documentation
│   ├── WVW_DASHBOARD.md       # WvW dashboard guide
│   ├── WEB_UI_GUIDE.md        # Web interface guide
│   ├── WVW_GUIDE.md           # WvW API reference
│   ├── GUILD_INFO_GUIDE.md    # Guild tracking guide
│   ├── TRACKING_FEATURE.md    # Historical tracking docs
│   ├── PERFORMANCE_IMPROVEMENTS.md
│   ├── QUICKSTART.md          # Quick start guide
│   └── PROJECT_STRUCTURE.md   # This file
│
├── Scripts & Examples
│   ├── start_ui.sh            # Server startup script
│   ├── examples.py            # API usage examples
│   ├── examples.sh            # Shell examples
│   └── quickref.py            # Quick reference
│
└── Data Storage (gitignored)
    ├── server.log             # Server logs
    ├── kdr_history.json       # K/D tracking data
    ├── activity_history.json  # Objective ownership data
    └── wvw_data/
        └── current_match.json # Guild tracking data
```

## Core Files

### app.py (1351 lines)
**Purpose**: Flask web server with background WvW tracking

**Key Components**:
- **Flask Routes**: `/api/account`, `/api/wvw/match`, `/api/wvw/activity`, `/api/wvw/kdr`
- **Background Thread**: Records snapshots every 15 minutes
- **Tracking Functions**:
  - `record_kdr_snapshot()` - K/D ratio tracking
  - `record_activity_snapshot()` - Objective ownership tracking
  - `update_guild_tracking()` - Guild claim tracking
  - `kdr_tracking_loop()` - Main background loop
- **Data Management**: Thread-safe file I/O with locking
- **API Integration**: Uses `gw2api.GW2API` client

### gw2api.py
**Purpose**: Guild Wars 2 API client library

**Key Components**:
- `GW2API` class - Main API client
- HTTP request handling with rate limiting
- Endpoint methods (account, characters, trading post, WvW)
- Error handling and retries
- Bulk endpoint support

### wvw_tracker.py (259 lines)
**Purpose**: Persistent guild tracking with file locking

**Key Components**:
- `WvWTracker` class - Guild tracking manager
- **File Locking**: fcntl-based (Unix) for concurrent access
- **Data Structure**: 
  - Match metadata
  - Team information
  - Guild dictionaries per team
- **Methods**:
  - `update_match()` - Process match data and extract guilds
  - `get_tracked_guilds()` - Retrieve guilds by team
  - `cleanup_old_matches()` - Remove 7+ day old data
- **Thread Safety**: LOCK_SH (read), LOCK_EX (write)

### cli.py
**Purpose**: Command-line interface for API queries

**Features**:
- Argument parsing
- Multiple display formats (json, table, summary, compact)
- Direct endpoint access
- Account, character, trading post commands

## Web Interface

### templates/index.html
**Purpose**: Single-page dashboard

**Sections**:
- Dashboard tab - Account overview
- Trading Post tab - Price checking
- WvW tab - Match display with charts
- Settings tab - API key management

**Features**:
- Responsive layout
- Tab navigation
- Dynamic content loading
- Canvas-based charts

### static/app.js (2221 lines)
**Purpose**: Frontend logic and visualization

**Key Functions**:
- `renderActivityChart()` - Objective ownership chart (lines 420-620)
- `renderKDRChart()` - K/D ratio chart (lines 751-970)
- `updateDashboardStats()` - Dashboard data refresh
- `updateTeamBars()` - Team score visualization
- Chart tooltip system with proximity detection
- Auto-refresh every 30 seconds

**Technologies**:
- Vanilla JavaScript (no frameworks)
- HTML5 Canvas for charts
- Fetch API for backend communication
- Mouse event handling for interactivity

### static/style.css
**Purpose**: Visual styling

**Features**:
- Dark theme (#1a1a1a background)
- Team colors (red: #e74c3c, green: #27ae60, blue: #3498db)
- Responsive layout
- Chart containers with positioning
- Tab navigation styling

### static/wvw-maps.js
**Purpose**: WvW map rendering and objective display

## Data Flow

### 1. Background Data Collection
```
Every 15 minutes:
  ↓
kdr_tracking_loop()
  ↓
├─→ record_kdr_snapshot()     → kdr_history.json
├─→ record_activity_snapshot() → activity_history.json
└─→ update_guild_tracking()    → wvw_data/current_match.json
```

### 2. Dashboard Data Request
```
Browser loads → app.js
  ↓
Fetch /api/wvw/match/1020
  ↓
Flask route handler
  ↓
├─→ GW2API.get_wvw_match_by_world()
├─→ Fetch guild info (parallel)
└─→ update_guild_tracking()
  ↓
Return enriched match data
  ↓
renderActivityChart() + renderKDRChart()
```

### 3. Historical Chart Rendering
```
Browser requests /api/wvw/activity/1020
  ↓
Load activity_history.json
  ↓
Filter last 6 hours of data
  ↓
Calculate time buckets (15-min intervals)
  ↓
Return timeline with team objectives
  ↓
Frontend renders line chart with tooltips
```

## Configuration

### .env
```bash
GW2_API_KEY=your-api-key-here
```

**Required Permissions**:
- `account` - Basic account data
- `characters` - Character information
- `inventories` - Bank and inventory
- `guilds` - Guild names and tags ← For WvW guild tracking
- `tradingpost` - Trading post data
- `progression` - Achievement progress

### requirements.txt
```
requests>=2.31.0      # HTTP client
tabulate>=0.9.0       # Table formatting
colorama>=0.4.6       # Colored CLI output
python-dotenv>=1.0.0  # Environment variables
flask>=3.0.0          # Web server
flask-cors>=4.0.0     # CORS support
```

## Data Storage

### kdr_history.json
**Structure**:
```json
{
  "1-2": [
    {
      "timestamp": "2025-11-09T12:00:00Z",
      "red_kdr": 1.02,
      "green_kdr": 1.28,
      "blue_kdr": 0.62,
      "red_kills": 12450,
      "green_kills": 15600,
      "blue_kills": 7540,
      "red_deaths": 12190,
      "green_deaths": 12180,
      "blue_deaths": 12150
    }
  ]
}
```

**Retention**: 7 days (168 snapshots at 15-min intervals)

### activity_history.json
**Structure**:
```json
{
  "1-2": [
    {
      "timestamp": "2025-11-09T12:00:00Z",
      "red_objectives": 16,
      "green_objectives": 41,
      "blue_objectives": 34,
      "red_types": {"Keep": 2, "Tower": 5, "Camp": 9, "Castle": 0},
      "green_types": {"Keep": 3, "Tower": 12, "Camp": 26, "Castle": 0},
      "blue_types": {"Keep": 2, "Tower": 10, "Camp": 22, "Castle": 0}
    }
  ]
}
```

**Retention**: 7 days (168 snapshots at 15-min intervals)

### wvw_data/current_match.json
**Structure**:
```json
{
  "1-2": {
    "match_id": "1-2",
    "start_time": "2025-11-08T18:00:00Z",
    "end_time": "2025-11-15T18:00:00Z",
    "first_seen": "2025-11-09T08:00:00Z",
    "last_updated": "2025-11-09T12:00:00Z",
    "teams": {
      "red": {
        "main_world": "Anvil Rock",
        "guilds": {
          "ABC123": {
            "id": "ABC123",
            "name": "Guild Name",
            "tag": "TAG",
            "first_seen": "2025-11-09T08:00:00Z"
          }
        }
      },
      "green": {...},
      "blue": {...}
    }
  }
}
```

**Retention**: 7 days (cleaned up automatically)

## Thread Safety

### File Locking Strategy
- **kdr_history.json**: `threading.Lock()` for Python-level safety
- **activity_history.json**: `threading.Lock()` for Python-level safety
- **wvw_data/current_match.json**: `fcntl.flock()` for OS-level safety
  - LOCK_SH (shared) for reads - allows concurrent readers
  - LOCK_EX (exclusive) for writes - blocks all other access
  - Prevents corruption from concurrent web requests + background thread

### Why Different Locking?
- K/D and activity files: Only written by background thread → Python locks sufficient
- Guild tracking file: Written by background thread AND web requests → OS locks required

## API Rate Limiting

Guild Wars 2 API limits:
- **600 requests per minute** per IP
- **30,000 requests per hour** per IP

### Optimization Strategies
1. **Bulk Endpoints**: Fetch multiple guilds in parallel
2. **Caching**: Background thread caches match data
3. **Efficient Queries**: Use enriched endpoints to reduce calls
4. **Minimal Polling**: 15-minute background intervals

## Development

### Starting the Server
```bash
# Method 1: Direct
python3 app.py

# Method 2: Script
./start_ui.sh

# Method 3: Background
nohup python3 app.py > server.log 2>&1 &
```

### Testing
```bash
# Check server status
pgrep -f "python3 app.py"

# Test API endpoint
curl http://localhost:5555/api/wvw/match/1020

# Check guild tracking
curl http://localhost:5555/api/wvw/tracked-guilds/1-2

# Monitor logs
tail -f server.log
```

### Debugging
```bash
# Check historical data
cat kdr_history.json | python3 -m json.tool | head -50
cat activity_history.json | python3 -m json.tool | head -50

# Validate guild tracking file
cat wvw_data/current_match.json | python3 -m json.tool

# Check background thread status
# Look for "[TRACKING]" "[KDR]" "[ACTIVITY]" "[GUILDS]" in logs
grep -E "\[TRACKING\]|\[KDR\]|\[ACTIVITY\]|\[GUILDS\]" server.log
```

## Deployment Checklist

Before pushing to GitHub:

- [x] Remove temporary files (test.py, demo.py, output.jpg)
- [x] Update .gitignore (server.log, *.json, wvw_data/)
- [x] Clean up old documentation files
- [x] Add comprehensive docstrings
- [x] Create WVW_DASHBOARD.md
- [x] Update main README.md
- [x] Verify requirements.txt
- [x] Document project structure
- [ ] Add LICENSE file
- [ ] Add CONTRIBUTING.md (optional)
- [ ] Test fresh installation

## License

This tool interfaces with the Guild Wars 2 API. Please review ArenaNet's API Terms of Use:
https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/

## Contributing

See individual documentation files for extending specific features:
- **WVW_DASHBOARD.md** - Adding charts or tracking features
- **WEB_UI_GUIDE.md** - Modifying the web interface
- **gw2api.py** - Adding new API endpoints
