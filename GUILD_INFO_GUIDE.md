# Guild Information in WvW - Quick Guide

## What's Available 🎯

### You CAN See:
✅ **Guilds that claim WvW objectives**
- Any guild that claims a tower, keep, camp, or SMC
- Guild name (e.g., "Phoenix Rising")
- Guild tag (e.g., "[FIRE]")
- Number of yaks delivered to that objective
- Which team the guild is fighting for (Red/Green/Blue)

### You CANNOT See:
❌ **Complete list of all guilds on a world**
- The API only shows guilds that actively claim objectives
- If a guild doesn't claim anything, they won't appear

❌ **Individual players on worlds**
- The GW2 API doesn't provide player rosters for privacy reasons
- Can't see which specific players are on which world

❌ **Guild membership details**
- Can't see which players are in which guilds
- Would need special API permissions from each guild

---

## How to Enable Guild Information

### Step 1: Get a New API Key with Guilds Permission

1. Go to https://account.arena.net/applications
2. Click "New Key" or edit your existing key
3. Give it a name (e.g., "GW2 Tool - Full Access")
4. Check these permissions:
   - ✅ **account** - Basic account info
   - ✅ **characters** - Character details
   - ✅ **inventories** - Bank, materials, etc.
   - ✅ **guilds** ← **THIS ONE IS IMPORTANT!**
   - ✅ **wallet** - Currency/gold
   - ✅ **tradingpost** - Trading post info
   - ✅ **progression** - Masteries, achievements
5. Click "Create API Key"
6. **Copy the key immediately** (you won't see it again!)

### Step 2: Update Your API Key in the Tool

1. Open http://localhost:5555
2. Go to the **Settings** tab
3. Click the **red "Delete API Key"** button
4. Confirm the deletion
5. Paste your new key in the text field
6. Click **"Save API Key"**
7. Wait for confirmation message

### Step 3: View Guild Information

1. Go to the **WvW** tab
2. Click one of these options:
   - **"My World's Match"** - See your world's matchup
   - **"Load All Matches"** - See all matches
   - Enter a **World ID** and click "Get Match"

3. Scroll down to see **Map Details**
4. Under each map, you'll see a **"Guild Claims"** section

---

## What the Guild Display Looks Like

```
Map: Eternal Battlegrounds
Scores: Red: 2,500 | Green: 3,100 | Blue: 2,800
Objectives held: Red: 12, Green: 15, Blue: 18

Guild Claims (18):
[FIRE] Phoenix Rising - Garrison (70 yaks)
[WAR] Warriors United - Tower (35 yaks)
[ZERG] Zerg Squad - Keep (100 yaks)
[NGHT] Night Shift - Camp (12 yaks)
...
```

### Color Coding:
- **Red teams** = Red text
- **Green teams** = Green text  
- **Blue teams** = Blue text
- **Your team** = Highlighted in gold

---

## Understanding the Information

### Guild Claims Show:
1. **Guild Tag** - In brackets, e.g., `[FIRE]`
2. **Guild Name** - Full guild name
3. **Objective Type** - What they claimed:
   - Keep (most valuable)
   - Garrison
   - Tower
   - Camp
   - Spawn
4. **Yaks Delivered** - Shows how upgraded the objective is
   - 0 yaks = Just claimed
   - 35-40 yaks = Partially upgraded
   - 70-100 yaks = Fully upgraded

### Why This Matters:
- See which guilds are **actively defending** in WvW
- Identify **major defending guilds** on each team
- Track **guild presence** across different maps
- Understand **upgrade levels** from yak counts

---

## Troubleshooting

### "Warning: Could not fetch guild data"
**Problem:** Your API key doesn't have "guilds" permission

**Solution:**
1. Create a new key with guilds permission (see Step 1 above)
2. Delete old key in Settings
3. Add new key

### "No Guild Claims Found"
**Possible reasons:**
- No objectives are claimed in this match
- Match just started (objectives not claimed yet)
- All claims are neutral (no guilds)

This is normal - not all objectives are always claimed.

### Guild Names Not Showing
**Check:**
1. Is your API key saved? (Settings tab should show masked key)
2. Does your key have "guilds" permission?
3. Try refreshing the WvW data (click button again)

---

## Example: Full Match View

```
BLUE TEAM ⚔️ (Your Team)
Main World: Henge of Denravi (1005)
Linked Worlds:
  - Ferguson's Crossing (1020)
Victory Points: 115
Kills: 2,766
Deaths: 3,547

Map Details

Eternal Battlegrounds (EB)
Scores: Red: 1,448 | Green: 2,302 | Blue: 2,658
Objectives held: Red: 12, Green: 15, Blue: 18

Guild Claims (18):
[FIRE] Phoenix Rising - Garrison (70 yaks)
[WAR] War Eternal - Keep (100 yaks)
[DRAG] Dragon Watch - Tower (35 yaks)
[NGHT] Night Raiders - Tower (40 yaks)
...

Blue Borderlands
Scores: Red: 1,633 | Green: 1,156 | Blue: 2,029
Objectives held: Red: 8, Green: 6, Blue: 11

Guild Claims (11):
[BLUE] Blue Defenders - Keep (100 yaks)
[HOME] Homeland Defense - Tower (70 yaks)
...
```

---

## Quick Tips

💡 **Tip 1:** More yaks = more upgrades = harder to capture
💡 **Tip 2:** Guilds on different maps might be coordinating
💡 **Tip 3:** Check all 4 maps to see full guild activity
💡 **Tip 4:** Guild tags help identify allied/enemy guilds quickly
💡 **Tip 5:** Your team is highlighted in gold - easy to spot!

---

## API Endpoint Reference

If you want to query guilds directly via Custom Query tab:

```
Endpoint: guild/{guild_id}
Example: guild/5B19ABF2-03CB-EA11-81B1-D0069C08C942
```

Returns guild name, tag, and other public info.

**Note:** You need "guilds" permission in your API key for this to work!

---

## Summary

**To see guild information in WvW:**
1. ✅ Create new API key with "guilds" permission
2. ✅ Delete old API key in Settings tab
3. ✅ Save new API key
4. ✅ Go to WvW tab
5. ✅ View match details
6. ✅ Check "Guild Claims" sections under each map

**Remember:** Only guilds that claim objectives will appear!

Enjoy tracking WvW guilds! ⚔️🏰
