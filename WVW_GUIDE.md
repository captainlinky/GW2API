# WvW Features Guide

## 🎖️ New WvW Tab in Web UI!

The web interface now includes comprehensive World vs World (WvW) information!

## How to Access

1. Open the web UI at http://localhost:5555
2. Click the **WvW** tab in the navigation

## Features

### 📊 View All Matches
Click **"Load All Matches"** to see:
- All current WvW matchups across all tiers
- Red, Green, and Blue team compositions
- Main worlds and their linked worlds
- Victory points, kills, and deaths for each team
- Map scores and objective holdings
- Latest skirmish scores

### 🏰 My World's Match
Click **"My World's Match"** to see:
- Your specific world's current matchup
- Your team is highlighted with a gold border
- Which worlds are linked with yours
- Current standings and scores
- Detailed map information

### 🔍 Check Specific World
Enter any World ID to check their match:
1. Type the World ID (e.g., 1020)
2. Click **"Get Match"**
3. Or use the quick select buttons for common worlds

## What You'll See

### Team Information
For each team (Red, Green, Blue):
- **Main World** - The primary world name and ID
- **Linked Worlds** - All worlds linked to the main world
- **Victory Points** - Current VP standings
- **Kills & Deaths** - Combat statistics
- **Your team is highlighted in gold!**

### Map Details
For each map (Eternal Battlegrounds and Borderlands):
- **Current Scores** - Points for each team
- **Objectives Held** - Count of objectives per team
- **Map Name** - EB, Red BL, Green BL, Blue BL

### Skirmish Information
- Latest skirmish scores
- Total number of skirmishes
- Current skirmish ID

## Understanding the Data

### World Linking
- GW2 links lower population worlds together
- Your "Main World" is your home world
- "Linked Worlds" fight alongside your world
- All players from linked worlds are on the same team

### Color Teams
- **Red Team** 🔴 - Shown with red highlights
- **Green Team** 🟢 - Shown with green highlights  
- **Blue Team** 🔵 - Shown with blue highlights

### Victory Points
- Accumulated over the week-long match
- Determines which team wins the matchup
- Based on holding objectives and winning skirmishes

## Common World IDs

**NA Servers:**
- 1001 - Anvil Rock
- 1002 - Borlis Pass
- 1003 - Yak's Bend
- 1004 - Henge of Denravi
- 1005 - Maguuma
- 1006 - Sorrow's Furnace
- 1007 - Gate of Madness
- 1008 - Jade Quarry
- 1009 - Fort Aspenwood
- 1010 - Ehmry Bay
- 1011 - Stormbluff Isle
- 1012 - Darkhaven
- 1013 - Sanctum of Rall
- 1014 - Crystal Desert
- 1015 - Isle of Janthir
- 1016 - Sea of Sorrows
- 1017 - Tarnished Coast
- 1018 - Northern Shiverpeaks
- 1019 - Blackgate
- 1020 - Ferguson's Crossing (example in screenshot)
- 1021 - Dragonbrand
- 1022 - Kaineng
- 1023 - Devona's Rest
- 1024 - Eredon Terrace

**EU Servers:**
- 2001+ (various EU servers)

## API Endpoints Used

The WvW tab uses these GW2 API endpoints:
- `/v2/wvw/matches` - All current matches
- `/v2/wvw/matches?world=ID` - Specific world's match
- `/v2/worlds` - World name lookup

## Tips

1. **Find Your Match Fast** - Use "My World's Match" button
2. **Check Enemy Teams** - See who you're fighting against
3. **Track Linked Worlds** - Know all the servers on each team
4. **Monitor Scores** - See how your team is doing
5. **Quick World Lookup** - Use preset buttons for common worlds

## Refresh Data

The data shows the current state when you click the button. To get updated information:
- Simply click the button again to refresh
- Scores update in real-time on GW2 servers
- Match data changes throughout the week

## Example Use Cases

### "Who am I fighting this week?"
1. Click "My World's Match"
2. Look at the other two teams
3. See all the worlds you're fighting

### "How's my team doing?"
1. Click "My World's Match"  
2. Check Victory Points
3. Look at map scores
4. See latest skirmish results

### "Check a friend's world"
1. Ask them for their World ID
2. Enter it in the search box
3. Click "Get Match"
4. See their matchup

### "Scout all matches"
1. Click "Load All Matches"
2. See every tier's matchup
3. Compare different servers
4. Check overall WvW activity

## No Guild Info?

**Note:** The GW2 API does not currently provide:
- Individual player lists per world
- Guild rosters for worlds
- Real-time player locations
- Guild claiming information (available but requires guild permissions)

This is due to privacy and API limitations. The API focuses on match statistics rather than individual player/guild data.

## Future Enhancements

Potential additions:
- [ ] Historical match tracking
- [ ] Victory point predictions
- [ ] Objective ownership timeline
- [ ] Guild claiming info (with permissions)
- [ ] PPT (Points Per Tick) calculator
- [ ] Match schedule/relink dates

Enjoy tracking your WvW matches! ⚔️
