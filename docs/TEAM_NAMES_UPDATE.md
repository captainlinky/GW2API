# WvW Team Names Update

## Changes Made

### 1. Removed Plaid Background Pattern
- Removed the diagonal stripe pattern that looked like yellow plaid
- Kept the clean gradient background for a professional appearance

### 2. Added Proper WvW Team Instance Names
The system now uses the official WvW battlefield instance names instead of generic "Red/Green/Blue Team" labels.

**North American Teams (11001-11012):**
- 11001: Moogooloo
- 11002: Rall's Rest
- 11003: Domain of Torment
- 11004: Yohlon Haven
- 11005: Tombs of Drascir
- 11006: Hall of Judgment
- 11007: Throne of Balthazar
- 11008: Dwayna's Temple
- 11009: Abaddon's Prison
- 11010: Cathedral of Blood
- 11011: Lutgardis Conservatory
- 11012: Mosswood

**European Teams (12001-12015):**
- 12001: Skrittsburgh
- 12002: Fortune's Vale
- 12003: Silent Woods
- 12004: Ettin's Back
- 12005: Domain of Anguish
- 12006: Palawadan
- 12007: Bloodstone Gulch
- 12008: Frost Citadel
- 12009: Dragrimmar
- 12010: Grenth's Door
- 12011: Mirror of Lyssa
- 12012: Melandru's Dome
- 12013: Kormir's Library
- 12014: Great House Aviary
- 12015: Bava Nisos

### How It Works

The system now has a **priority-based naming system**:

1. **Team IDs (11xxx/12xxx)**: WvW battlefield instance names like "Tombs of Drascir"
   - These are static and don't change with weekly relinks
   - Sourced from: https://wiki.guildwars2.com/wiki/API:2/wvw/guilds/:region#Team_IDs

2. **World IDs (1xxx)**: Home server names like "Ferguson's Crossing"
   - These are the original server names
   - Used when team IDs aren't available

3. **Overrides**: Manual customization
   - Add custom names to `alliance_names.json` under "overrides" section

### Where Team Names Appear

All instances of team colors now show the proper WvW instance names:
- ✅ Live PPT Stats: "Tombs of Drascir: 145 PPT"
- ✅ Territory Control: "Tombs of Drascir 45%"
- ✅ All Chart Legends (Activity, K/D, PPT)
- ✅ Match Overview Cards
- ✅ Guild Tracking Tables
- ✅ Team Activity Bars

All names are displayed in their respective team colors:
- Red teams: #ff6b6b
- Green teams: #6bff6b
- Blue teams: #6b6bff

### Files Modified

1. `alliance_names.json` - Added complete team_names mapping
2. `app.py` - Updated `load_alliance_names()` and `get_alliance_display_name()`
3. `static/style.css` - Removed plaid background pattern
4. `static/app.js` - Already using team names from API responses

### Testing

The team name mapping has been verified:
```
11005 (Team ID) → "Tombs of Drascir" ✓
1020 (World ID) → "Ferguson's Crossing" ✓
12001 (EU Team) → "Skrittsburgh" ✓
```

## What This Means for You

- Team names are **now accurate** and match what you see in-game
- Names are displayed in **team colors** everywhere
- The system handles both **NA and EU** regions
- Names are **static** - they won't change with weekly relinks
- If you see a team ID the system doesn't recognize, you can add it manually to the "overrides" section

## Restart Required

To apply these changes, restart the Flask application:
```bash
python app.py
```

The dashboard will now show proper team names like "Tombs of Drascir" instead of "Red Team"!
