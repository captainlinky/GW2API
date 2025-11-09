# WvW Dashboard Documentation

## Overview

The WvW Dashboard provides real-time World vs World matchup visualization with historical tracking, interactive charts, and guild claim monitoring.

## Features

### 1. Real-Time Match Display
- Current matchup scores for Red, Green, and Blue teams
- Victory Points tracking
- Server/world names for all three teams
- Kill/Death ratios
- Objective ownership counts

### 2. Interactive Historical Charts

#### Capture Activity Chart
Visualizes objective ownership over time (last 6 hours):
- **Line graph** showing each team's objective count
- **Time-of-day X-axis** (HH:MM format)
- **Hover tooltips** showing detailed breakdowns:
  - Total objectives owned
  - Keeps count
  - Towers count
  - Camps count
- **Team-colored lines** matching Red/Green/Blue teams
- **Auto-updating** every 30 seconds

#### Kill/Death Ratio Chart
Tracks combat performance over time (last 6 hours):
- **Line graph** showing each team's K/D ratio
- **1.0 reference line** for break-even performance
- **Hover tooltips** showing:
  - K/D ratio
  - Total kills
  - Total deaths
- **Team-colored lines** matching Red/Green/Blue teams
- **Auto-updating** every 30 seconds

### 3. Guild Tracking System
Automatically discovers and tracks guilds claiming objectives:
- Guild name and tag (e.g., `[TAG] Guild Name`)
- Organized by team (Red, Green, Blue)
- Persists across server restarts
- Background updates every 15 minutes
- Displays on dashboard for easy reference

### 4. Map Details
For each WvW map (Eternal Battlegrounds, Red/Green/Blue Borderlands):
- Objective type (Keep, Tower, Camp, Castle)
- Owning team with color coding
- Guild claims with tag and name
- Upgrade progress (yaks delivered)

## Background Tracking System

The dashboard runs an autonomous background thread that collects data every **15 minutes**:

### Data Collection
1. **K/D Ratios** - Records kills and deaths for all three teams
2. **Objective Ownership** - Counts Keeps, Towers, and Camps per team
3. **Guild Discovery** - Tracks new guilds claiming objectives

### Data Retention
- **7 days** of historical data (full matchup duration)
- Automatic cleanup of old data
- Persisted to JSON files:
  - `kdr_history.json` - Kill/Death tracking
  - `activity_history.json` - Objective ownership
  - `wvw_data/current_match.json` - Guild claims

### File Safety
- **File locking** (fcntl) prevents data corruption
- **Error recovery** handles corrupted files gracefully
- **Atomic writes** ensure data integrity

## API Endpoints

### GET `/api/wvw/match/<world_id>`
Returns enriched match data including guild information.

**Response:**
```json
{
  "id": "1-2",
  "red": {
    "name": "Anvil Rock",
    "kills": 12450,
    "deaths": 12190,
    "objectives": 16
  },
  "green": {...},
  "blue": {...},
  "maps": [...]
}
```

### GET `/api/wvw/activity/<world_id>`
Returns objective ownership timeline for the last 6 hours.

**Response:**
```json
{
  "timeline": [
    {
      "minutes_ago": 0,
      "red": {"total": 16, "keeps": 2, "towers": 5, "camps": 9},
      "green": {"total": 41, "keeps": 3, "towers": 12, "camps": 26},
      "blue": {"total": 34, "keeps": 2, "towers": 10, "camps": 22}
    },
    ...
  ],
  "teams": {
    "red": "Anvil Rock",
    "green": "Henge of Denravi",
    "blue": "Maguuma"
  }
}
```

### GET `/api/wvw/kdr/<world_id>`
Returns Kill/Death ratio timeline for the last 6 hours.

**Response:**
```json
{
  "timeline": [
    {
      "minutes_ago": 0,
      "red": 1.02,
      "green": 1.28,
      "blue": 0.62
    },
    ...
  ],
  "teams": {...},
  "kills": {...},
  "deaths": {...}
}
```

### GET `/api/wvw/tracked-guilds/<match_id>`
Returns all guilds organized by team.

**Response:**
```json
{
  "red": {
    "team_name": "Anvil Rock",
    "guilds": [
      {"id": "...", "name": "Guild Name", "tag": "TAG"}
    ]
  },
  "green": {...},
  "blue": {...}
}
```

## Chart Implementation

### Technology Stack
- **HTML5 Canvas** for rendering (no external charting libraries)
- **Vanilla JavaScript** for interaction handling
- **Mouse event tracking** for tooltip proximity detection
- **Team color scheme**: 
  - Red: `#e74c3c`
  - Green: `#27ae60`
  - Blue: `#3498db`

### Tooltip System
- **Proximity detection**: Shows tooltip when within 10px of any data point
- **Detailed breakdowns**: Contextual information for each point
- **Container-relative positioning**: Prevents off-screen tooltips
- **Edge detection**: Adjusts position near canvas edges

### Data Flow
1. Browser requests data from API endpoints (every 30 seconds)
2. Background thread records snapshots (every 15 minutes)
3. Frontend renders charts with historical data
4. User hovers over chart to see detailed tooltips
5. Charts auto-refresh with new data points

## Usage

### Starting the Dashboard
```bash
python3 app.py
# or
./start_ui.sh
```

Open browser to: `http://localhost:5555`

### Viewing Your Match
1. Dashboard loads your world automatically
2. Click "Load WvW Data" to fetch current matchup
3. Scroll to charts to see historical trends
4. Hover over data points for detailed information
5. Check "Tracked Guilds" section for all active guilds

### API Key Requirements
For guild information, your API key needs:
- ✅ `account` permission
- ✅ `guilds` permission (for guild names/tags)

Generate a new key at: https://account.arena.net/applications

## Technical Details

### Background Thread
Located in `app.py`:
- `record_kdr_snapshot()` - Records K/D data
- `record_activity_snapshot()` - Records objective counts
- `update_guild_tracking()` - Updates guild claims
- `kdr_tracking_loop()` - Main loop running every 15 minutes

### Guild Tracking
Located in `wvw_tracker.py`:
- `WvWTracker` class manages persistent guild data
- File locking prevents concurrent write corruption
- Automatic cleanup of old matches (7 days retention)
- Stores unique guilds claiming objectives

### Frontend Charts
Located in `static/app.js`:
- `renderActivityChart()` - Draws objective ownership chart
- `renderKDRChart()` - Draws K/D ratio chart
- `updateActivityTimeline()` - Fetches activity data
- `updateKDRTimeline()` - Fetches K/D data

## Troubleshooting

### Charts Not Updating
- Check browser console for API errors
- Verify server is running: `pgrep -f "python3 app.py"`
- Check background thread logs for errors

### Guild Names Missing
- Ensure API key has `guilds` permission
- Refresh page to trigger guild discovery
- Wait 15 minutes for background thread to update

### Data Corruption
If JSON files become corrupted:
1. Stop server: `pkill -9 -f "python3 app.py"`
2. Remove corrupted files: `rm wvw_data/current_match.json`
3. Restart server - data will rebuild automatically

### Empty Charts
- Charts start empty and fill as data is collected
- Background thread runs every 15 minutes
- After 6 hours, you'll have full historical timeline
- Each page load triggers immediate data collection

## Performance

### API Caching
- Match data cached in background thread
- Charts use historical data (no repeated API calls)
- Guild information fetched in parallel
- Efficient bulk endpoint usage

### Resource Usage
- Background thread: minimal CPU (~1% every 15 minutes)
- Memory: ~50MB for data structures and history
- Disk: <1MB for all JSON files
- Network: ~5KB per update cycle

## Future Enhancements

Potential improvements:
- Extend chart timeframe (24 hours, 7 days)
- Add zoom/pan controls to charts
- Export historical data to CSV
- Alert system for score changes
- Mobile-responsive chart rendering
- Real-time updates via WebSocket

## Contributing

To extend the WvW dashboard:
1. Background tracking: Modify `app.py` tracking functions
2. New charts: Add rendering functions in `static/app.js`
3. New endpoints: Add routes in `app.py`
4. Guild tracking: Extend `wvw_tracker.py` WvWTracker class

## License

This tool interfaces with the Guild Wars 2 API. Please review ArenaNet's API Terms of Use:
https://www.guildwars2.com/en/legal/guild-wars-2-content-terms-of-use/
