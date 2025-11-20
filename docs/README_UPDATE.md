# GW2 WvW Command Center - Recent Updates

## 🎉 What's New (January 2025)

Your WvW dashboard just got a major upgrade! Here are the highlights:

### ⚔️ Dynamic WvW Team Names
**No more "Red Team" or server names!**

The dashboard now shows **actual WvW battlefield instance names** like:
- 🔴 **Moogooloo** (not "Anvil Rock")
- 🟢 **Yohlon Haven** (not "Henge of Denravi")
- 🔵 **Tombs of Drascir** (not "Maguuma")

**These update automatically:**
- ✅ Weekly when matchups change
- ✅ Monthly when world relinks occur
- ✅ No manual configuration needed

### 📈 PPT Coverage Analysis
**New graph to identify coverage gaps!**

Track your team's Points Per Tick over time:
- See when your team loses objectives
- Identify weak coverage periods (off-peak hours)
- Compare performance across 6h/24h/7d timeframes
- Interactive tooltips with detailed stats

### 🎨 Enhanced Visual Design
- **Better borders** on Live Stats and Territory Control panels
- **Team-colored accents** throughout the interface
- **Professional WvW theme** with gold highlights
- **Cleaner, modern look** without distracting patterns

### 📱 Install as an App
**Pin the dashboard to your desktop/homescreen!**

- Look for the "Install" icon in your browser
- Works on Windows, Mac, Linux, Android, iOS
- Launches like a native app
- Custom WvW-themed icon

## 🚀 Quick Start

### First Time Setup
```bash
# 1. Clone the repository
git clone https://github.com/yourusername/GW2API.git
cd GW2API

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set your API key
# Create a .env file with:
GW2_API_KEY=your-api-key-here

# 4. Run the application
python app.py

# 5. Open in browser
# Visit http://localhost:5555
```

### Updating to Latest Version
```bash
# Pull latest changes
git pull origin main

# Restart the application
python app.py

# Hard refresh your browser
# Press Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
```

## 📊 Features

### Dashboard
- **Live Match Stats**: Real-time scores, K/D ratios, victory points
- **Team Names in Colors**: See actual WvW instance names (Tombs of Drascir, etc.)
- **Match Countdown**: Time remaining in current matchup
- **Quick Actions**: Jump to guild tracking, maps, or stats

### WvW Analytics
- **📊 Objective Capture Activity**: Track which teams are active
- **💀 K/D Ratio Trends**: Monitor kill/death performance over time
- **📈 PPT Coverage Analysis**: Identify coverage gaps (NEW!)
- **🗺️ Territory Control**: Visual breakdown of objective ownership
- **⏱️ Skirmish Timer**: Countdown to next skirmish

### Guild Tracking
- **Active Guild Detection**: See which guilds are claiming objectives
- **Team Breakdown**: Guilds organized by team color
- **Claim Statistics**: Count of claimed objectives per guild
- **Objective Types**: What types of structures each guild holds

### Interactive Maps
- **All WvW Borderlands**: Eternal Battlegrounds, Red/Green/Blue borders
- **Objective Status**: See current owner of each objective
- **Guild Claims**: Hover to see which guild claimed what
- **Live Updates**: Data refreshes every 60 seconds

## 🎯 API Endpoints

All endpoints return JSON data with proper WvW team names:

### Match Information
- `GET /api/wvw/match/<world_id>` - Full match data for a world
- `GET /api/wvw/matches` - All active matches
- `GET /api/wvw/stats/<world_id>` - Live PPT, territory, skirmish info

### Analytics
- `GET /api/wvw/activity/<world_id>?window=6h` - Objective capture timeline
- `GET /api/wvw/kdr/<world_id>?window=6h` - Kill/death ratio trends
- `GET /api/wvw/ppt/<world_id>?window=6h` - PPT coverage analysis (NEW!)

### Guild Tracking
- `GET /api/wvw/tracked-guilds/<match_id>` - Guilds claiming objectives
- `GET /api/wvw/active-matches` - Quick match summaries

### Configuration
- `POST /api/wvw/update-alliance-names` - Manually refresh team names (NEW!)

## 🔧 Configuration

### Alliance Names
Team names are automatically detected from match data. To manually override:

```json
// alliance_names.json
{
  "overrides": {
    "11005": "Custom Team Name",
    "1020": "Custom Server Name"
  }
}
```

### Environment Variables
```bash
# .env file
GW2_API_KEY=your-api-key-here  # Required
PORT=5555                       # Optional, default 5555
```

## 🌐 Progressive Web App

### Installing on Desktop
1. Open the dashboard in Chrome, Edge, or Brave
2. Click the install icon in the address bar (⊕ or 💾)
3. Click "Install"
4. Launch from your desktop/start menu

### Installing on Mobile
1. Open the dashboard in mobile browser
2. Tap the menu button (⋮)
3. Select "Add to Home Screen"
4. Tap "Add"
5. Launch from your home screen

## 🛠️ Technical Details

### Team Name Resolution
The system uses a priority-based lookup:

1. **Team IDs (11xxx/12xxx)**: WvW battlefield instances (Tombs of Drascir, etc.)
   - Extracted from match `all_worlds` arrays
   - Static - don't change with relinks

2. **World IDs (1xxx)**: Home server names (Ferguson's Crossing, etc.)
   - Fallback when team IDs unavailable
   - Update monthly during relinks

3. **Manual Overrides**: Custom names from `alliance_names.json`
   - Highest priority
   - Useful for testing or customization

### Data Sources
- **GW2 API v2**: https://api.guildwars2.com/v2/
- **Team ID Mapping**: https://wiki.guildwars2.com/wiki/API:2/wvw/guilds/:region#Team_IDs
- **Account WvW**: `/v2/account/wvw` for player's team

### Performance
- **Caching**: Match data cached for 30 seconds
- **Parallel Requests**: Guild info fetched concurrently (max 10 workers)
- **History Tracking**: 15-minute snapshots stored locally
- **Auto-cleanup**: Old match data purged automatically

## 🐛 Troubleshooting

### Team names showing as "World 1001"
- The API returned invalid data
- Check your GW2 API key permissions
- Try refreshing: `curl -X POST http://localhost:5555/api/wvw/update-alliance-names`

### Dashboard not loading
- Ensure you have a valid API key in `.env`
- Check that port 5555 is not in use
- Try a different port: `PORT=8080 python app.py`

### PWA not installable
- Use a PWA-compatible browser (Chrome, Edge, Brave)
- Ensure you're accessing via `http://localhost` or `https://`
- Check browser console for errors

## 📝 License

MIT License - See LICENSE file for details

## 🙏 Credits

- **Guild Wars 2 API**: ArenaNet
- **Team ID Mapping**: GW2 Wiki Community
- **WvW Instance Names**: https://wiki.guildwars2.com

## 🔗 Links

- **GitHub**: https://github.com/yourusername/GW2API
- **GW2 API Docs**: https://wiki.guildwars2.com/wiki/API:Main
- **Report Issues**: https://github.com/yourusername/GW2API/issues

---

**Enjoy your enhanced WvW Command Center! ⚔️**
