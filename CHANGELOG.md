# Changelog - GW2 WvW Command Center

## [2025-01-14] - Major WvW Enhancement Update

### 🎯 Dynamic WvW Team Names
**All team references now show proper WvW battlefield instance names instead of legacy server names.**

- ✅ **Automatic Team Detection**: System extracts team IDs (11xxx/12xxx) from match data
- ✅ **All 27 WvW Instances Supported**:
  - **NA Teams (11001-11012)**: Moogooloo, Rall's Rest, Domain of Torment, Yohlon Haven, Tombs of Drascir, Hall of Judgment, Throne of Balthazar, Dwayna's Temple, Abaddon's Prison, Cathedral of Blood, Lutgardis Conservatory, Mosswood
  - **EU Teams (12001-12015)**: Skrittsburgh, Fortune's Vale, Silent Woods, Ettin's Back, Domain of Anguish, Palawadan, Bloodstone Gulch, Frost Citadel, Dragrimmar, Grenth's Door, Mirror of Lyssa, Melandru's Dome, Kormir's Library, Great House Aviary, Bava Nisos

- ✅ **Dynamic Updates**: Names automatically update when:
  - Weekly matchup changes (opponents rotate)
  - Monthly world relinks occur (home server changes)
  - System reads team IDs directly from API, no manual updates needed

- ✅ **Team Colors Applied**: All team names display in their respective colors:
  - Red teams: #ff6b6b
  - Green teams: #6bff6b
  - Blue teams: #6b6bff

### 📊 New PPT Coverage Analysis Graph
**Track Points Per Tick trends to identify coverage gaps.**

- **Multi-Timeframe Analysis**: View PPT trends over 6 hours, 24 hours, or 7 days
- **Coverage Gap Detection**: Dips in PPT indicate when teams lose objectives
- **Interactive Tooltips**: Hover to see exact PPT values and projected points per hour
- **Team-Colored Lines**: Easy visual identification of each team's performance

### 🎨 Enhanced UI & Styling
**Professional WvW-themed design improvements.**

- **Improved Stat Panels**: Live PPT and Territory Control widgets now have:
  - Defined 2px borders with border-color highlighting
  - Gradient backgrounds for depth
  - Subtle top accent line in gold
  - Enhanced shadows with glow effects

- **Cleaner Header**:
  - Tri-color gradient stripe (red/gold/blue) at top
  - Better contrast and depth
  - Renamed to "GW2 WvW Command Center"

- **Better Card Hover Effects**:
  - Smooth animations on stat cards
  - Team-colored border highlights
  - Subtle glow effects

### 📱 Progressive Web App (PWA) Support
**Pin the dashboard like a native app!**

- **Custom WvW Icon**: Crossed swords design with team colors
- **Installable**: Add to home screen on mobile or desktop
- **Manifest Configuration**: Proper PWA metadata
- **Multiple Icon Sizes**: SVG, 192x192, and 512x512 PNG formats

### 🔧 Technical Improvements

#### Backend Changes
- Added `/api/wvw/ppt/<world_id>` endpoint for PPT trend data
- Added `/api/wvw/update-alliance-names` endpoint (POST) for manual updates
- New `get_all_team_ids()` function to extract team IDs from match data
- Updated `build_enriched_match()` to use team IDs for all teams
- Updated all match-related endpoints to return proper team names

#### Frontend Changes
- New `updatePPTTimeline()` function with chart rendering
- New `renderPPTChart()` with interactive tooltips
- Added `applyTeamColor()` helper function
- All legends now show team names in proper colors
- Updated match overview to use enriched team data

#### Data Structure
- `alliance_names.json` now includes:
  - `team_names`: Static mapping of team IDs to battlefield names
  - `alliances`: World server names (fallback)
  - `overrides`: Manual customization support

### 🌐 API Integration
- Uses `/v2/account/wvw` to get player's team ID
- Extracts team IDs from match `all_worlds` arrays
- Priority system: Team IDs (11xxx/12xxx) > World IDs (1xxx) > Overrides
- Source: https://wiki.guildwars2.com/wiki/API:2/wvw/guilds/:region#Team_IDs

### 📍 Where Team Names Appear
- ✅ Live PPT Stats section
- ✅ Territory Control widget
- ✅ Match Overview panel
- ✅ All chart legends (Activity, K/D, PPT)
- ✅ Guild tracking tables
- ✅ Team activity bars

### 🔄 Breaking Changes
None - all changes are backward compatible.

### 🐛 Bug Fixes
- Fixed team name display showing legacy server names instead of WvW instance names
- Fixed match overview panel not using enriched team data
- Removed distracting background pattern

### 📦 Files Modified
- `app.py` - Added PPT endpoint, team ID extraction, alliance name updates
- `gw2api.py` - Added `get_account_wvw()` method
- `static/app.js` - PPT chart, team name coloring, legend updates
- `static/style.css` - Enhanced borders, removed background pattern
- `templates/index.html` - Added PPT graph section, updated metadata
- `alliance_names.json` - Added complete team_names mapping
- `static/manifest.json` - PWA configuration (new)
- `static/icon.svg`, `icon-192.png`, `icon-512.png` - App icons (new)
- `generate_icons.py` - Icon generation script (new)

### 📚 Documentation
- `TEAM_NAMES_UPDATE.md` - Complete guide to team naming system
- `CHANGELOG.md` - This file

### 🎯 Future Enhancements
- Historical PPT trend tracking beyond current match
- Team performance comparison metrics
- Custom alerts for coverage gaps
- Export PPT data for analysis

---

## How to Update

1. **Pull latest changes**: `git pull`
2. **Restart the application**: `python app.py`
3. **Hard refresh browser**: Ctrl+Shift+R or Cmd+Shift+R
4. **(Optional) Update alliance names**: `curl -X POST http://localhost:5555/api/wvw/update-alliance-names`

Team names will automatically display correctly based on current matchup data!
