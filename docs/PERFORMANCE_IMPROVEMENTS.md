# Performance Improvements - November 8, 2025

## Problem
- Match data was being loaded 3+ times when switching between tabs
- Each tab made its own API calls, causing slow loading
- No caching mechanism between components

## Solution: Global Data Cache System

### Implementation
Created `window.GW2Data` global cache object with:

1. **Smart Caching**
   - Caches match data for 30 seconds
   - Prevents duplicate concurrent API calls
   - Automatic refresh when data is stale

2. **Shared Data Access**
   - `getMatchData()` - Loads and caches WvW match data
   - `getObjectivesMetadata()` - Loads and caches objective metadata
   - All components now use the same cached data

### Benefits
- ✅ Match data loads only ONCE instead of 3+ times
- ✅ Instant switching between Dashboard → WvW tab → Interactive Maps
- ✅ Reduced API calls by ~70%
- ✅ Faster page load times
- ✅ Better user experience

### Usage
```javascript
// Old way (multiple API calls)
const response = await fetch('/api/wvw/match/1020');
const data = await response.json();

// New way (uses cache)
const match = await window.GW2Data.getMatchData(1020);
```

### Components Updated
- Dashboard stats (app.js)
- WvW Overview tab (app.js)
- Interactive Maps (wvw-maps.js)

### Cache Behavior
- Data cached for 30 seconds
- Force refresh available with `getMatchData(worldId, true)`
- Auto-refresh on Interactive Maps continues every 30s
- Dashboard stats refresh every 60s
