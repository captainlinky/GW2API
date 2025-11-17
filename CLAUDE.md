# CLAUDE.md - AI Assistant Guide for GW2API

This document provides comprehensive guidance for AI assistants working with the GW2API codebase.

## Table of Contents
1. [Project Overview](#project-overview)
2. [Codebase Structure](#codebase-structure)
3. [Technology Stack](#technology-stack)
4. [Key Conventions and Patterns](#key-conventions-and-patterns)
5. [Development Workflows](#development-workflows)
6. [Important Files Reference](#important-files-reference)
7. [Testing and Quality](#testing-and-quality)
8. [Common Tasks Guide](#common-tasks-guide)
9. [Things to Watch Out For](#things-to-watch-out-for)
10. [Quick Reference](#quick-reference)

---

## Project Overview

**GW2API** is a Python Flask web application that provides a comprehensive interface to the Guild Wars 2 API with real-time World vs World (WvW) tracking capabilities. It consists of:

- **Backend**: Flask REST API server with background tracking threads
- **Frontend**: Single-page application using vanilla JavaScript and HTML5 Canvas
- **Data Layer**: JSON file-based persistence with thread-safe file locking
- **Features**: Account management, trading post queries, WvW live tracking, guild discovery, historical data analysis

**Key Capabilities**:
- Real-time WvW match tracking with 15-minute snapshots
- Historical K/D ratio and objective ownership tracking (7 days)
- Automatic guild discovery from WvW objectives
- Progressive Web App (PWA) support for mobile installation
- Command-line interface for quick API queries
- Multi-format output (JSON, table, summary, compact)

---

## Codebase Structure

```
GW2API/
├── Core Python Backend
│   ├── app.py                    # Flask server + WvW tracking (2288 lines)
│   ├── gw2api.py                 # GW2 API client library (509 lines)
│   ├── wvw_tracker.py            # Guild tracking with file locking (298 lines)
│   ├── cli.py                    # Command-line interface (174 lines)
│   ├── examples.py               # Interactive examples (259 lines)
│   ├── quickref.py               # Quick reference utility (95 lines)
│   └── generate_icons.py         # Icon generation script (106 lines)
│
├── Frontend Web Interface
│   ├── templates/
│   │   └── index.html            # Single-page dashboard
│   └── static/
│       ├── app.js                # Frontend logic + charts (3157 lines)
│       ├── wvw-maps.js           # WvW interactive maps (420 lines)
│       ├── style.css             # Dark theme styling (28KB)
│       ├── manifest.json         # PWA configuration
│       └── [icons and map assets]
│
├── Configuration
│   ├── .env                      # API keys (gitignored, create from .env.example)
│   ├── .env.example              # Configuration template
│   ├── .gitignore                # Git exclusions
│   ├── requirements.txt          # Python dependencies
│   ├── alliance_names.json       # World/alliance name mappings
│   ├── start_ui.sh               # Unix startup script
│   └── start_windows.ps1         # Windows startup script
│
├── Documentation (11+ files)
│   ├── README.md                 # Main project documentation
│   ├── PROJECT_STRUCTURE.md      # Detailed structure guide
│   ├── WVW_DASHBOARD.md          # WvW dashboard features
│   ├── WEB_UI_GUIDE.md           # Web interface guide
│   ├── WVW_GUIDE.md              # WvW API reference
│   └── [other guides]
│
└── Runtime Data (gitignored)
    ├── server.log                # Application logs
    ├── kdr_history.json          # 7-day K/D snapshots
    ├── activity_history.json     # 7-day objective ownership
    └── wvw_data/
        └── current_match.json    # Live guild tracking data
```

---

## Technology Stack

### Backend
| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.7+ | Core language |
| Flask | 3.0.0+ | Web framework |
| flask-cors | 4.0.0+ | Cross-origin support |
| requests | 2.31.0+ | HTTP client |
| python-dotenv | 1.0.0+ | Environment variables |
| tabulate | 0.9.0+ | CLI table formatting |
| colorama | 0.4.6+ | Colored terminal output |

### Frontend
- **JavaScript**: Vanilla ES6+ (no frameworks)
- **Canvas API**: Chart rendering
- **Fetch API**: Backend communication
- **CSS3**: Responsive dark theme
- **PWA**: Offline-capable with manifest

### Data Storage
- **JSON files**: Persistent storage
- **fcntl**: OS-level file locking (Unix/Linux)
- **threading.Lock**: Python-level synchronization

### Key Python Patterns
```python
# Type hints used throughout
from typing import Dict, List, Optional, Union

# Functools for caching
from functools import lru_cache

# Threading for background tasks
import threading

# File locking (Unix only)
import fcntl  # Disabled automatically on Windows
```

---

## Key Conventions and Patterns

### 1. API Client Pattern (gw2api.py)

**Caching Strategy**:
```python
class SimpleCache:
    """5-minute TTL-based in-memory cache"""
    def __init__(self, ttl_seconds=300):
        self.cache = {}
        self.ttl = ttl_seconds
```

**Request Pattern**:
- All API calls go through `_request()` method
- Bearer token authentication in headers
- 5-second timeout on all requests
- Automatic caching with cache key: `endpoint:params_json`
- Bulk endpoint support (pass multiple IDs)

**Key Convention**: Always use the client library, never make direct requests

### 2. Flask Route Pattern (app.py)

**Standard Route Structure**:
```python
@app.route('/api/endpoint/<param>')
def endpoint_handler(param):
    """Clear docstring describing endpoint"""
    try:
        # 1. Validate input
        param = int(param)

        # 2. Check authentication
        client = GW2API(api_key=get_current_api_key())
        if not client.api_key:
            return jsonify({'status': 'error', 'message': 'API key required'}), 401

        # 3. Fetch data
        data = client.get_something(param)

        # 4. Process/enrich data
        enriched = process_data(data)

        # 5. Return standardized response
        return jsonify({'status': 'success', 'data': enriched})

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

**Response Format Convention**:
```python
# Success response
{'status': 'success', 'data': {...}}

# Error response
{'status': 'error', 'message': 'Error description'}
```

### 3. Thread Safety Pattern (wvw_tracker.py)

**File Locking Strategy**:
```python
# Unix systems only (disabled on Windows)
import fcntl

# Read with shared lock
with open(file, 'r') as f:
    if HAS_FCNTL:
        fcntl.flock(f.fileno(), fcntl.LOCK_SH)
    try:
        data = json.load(f)
    finally:
        if HAS_FCNTL:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)

# Write with exclusive lock
with open(file, 'r+') as f:
    if HAS_FCNTL:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
    try:
        f.seek(0)
        f.truncate()
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())  # Force disk sync
    finally:
        if HAS_FCNTL:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
```

**Threading Pattern**:
- Background thread runs as daemon: `daemon=True`
- Use `threading.Lock()` for Python-level synchronization
- Always catch exceptions in infinite loops to prevent crash
- Sleep between iterations (900 seconds = 15 minutes)

### 4. Frontend Patterns (app.js)

**Global State Management**:
```javascript
window.GW2Data = {
    matchData: null,
    matchDataTimestamp: null,
    loadingMatch: null,  // Prevent concurrent loads

    async getMatchData(worldId, forceRefresh = false) {
        // Check cache age (30 seconds)
        // Deduplicate concurrent requests
        // Return cached or fetch fresh data
    }
};
```

**Canvas Rendering Pattern**:
```javascript
function renderChart() {
    const canvas = document.getElementById('chart-id');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    // Define margins
    const margin = {left: 60, right: 20, top: 40, bottom: 30};
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw chart elements
    // ...
}
```

**Polling Pattern**:
```javascript
let pollingInterval = null;

function startPolling(intervalSeconds) {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(() => {
        updateData();
    }, intervalSeconds * 1000);
}
```

### 5. Logging Conventions

**Backend Logging**:
```python
import logging

logger = logging.getLogger(__name__)

# Standard prefixes for filtering
logger.info("[TRACKING] Background thread started")
logger.info("[KDR] Recording snapshot")
logger.info("[ACTIVITY] Recording objective ownership")
logger.info("[GUILDS] Updating guild tracking")
logger.error(f"[ERROR] Failed to process: {e}", exc_info=True)
```

**Frontend Logging**:
```javascript
console.log('Using cached match data');
console.warn('Failed to load data:', error);
console.error('API request failed:', error);
```

### 6. Data Structure Conventions

**Match Data Structure** (current_match.json):
```python
{
    "match_id": "1-2",  # Format: tier-region
    "start_time": "ISO 8601 timestamp",
    "end_time": "ISO 8601 timestamp",
    "first_seen": "ISO 8601 timestamp",
    "last_updated": "ISO 8601 timestamp",
    "world_id": 1020,  # Main world tracking
    "teams": {
        "red": {
            "main_world": "World Name",
            "main_world_id": 1020,
            "display_name": "Custom Display Name",
            "linked_worlds": [
                {"id": 2003, "name": "Linked World"}
            ],
            "guilds": {
                "guild_id": {
                    "id": "guild_id",
                    "name": "Guild Name",
                    "tag": "[TAG]",
                    "first_seen": "ISO 8601",
                    "last_seen": "ISO 8601",
                    "objective_types": ["Keep", "Tower"],
                    "maps_seen": ["RedBorderlands", "EternalBattleground"]
                }
            }
        },
        "green": {...},
        "blue": {...}
    }
}
```

**Time-Series Data Structure** (kdr_history.json, activity_history.json):
```python
{
    "match_id": [
        {
            "timestamp": "ISO 8601",
            "red_kdr": 1.02,
            "green_kdr": 1.28,
            "blue_kdr": 0.62,
            # ... additional metrics
        }
    ]
}
```

### 7. Naming Conventions

**Files**:
- `snake_case.py` for Python modules
- `kebab-case.js` for JavaScript files
- `UPPERCASE.md` for documentation
- `lowercase.json` for data files

**Python**:
- `snake_case` for functions, variables, methods
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for constants
- `_leading_underscore` for internal/private methods

**JavaScript**:
- `camelCase` for functions and variables
- `PascalCase` for classes (rare, not used much)
- `UPPER_SNAKE_CASE` for constants

**API Routes**:
- `/api/resource` for collections
- `/api/resource/<id>` for specific items
- `/api/resource/<id>/sub-resource` for nested resources
- Kebab-case for multi-word resources: `/api/wvw/match/<id>`

---

## Development Workflows

### Initial Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd GW2API

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure API key
cp .env.example .env
# Edit .env and add your GW2_API_KEY

# 4. Run server
python3 app.py
# or
./start_ui.sh

# 5. Access web interface
# Open browser to http://localhost:5555
```

### Adding a New API Endpoint

**Step 1: Add method to gw2api.py**
```python
def get_new_endpoint(self, param: str) -> Dict:
    """
    Get new data from GW2 API.

    Args:
        param: Description of parameter

    Returns:
        Dictionary containing endpoint data
    """
    return self._request(f'new/endpoint/{param}')
```

**Step 2: Add Flask route to app.py**
```python
@app.route('/api/new-endpoint/<param>')
def get_new_endpoint_handler(param):
    """API endpoint for new data"""
    try:
        client = GW2API(api_key=get_current_api_key())
        if not client.api_key:
            return jsonify({'status': 'error', 'message': 'API key required'}), 401

        data = client.get_new_endpoint(param)
        return jsonify({'status': 'success', 'data': data})

    except Exception as e:
        logger.error(f"Error in new endpoint: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

**Step 3: Add frontend function to app.js** (if needed)
```javascript
async function loadNewData(param) {
    try {
        const response = await fetch(`/api/new-endpoint/${param}`);
        const data = await response.json();

        if (data.status === 'success') {
            return data.data;
        } else {
            console.error('Failed to load data:', data.message);
            return null;
        }
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}
```

### Modifying Background Tracking

**Location**: `app.py`, function `kdr_tracking_loop()`

**Pattern**:
1. Fetch current match data
2. Process and extract metrics
3. Save to JSON file with proper locking
4. Log the operation with prefix
5. Handle errors gracefully (continue loop on failure)

**Example** (adding new metric):
```python
def kdr_tracking_loop():
    while True:
        try:
            # ... existing code ...

            # Add new metric tracking
            new_metric = calculate_new_metric(match)

            # Save to new history file with locking
            with new_metric_lock:
                history = load_new_metric_history()
                history.setdefault(match_id, []).append({
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                    'metric_value': new_metric
                })
                save_new_metric_history(history)

            logger.info(f"[NEW_METRIC] Recorded: {new_metric}")

            time.sleep(900)  # 15 minutes
        except Exception as e:
            logger.error(f"[TRACKING] Error: {e}", exc_info=True)
            time.sleep(900)
```

### Adding a New Frontend Tab

**Step 1: Add tab button in index.html**
```html
<div class="tabs">
    <!-- existing tabs -->
    <button class="tab-button" onclick="showTab('newtab')">New Feature</button>
</div>

<div id="newtab" class="tab-content">
    <h2>New Feature</h2>
    <div id="new-feature-content">
        <!-- content here -->
    </div>
</div>
```

**Step 2: Add tab handler in app.js**
```javascript
function showTab(tabName) {
    // ... existing code ...

    if (tabName === 'newtab') {
        loadNewFeatureData();
    }
}

async function loadNewFeatureData() {
    // Implementation
}
```

**Step 3: Add CSS styling in style.css** (if needed)

### Testing Changes

**Backend Testing**:
```bash
# Test API client directly
python3
>>> from gw2api import GW2API
>>> client = GW2API()
>>> result = client.get_account()
>>> print(result)

# Test CLI
python3 cli.py account -f json

# Test Flask endpoint
curl http://localhost:5555/api/account
```

**Frontend Testing**:
```javascript
// Open browser console
// Test data loading
await window.GW2Data.getMatchData(1020, true);

// Test chart rendering
renderActivityChart();
```

**Log Monitoring**:
```bash
# Watch server logs
tail -f server.log

# Filter for specific operations
grep "\[TRACKING\]\|\[KDR\]\|\[ACTIVITY\]" server.log | tail -20

# Check for errors
grep "ERROR\|WARNING" server.log | tail -20
```

### Git Workflow

**Branch Naming**:
- Feature branches: `feature/description`
- Bug fixes: `bugfix/description`
- AI-generated branches: `claude/claude-md-<session-id>`

**Commit Guidelines**:
- Clear, descriptive commit messages
- Focus on "why" not just "what"
- Reference issue numbers if applicable

**Example Commits**:
```bash
git commit -m "Add PPT timeline chart to dashboard

- Implement canvas-based points-per-tick visualization
- Add 6-hour historical data display
- Include team color coding and legend"

git commit -m "Fix guild tracking file locking on Windows

- Disable fcntl usage on win32 platform
- Add fallback for Windows single-process safety
- Update documentation with platform notes"
```

**Pre-commit Checks**:
1. Run basic smoke tests (server starts, no syntax errors)
2. Check for sensitive data (.env should never be committed)
3. Verify log output looks reasonable
4. Test at least one affected endpoint manually

---

## Important Files Reference

### app.py (2288 lines)
**Purpose**: Main Flask application server

**Key Components**:
- Flask app initialization with CORS
- 30+ API route handlers
- Background tracking thread (`kdr_tracking_loop()`)
- Data enrichment functions
- File management with thread safety
- Alliance name mapping system

**Critical Functions**:
- `kdr_tracking_loop()` - Background thread main loop (lines ~466-540)
- `build_enriched_match()` - Data enrichment (lines ~200-400)
- `load_kdr_history()` / `save_kdr_history()` - K/D data persistence
- `load_activity_history()` / `save_activity_history()` - Activity persistence
- `update_guild_tracking()` - Guild tracking integration

**API Routes**:
- Account: `/api/account`, `/api/characters`, `/api/wallet`, etc.
- Trading: `/api/tp/prices`, `/api/tp/transactions/<type>`
- WvW: `/api/wvw/match/<id>`, `/api/wvw/activity/<id>`, `/api/wvw/kdr/<id>`
- Admin: `/api/key`, `/api/polling-config`, `/api/wvw/update-alliance-names`

### gw2api.py (509 lines)
**Purpose**: GW2 API client library

**Key Classes**:
- `SimpleCache` - 5-minute TTL cache (lines 1-30)
- `GW2API` - Main API client (lines 31-509)

**Key Methods**:
- `_request()` - Core HTTP request handler with caching
- Account methods: `get_account()`, `get_characters()`, `get_account_wallet()`
- WvW methods: `get_wvw_matches()`, `get_wvw_match_by_world()`
- Trading Post: `get_tp_prices()`, `get_tp_listings()`
- Guild: `get_guild(guild_id)`

**Important Notes**:
- All requests use 5-second timeout
- Bearer token authentication
- Automatic caching with TTL
- Bulk endpoint support

### wvw_tracker.py (298 lines)
**Purpose**: Persistent guild tracking system

**Key Class**: `WvWTracker`

**Key Methods**:
- `update_match()` - Main tracking update function
- `get_guilds_by_team()` - Query guilds for a team
- `get_all_guilds_sorted()` - Get all guilds sorted by activity
- `is_match_current()` - Check if match is still active
- `cleanup_old_matches()` - Remove stale data

**File Locking**:
- Unix: Uses `fcntl.flock()` for OS-level locking
- Windows: Disabled (single-process safe only)
- Shared lock (LOCK_SH) for reads
- Exclusive lock (LOCK_EX) for writes

**Data File**: `wvw_data/current_match.json`

### app.js (3157 lines)
**Purpose**: Frontend application logic

**Key Components**:
- Global state management: `window.GW2Data`
- Chart rendering functions (Activity, K/D, PPT timelines)
- Tab management and navigation
- API communication layer
- Polling system with configurable intervals
- Error handling and retries

**Key Functions**:
- `updateDashboardStats()` - Main dashboard refresh
- `renderActivityChart()` - Objective ownership chart
- `renderKDRChart()` - Kill/Death ratio chart
- `renderPPTChart()` - Points per tick timeline
- `startDashboardPolling()` - Auto-refresh management

**Polling Defaults**:
- Dashboard: 60 seconds
- Interactive maps: 30 seconds
- Configurable via `/api/polling-config`

### index.html
**Purpose**: Single-page application structure

**Structure**:
- 6 main tabs: Dashboard, Account, Characters, Trading, Query, Settings
- Canvas elements for charts
- Form controls for API key management
- Responsive grid layout

**Key Sections**:
- Dashboard: WvW stats with charts
- Account: Character list and account info
- Trading Post: Price queries and transaction history
- Settings: API key and polling configuration

### style.css (28KB)
**Purpose**: Application styling

**Key Features**:
- Dark theme (#1a1a1a background)
- Team color variables (Red: #e74c3c, Green: #27ae60, Blue: #3498db)
- Responsive breakpoints for mobile
- Card-based layout with shadows
- Gradient effects and animations

### alliance_names.json
**Purpose**: Custom world/alliance name mappings

**Structure**:
```json
{
    "overrides": {
        "world_id": "Custom Display Name"
    },
    "team_names": {
        "match_id": {
            "red": "Team Name",
            "green": "Team Name",
            "blue": "Team Name"
        }
    },
    "alliances": {
        "alliance_id": "Alliance Name"
    }
}
```

**Usage**: Override default world names with custom alliance names

---

## Testing and Quality

### No Automated Testing
**Important**: This project does not have automated unit tests or integration tests. All testing is manual.

### Manual Testing Checklist

**Backend Testing**:
```bash
# 1. Test server starts without errors
python3 app.py

# 2. Test API client directly
python3
>>> from gw2api import GW2API
>>> client = GW2API()
>>> account = client.get_account()
>>> print(account)

# 3. Test CLI commands
python3 cli.py account
python3 cli.py wallet -f table
python3 cli.py wvw-matches

# 4. Test API endpoints
curl http://localhost:5555/api/status
curl http://localhost:5555/api/account
curl http://localhost:5555/api/wvw/match/1020

# 5. Verify background thread
grep "\[TRACKING\]" server.log | tail -5
```

**Frontend Testing**:
```javascript
// 1. Open http://localhost:5555 in browser
// 2. Open browser console (F12)
// 3. Test data loading
await window.GW2Data.getMatchData(1020, true);

// 4. Test chart rendering
renderActivityChart();

// 5. Check for console errors
// Should see no red errors in console
```

**Data File Testing**:
```bash
# Validate JSON structure
cat kdr_history.json | python3 -m json.tool > /dev/null && echo "Valid JSON"
cat activity_history.json | python3 -m json.tool > /dev/null && echo "Valid JSON"
cat wvw_data/current_match.json | python3 -m json.tool > /dev/null && echo "Valid JSON"

# Check data freshness
ls -lh kdr_history.json activity_history.json wvw_data/
```

### Code Quality Practices

**Python**:
- Use type hints for function signatures
- Write clear docstrings for public functions
- Handle exceptions explicitly
- Use context managers (`with`) for file operations
- Log errors with `exc_info=True` for stack traces

**JavaScript**:
- Use async/await for promises
- Handle errors in try-catch blocks
- Validate data before processing
- Use descriptive variable names
- Add console logging for debugging

**General**:
- Keep functions focused and single-purpose
- Avoid deep nesting (max 3-4 levels)
- Use early returns for error cases
- Comment complex logic
- Update documentation when making changes

---

## Common Tasks Guide

### Task: Add Support for a New GW2 API Endpoint

**Steps**:
1. Read GW2 API documentation for the endpoint
2. Add method to `gw2api.py` with proper type hints
3. Add Flask route to `app.py` following standard pattern
4. Test with curl or Python REPL
5. Add frontend function if needed
6. Update documentation

**Example**: Adding `/v2/achievements/categories` support

```python
# 1. In gw2api.py
def get_achievement_categories(self, category_ids: Union[List[int], None] = None) -> Union[List[int], List[Dict]]:
    """
    Get achievement categories.

    Args:
        category_ids: List of category IDs, or None for all IDs

    Returns:
        List of category IDs or full category details
    """
    if category_ids is None:
        return self._request('achievements/categories')

    ids_str = ','.join(str(id) for id in category_ids)
    return self._request(f'achievements/categories?ids={ids_str}')

# 2. In app.py
@app.route('/api/achievement-categories')
@app.route('/api/achievement-categories/<ids>')
def get_achievement_categories_handler(ids=None):
    """Get achievement categories"""
    try:
        client = GW2API(api_key=get_current_api_key())

        if ids:
            category_ids = [int(id) for id in ids.split(',')]
            data = client.get_achievement_categories(category_ids)
        else:
            data = client.get_achievement_categories()

        return jsonify({'status': 'success', 'data': data})

    except Exception as e:
        logger.error(f"Error fetching achievement categories: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 3. Test
curl http://localhost:5555/api/achievement-categories
curl http://localhost:5555/api/achievement-categories/1,2,3
```

### Task: Add a New Chart to the Dashboard

**Steps**:
1. Create canvas element in `index.html`
2. Add chart rendering function in `app.js`
3. Add data fetching function
4. Integrate into dashboard update cycle
5. Add styling in `style.css`

**Example**: Adding a "Deaths Timeline" chart

```html
<!-- 1. In index.html, Dashboard tab -->
<div class="chart-container">
    <h3>Deaths Timeline</h3>
    <canvas id="deaths-chart"></canvas>
</div>
```

```javascript
// 2. In app.js
async function renderDeathsChart() {
    const canvas = document.getElementById('deaths-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    try {
        // Fetch data
        const worldId = await getConfiguredWorldId();
        const response = await fetch(`/api/wvw/kdr/${worldId}`);
        const data = await response.json();

        if (data.status !== 'success') {
            console.error('Failed to load deaths data');
            return;
        }

        const timeline = data.timeline;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Define margins
        const margin = {left: 60, right: 20, top: 40, bottom: 30};
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Draw chart
        // ... (follow existing chart patterns)

    } catch (error) {
        console.error('Error rendering deaths chart:', error);
    }
}

// 3. Add to dashboard update cycle
async function updateDashboardStats() {
    // ... existing code ...
    await renderDeathsChart();
}
```

### Task: Modify Background Tracking Frequency

**Current**: 15-minute intervals (900 seconds)

**To Change**:
1. Locate `kdr_tracking_loop()` in `app.py`
2. Find the `time.sleep(900)` calls
3. Change to desired interval (in seconds)
4. Consider impact on API rate limits
5. Test and monitor logs

**Example**: Change to 10 minutes
```python
def kdr_tracking_loop():
    while True:
        try:
            # ... tracking logic ...
            logger.info("[TRACKING] Completed cycle")
            time.sleep(600)  # 10 minutes instead of 900
        except Exception as e:
            logger.error(f"[TRACKING] Error: {e}", exc_info=True)
            time.sleep(600)  # Also update error case
```

**Important**: GW2 API rate limits are 600 requests/min and 30,000/hour. Be mindful of total request volume.

### Task: Add Custom Alliance Name

**Steps**:
1. Open `alliance_names.json`
2. Add entry to appropriate section
3. Restart server (or use update endpoint)

**Example**:
```json
{
    "overrides": {
        "1020": "Custom Alliance Name"
    },
    "team_names": {
        "1-2": {
            "red": "Red Team Name",
            "green": "Green Team Name",
            "blue": "Blue Team Name"
        }
    }
}
```

**Or via API**:
```bash
curl -X POST http://localhost:5555/api/wvw/update-alliance-names \
  -H "Content-Type: application/json" \
  -d '{"overrides": {"1020": "New Name"}}'
```

### Task: Debug Background Thread Issues

**Steps**:
1. Check if thread is running: `grep "\[TRACKING\]" server.log | tail -5`
2. Look for errors: `grep "ERROR.*TRACKING" server.log`
3. Check data file permissions: `ls -l kdr_history.json activity_history.json wvw_data/`
4. Verify file locking works: `cat wvw_data/current_match.json | python3 -m json.tool`
5. Check API key is valid: `curl http://localhost:5555/api/account`

**Common Issues**:
- File permission errors: Fix with `chmod 644 *.json` and `chmod 755 wvw_data/`
- JSON corruption: Delete corrupt file, will regenerate
- API key expired: Update in `.env` or Settings tab
- Thread crashed: Check logs, restart server

### Task: Deploy to Production

**Steps**:
1. Set up server (Ubuntu/Debian recommended)
2. Install Python 3.7+
3. Clone repository
4. Install dependencies: `pip install -r requirements.txt`
5. Configure `.env` with production API key
6. Set up systemd service (see below)
7. Configure nginx reverse proxy with SSL
8. Set up log rotation
9. Test all endpoints
10. Monitor logs for 24 hours

**Systemd Service** (`/etc/systemd/system/gw2api.service`):
```ini
[Unit]
Description=GW2 API WvW Dashboard
After=network.target

[Service]
Type=simple
User=gw2api
WorkingDirectory=/opt/gw2api
ExecStart=/usr/bin/python3 /opt/gw2api/app.py
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/gw2api/server.log
StandardError=append:/opt/gw2api/server.log

[Install]
WantedBy=multi-user.target
```

**Enable and start**:
```bash
sudo systemctl daemon-reload
sudo systemctl enable gw2api
sudo systemctl start gw2api
sudo systemctl status gw2api
```

---

## Things to Watch Out For

### 1. File Locking Platform Differences
**Issue**: `fcntl` module only available on Unix/Linux
**Impact**: Windows installations don't have OS-level file locking
**Solution**: Code automatically disables locking on Windows (single-process only)
**Watch For**: Concurrent access issues on Windows if running multiple processes

### 2. GW2 API Rate Limits
**Limits**:
- 600 requests per minute per IP
- 30,000 requests per hour per IP

**Current Usage**:
- Background thread: ~5-10 requests every 15 minutes
- Frontend polling: Variable based on user activity

**Watch For**:
- Rate limit errors (HTTP 429)
- Burst traffic from multiple users
- Bulk endpoint failures (pass multiple IDs in one request)

**Mitigation**:
- Use caching (5-minute TTL in gw2api.py)
- Use bulk endpoints where possible
- Increase background thread interval if needed
- Add exponential backoff for retries

### 3. API Key Permissions
**Required Permissions**:
- `account` - Basic account data
- `characters` - Character information
- `inventories` - Bank and inventory
- `guilds` - Guild names (for WvW tracking)
- `tradingpost` - Trading post data
- `progression` - Achievement progress

**Watch For**:
- 401/403 errors indicating missing permissions
- Users not granting `guilds` permission (WvW tracking incomplete)
- API key expiration

### 4. JSON File Corruption
**Issue**: Power loss or crash during write can corrupt JSON files
**Impact**: Server fails to start or tracking breaks

**Watch For**:
- `json.JSONDecodeError` in logs
- Empty or partial JSON files

**Recovery**:
```bash
# Delete corrupt file (will regenerate)
rm kdr_history.json
rm activity_history.json
rm wvw_data/current_match.json

# Restart server
python3 app.py
```

**Prevention**: Code uses `os.fsync()` to force disk writes

### 5. Match Reset Timing
**Issue**: WvW matches reset weekly (Friday 18:00 UTC)
**Impact**: Guild tracking data becomes stale, need new match ID

**Watch For**:
- Old match data displayed after Friday reset
- Guild tracking not updating

**Behavior**: Background thread automatically detects new matches and starts fresh tracking

### 6. Long-Running Background Thread
**Issue**: Background thread runs indefinitely
**Impact**: Can accumulate memory or resources over time

**Watch For**:
- Memory usage growing over days/weeks
- Thread stopping without errors
- File descriptor leaks

**Mitigation**:
- Thread is daemon (stops with main process)
- Files are opened/closed in context managers
- Errors caught and logged, loop continues

**Monitoring**:
```bash
# Check if thread is alive
grep "\[TRACKING\]" server.log | tail -5

# Monitor memory
ps aux | grep "python3 app.py"
```

### 7. Canvas Rendering Performance
**Issue**: Heavy canvas operations can slow browser
**Impact**: UI lag, especially on mobile

**Watch For**:
- Slow chart rendering
- Browser unresponsive
- High CPU usage

**Mitigation**:
- Debounce resize events
- Limit data points displayed (6 hours of data)
- Use `requestAnimationFrame` for animations

### 8. CORS and Same-Origin Policy
**Issue**: Browser security restricts cross-origin requests
**Status**: Handled by `flask-cors` in `app.py`

**Watch For**:
- CORS errors in browser console
- Requests blocked by browser

**Configuration**:
```python
from flask_cors import CORS
CORS(app)  # Enables CORS for all routes
```

### 9. Time Zone Handling
**Convention**: All timestamps in UTC with 'Z' suffix
**Format**: ISO 8601 (e.g., `2025-11-17T12:00:00Z`)

**Watch For**:
- Local time assumptions
- Missing timezone information
- Daylight saving time issues

**Best Practice**: Always use UTC, convert to local in frontend if needed

### 10. Historical Data Retention
**Current**: 7-day retention for K/D and activity history
**Implementation**: Automatic pruning in background thread

**Watch For**:
- Files growing too large (> 10MB)
- Old data not being cleaned up
- Disk space issues

**Monitoring**:
```bash
ls -lh kdr_history.json activity_history.json
du -sh wvw_data/
```

---

## Quick Reference

### Server Operations

```bash
# Start server
python3 app.py
./start_ui.sh

# Start in background
nohup python3 app.py > server.log 2>&1 &

# Stop server
pkill -f "python3 app.py"

# Check if running
ps aux | grep "python3 app.py"
lsof -i :5555

# View logs
tail -f server.log
grep "\[TRACKING\]" server.log | tail -20
grep "ERROR" server.log | tail -20
```

### CLI Operations

```bash
# Account info
python3 cli.py account
python3 cli.py wallet -f table
python3 cli.py characters

# Trading post
python3 cli.py tp-prices 19721,24277 -f table
python3 cli.py items 19721 -f summary

# WvW
python3 cli.py wvw-matches
python3 cli.py endpoint wvw/matches

# Generic endpoint
python3 cli.py endpoint achievements/daily
```

### API Endpoints

```bash
# Server status
curl http://localhost:5555

# Account
curl http://localhost:5555/api/account
curl http://localhost:5555/api/characters
curl http://localhost:5555/api/wallet

# WvW
curl http://localhost:5555/api/wvw/match/1020
curl http://localhost:5555/api/wvw/activity/1020
curl http://localhost:5555/api/wvw/kdr/1020
curl http://localhost:5555/api/wvw/tracked-guilds/1-2

# Trading Post
curl http://localhost:5555/api/tp/prices?ids=19721,24277
curl http://localhost:5555/api/items?ids=19721
```

### File Locations

```bash
# Configuration
.env                        # API key (gitignored)
.env.example               # Template
alliance_names.json        # Custom world names

# Runtime data
server.log                 # Server logs
kdr_history.json           # 7-day K/D data
activity_history.json      # 7-day activity data
wvw_data/current_match.json # Guild tracking

# Source code
app.py                     # Flask server
gw2api.py                  # API client
wvw_tracker.py            # Guild tracking
static/app.js             # Frontend logic
templates/index.html      # UI
```

### Python Quick Tests

```python
# Test API client
from gw2api import GW2API
client = GW2API()
account = client.get_account()
print(account['name'])

# Test guild tracking
from wvw_tracker import WvWTracker
tracker = WvWTracker()
matches = tracker.get_active_matches()
print(matches)

# Test caching
import time
start = time.time()
client.get_worlds()  # First call
print(f"First: {time.time() - start:.3f}s")

start = time.time()
client.get_worlds()  # Cached
print(f"Cached: {time.time() - start:.3f}s")
```

### Browser Console Quick Tests

```javascript
// Test data loading
await window.GW2Data.getMatchData(1020, true);

// Test API calls
let response = await fetch('/api/account');
let data = await response.json();
console.log(data);

// Test chart rendering
renderActivityChart();
renderKDRChart();

// Check polling status
console.log('Dashboard polling:', dashboardPollingInterval);
console.log('Maps polling:', mapsPollingInterval);
```

### Common File Operations

```bash
# Validate JSON
cat kdr_history.json | python3 -m json.tool > /dev/null
cat activity_history.json | python3 -m json.tool > /dev/null

# Pretty print JSON
cat wvw_data/current_match.json | python3 -m json.tool | less

# Check file sizes
ls -lh *.json wvw_data/

# Reset data (start fresh)
rm kdr_history.json activity_history.json
rm -rf wvw_data/
mkdir wvw_data

# Backup data
tar -czf backup-$(date +%Y%m%d).tar.gz *.json wvw_data/
```

### Useful Log Searches

```bash
# Background thread activity
grep "\[TRACKING\]" server.log | tail -20

# Errors only
grep "ERROR" server.log | tail -20

# Specific operation
grep "\[KDR\]" server.log
grep "\[ACTIVITY\]" server.log
grep "\[GUILDS\]" server.log

# API requests
grep "GET /api" server.log | tail -20

# Watch live
tail -f server.log | grep --color "\[TRACKING\]\|ERROR\|WARNING"
```

### Team Colors Reference

```css
/* CSS Variables (style.css) */
--team-red: #e74c3c
--team-green: #27ae60
--team-blue: #3498db

/* Canvas colors (app.js) */
red: '#ff6b6b'
green: '#6bff6b'
blue: '#6b6bff'
```

### Common Item IDs (for testing)

```
19721  - Glob of Ectoplasm
24277  - Mystic Coin
19976  - Vial of Powerful Blood (T6)
24295  - Amalgamated Gemstone
46731  - Piece of Unidentified Gear (Rare)
46732  - Piece of Unidentified Gear (Masterwork)
```

### Useful URLs

- **Local Server**: http://localhost:5555
- **GW2 API Docs**: https://wiki.guildwars2.com/wiki/API:Main
- **API Keys**: https://account.arena.net/applications
- **Content Terms**: https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/

---

## Summary for AI Assistants

When working with this codebase:

1. **Understand the architecture**: Python Flask backend + vanilla JS frontend + JSON persistence
2. **Follow patterns**: Use existing code as templates for new features
3. **Test manually**: No automated tests, always test changes yourself
4. **Watch threading**: Background thread runs continuously, be careful with shared state
5. **Handle errors**: Always use try-catch and log errors appropriately
6. **Document changes**: Update relevant .md files when making significant changes
7. **Be mindful of API limits**: GW2 API has rate limits, use caching
8. **Consider platform differences**: Unix/Linux has file locking, Windows doesn't
9. **Use type hints**: Python code uses type hints, continue the pattern
10. **Keep it simple**: Vanilla JS, no build process, minimize dependencies

**Most Common Tasks**:
- Adding new API endpoints (gw2api.py → app.py → app.js)
- Modifying frontend charts (app.js canvas rendering)
- Adjusting background tracking (app.py kdr_tracking_loop)
- Debugging data issues (check JSON files and logs)

**Key Files to Know**:
- `app.py` - Backend server and business logic
- `gw2api.py` - API client library
- `static/app.js` - Frontend application
- `wvw_tracker.py` - Guild tracking system
- `server.log` - All your debugging needs

**When in doubt**:
- Read the logs: `tail -f server.log`
- Check existing patterns in the code
- Test with curl or browser console
- Review related documentation in the 11+ .md files

---

*This CLAUDE.md file was generated on 2025-11-17 for AI assistant guidance. Last updated: [current date]*
