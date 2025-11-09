# WvW Guild Tracking Feature

## Overview
The GW2 API Tool now tracks all guilds that claim objectives during a WvW matchup week and stores them in a persistent database!

## ✨ What's New

### 1. Automatic Guild Tracking
- **Every time** you check a WvW match, guilds are automatically tracked
- Data persists across server restarts
- Tracks for the entire matchup week (7 days)

### 2. Comprehensive Guild Information Stored
For each guild that claims an objective, we track:
- ✅ Guild Name
- ✅ Guild Tag
- ✅ Guild ID
- ✅ Team (Red/Green/Blue)
- ✅ Number of claims seen
- ✅ Types of objectives claimed (Keep, Tower, Camp, etc.)
- ✅ Maps where they're active (EB, Red/Green/Blue BL)
- ✅ First time seen
- ✅ Last time seen

### 3. New "View Tracked Guilds" Button
Click the **📊 View Tracked Guilds** button to see:
- All guilds organized by team
- Sortable by claim count (most active guilds first)
- Complete statistics for each guild
- Match duration and timing info

## 🎮 How to Use

### Step 1: Start Tracking
1. Go to WvW tab
2. Click "My World's Match" or "Load All Matches"
3. Guilds are automatically tracked in the background

### Step 2: View Tracked Data
1. Click the **📊 View Tracked Guilds** button
2. Choose a team tab (Red/Green/Blue)
3. See all guilds for that team in a sortable table

### Step 3: Keep Updating
- Check matches multiple times during the week
- Each check adds new guild sightings
- Claim counts accumulate
- First/Last seen times update

## 📊 Example Output

```
Match ID: 1-2
Duration: Nov 8, 2025 - Nov 15, 2025
Last Updated: Nov 8, 2025 12:30 PM

🔴 RED TEAM
Main World: Anvil Rock (1001)
Total Guilds: 15

Tag    Guild Name              Claims  Objective Types    Maps Active
[FIRE] Phoenix Rising         45      Keep, Tower, Camp  EB, Red BL, Blue BL
[WAR]  Warriors United        32      Keep, Garrison     EB, Green BL
[NGHT] Night Raiders          28      Tower, Camp        Red BL, Blue BL
...
```

## 🗄️ Data Storage

### Location
- Data stored in: `/home/reaper/GW2API/wvw_data/current_match.json`
- Persistent across server restarts
- Automatically created on first use

### Data Structure
```json
{
  "match-id": {
    "match_id": "1-2",
    "start_time": "2025-11-08T02:00:00Z",
    "end_time": "2025-11-15T01:58:00Z",
    "first_seen": "2025-11-08T12:00:00",
    "last_updated": "2025-11-08T14:30:00",
    "teams": {
      "red": {
        "main_world": "Anvil Rock",
        "main_world_id": 1001,
        "guilds": {
          "guild-id": {
            "name": "Phoenix Rising",
            "tag": "FIRE",
            "claims_count": 45,
            "objective_types": ["Keep", "Tower"],
            "maps_seen": ["Center", "RedHome"]
          }
        }
      }
    }
  }
}
```

### Data Retention
- Data kept for current matchup week
- Auto-cleanup removes matches older than 14 days
- Multiple matches can be tracked simultaneously

## 📈 Use Cases

### 1. **Scout Enemy Guilds**
- See which guilds are most active on enemy teams
- Identify major defending guilds
- Plan PPT strategies around active guilds

### 2. **Track Allied Activity**
- Monitor guild participation on your team
- See which guilds are defending which maps
- Identify coverage gaps

### 3. **Historical Analysis**
- Compare guild activity over the week
- See patterns (which guilds active at what times)
- Track when guilds first appeared in the matchup

### 4. **Coordination**
- Share guild lists with commanders
- Identify coordinated guild groups
- Plan siege times around guild activity

## 🔧 Technical Details

### Backend (`wvw_tracker.py`)
- `WvWTracker` class manages all persistence
- JSON-based storage (simple, portable)
- Automatic match lifecycle management
- Thread-safe updates

### API Endpoints

#### `GET /api/wvw/tracked-guilds/<match_id>`
Returns all tracked guilds for a match, organized by team.

Response:
```json
{
  "status": "success",
  "match_info": { ... },
  "guilds": {
    "red": [...],
    "green": [...],
    "blue": [...]
  }
}
```

#### `GET /api/wvw/active-matches`
Returns list of all currently tracked matches.

Response:
```json
{
  "status": "success",
  "matches": {
    "match-id": { ... }
  }
}
```

### Frontend Features
- **Team tabs** - Switch between Red/Green/Blue
- **Sortable table** - Guilds sorted by claim count
- **Color coding** - Team colors match in-game
- **Responsive** - Works on all screen sizes
- **Auto-refresh** - Updates when you check matches

## 💡 Tips

1. **Check Regularly** - More checks = more accurate data
2. **Check Different Times** - See different guilds at different times of day
3. **All Maps** - "Load All Matches" tracks guilds from all tiers
4. **Export Data** - JSON file can be backed up or analyzed externally

## 🚀 Future Enhancements

Potential additions (not yet implemented):
- Export to CSV
- Guild activity graphs
- Time-based filtering (day vs night guilds)
- Compare weeks (historical matchups)
- Guild alliance detection
- Coverage heat maps

## 📁 Files Modified/Created

### New Files:
- `wvw_tracker.py` - Guild tracking system
- `wvw_data/current_match.json` - Persistent data storage

### Modified Files:
- `app.py` - Added tracking endpoints
- `static/app.js` - Added tracked guilds UI
- `static/style.css` - Added tracked guilds styling
- `templates/index.html` - Added "View Tracked Guilds" button

## 🎯 Summary

**Before:**
- Could see guilds currently claiming objectives
- Data lost after each refresh
- No historical tracking

**After:**
- ✅ Automatic persistent tracking
- ✅ Accumulates data over matchup week
- ✅ Organized by team
- ✅ Sortable statistics
- ✅ Historical first/last seen times
- ✅ Activity patterns visible

**Server:** http://localhost:5555  
**Ready to use!** Just click "My World's Match" to start tracking! 🎮
