// WvW Interactive Maps
let currentMapType = 'Center';
let mapObjectives = {};
let objectivesData = {};
let matchData = null;
let autoRefreshInterval = null;
let currentMapsInterval = 30; // default 30 seconds

// Map dimensions and scaling (use high-res square canvas for all)
const MAP_CONFIG = {
    'Center': { width: 2048, height: 2048, name: 'Eternal Battlegrounds' },
    'RedHome': { width: 2048, height: 2048, name: 'Red Borderlands' },
    'GreenHome': { width: 2048, height: 2048, name: 'Green Borderlands' },
    'BlueHome': { width: 2048, height: 2048, name: 'Blue Borderlands' }
};
const SUPPORTS_WEBP = (() => {
    try {
        const c = document.createElement('canvas');
        if (!c.getContext) return false;
        return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
})();

// Initialize WvW Maps
async function initWvWMaps() {
    const canvas = document.getElementById('map-canvas');
    const loadBtn = document.querySelector('button[onclick="initWvWMaps()"]');
    
    try {
        // Show loading state
        if (canvas) {
            canvas.innerHTML = '<div class="loading"></div><p style="text-align: center;">Loading WvW maps and objectives...</p>';
        }
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.innerHTML = '⏳ Loading...';
        }
        
        // Use shared cache for objectives and match data
        console.log('Loading objectives metadata...');
        objectivesData = await window.GW2Data.getObjectivesMetadata();
        
        console.log('Loading match data...');
        matchData = await window.GW2Data.getMatchData(1020);
        
        // Organize objectives by map type (already done in cache)
        // Organize match objectives by map
        if (matchData) {
            mapObjectives = {};
            matchData.maps.forEach(map => {
                mapObjectives[map.type] = map;
            });
            console.log('Loaded match data for maps:', Object.keys(mapObjectives));
        }
        
        // Render selector and first map now that data is loaded
        renderMapSelector();
        await renderMap(currentMapType);

        // Load polling config and start auto-refresh
        try {
            const response = await fetch('/api/polling-config');
            const data = await response.json();
            if (data.status === 'success') {
                startAutoRefresh(data.config.maps_interval);
            } else {
                startAutoRefresh(); // Use default
            }
        } catch (error) {
            console.error('Failed to load polling config for maps:', error);
            startAutoRefresh(); // Use default
        }
        // Update button
        if (loadBtn) {
            loadBtn.innerHTML = '✅ Maps Loaded';
            setTimeout(() => {
                loadBtn.innerHTML = '🔄 Reload Maps';
                loadBtn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Error initializing maps:', error);
        if (canvas) {
            canvas.innerHTML = `<p style="text-align: center; color: #f44; padding: 50px;">Error loading maps: ${error.message}</p>`;
        }
        if (loadBtn) {
            loadBtn.innerHTML = '❌ Error - Retry';
            loadBtn.disabled = false;
        }
    }
}

// Load objective metadata (now uses shared cache)
async function loadObjectivesMetadata() {
    objectivesData = await window.GW2Data.getObjectivesMetadata();
}

// Load current match data (now uses shared cache)
async function loadCurrentMatch() {
    matchData = await window.GW2Data.getMatchData(1020);
    
    if (matchData) {
        // Organize objectives by map type
        mapObjectives = {};
        matchData.maps.forEach(map => {
            mapObjectives[map.type] = map;
        });
    }
}

// Render map selector tabs
function renderMapSelector() {
    const container = document.getElementById('map-selector');
    if (!container) return;
    
    let html = '';
    const maps = [
        { type: 'Center', icon: '🏰', name: 'Eternal Battlegrounds' },
        { type: 'RedHome', icon: '🔴', name: 'Red Borderlands' },
        { type: 'GreenHome', icon: '🟢', name: 'Green Borderlands' },
        { type: 'BlueHome', icon: '🔵', name: 'Blue Borderlands' }
    ];
    
    maps.forEach(map => {
        const active = map.type === currentMapType ? 'active' : '';
        html += `<button class="map-tab ${active}" onclick="switchMap('${map.type}')">`;
        html += `${map.icon} ${map.name}`;
        html += `</button>`;
    });
    
    container.innerHTML = html;
}

// Switch to different map
function switchMap(mapType) {
    currentMapType = mapType;
    renderMapSelector();
    renderMap(mapType);
}

// Render the interactive map
async function renderMap(mapType) {
    const container = document.getElementById('map-canvas');
    if (!container || !mapObjectives[mapType] || !objectivesData[mapType]) {
        container.innerHTML = '<p>Loading map data...</p>';
        return;
    }
    
    const config = MAP_CONFIG[mapType];
    const mapData = mapObjectives[mapType];
    const objectives = objectivesData[mapType];
    
    // Try to get official map extents (map_rect) for precise scaling
    let useMetaScaling = false;
    let minX, minY, maxX, maxY, rangeX, rangeY;
    try {
        // Prefer map_id from objective metadata (most reliable), fallback to match map id
        let candidateMapId = null;
        try {
            const firstObj = Object.values(objectives).find(o => o && (o.map_id || o.mapId));
            candidateMapId = firstObj ? (firstObj.map_id || firstObj.mapId) : null;
        } catch (_) { /* ignore */ }
        if (!candidateMapId && mapData && mapData.id) {
            candidateMapId = mapData.id;
        }
        if (candidateMapId) {
            const meta = await window.GW2Data.getMapMeta(candidateMapId);
            if (meta && meta.map_rect && Array.isArray(meta.map_rect) && meta.map_rect.length === 2) {
                // map_rect is [[minX, minY], [maxX, maxY]]
                minX = meta.map_rect[0][0];
                minY = meta.map_rect[0][1];
                maxX = meta.map_rect[1][0];
                maxY = meta.map_rect[1][1];
                rangeX = maxX - minX;
                rangeY = maxY - minY;
                useMetaScaling = rangeX > 0 && rangeY > 0;
            }
        }
    } catch (e) {
        console.warn('Failed to load map meta, falling back to objective-bounds scaling:', e);
    }
    
    // Fallback: derive bounds from objective coordinates (less accurate)
    if (!useMetaScaling) {
        const coords = Object.values(objectives)
            .filter(obj => obj.coord)
            .map(obj => ({ x: obj.coord[0], y: obj.coord[1] }));
        
        minX = Math.min(...coords.map(c => c.x));
        maxX = Math.max(...coords.map(c => c.x));
        minY = Math.min(...coords.map(c => c.y));
        maxY = Math.max(...coords.map(c => c.y));
        
        rangeX = maxX - minX;
        rangeY = maxY - minY;
    }
    
    // Local background images (downloaded once) for faster loads, prefer WebP when supported
    const bgUrls = {
        'Center': {
            low: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/eb_512.webp' : (window.APP_PREFIX || '') + '/static/maps/eb_512.jpg',
            high: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/eb_2048.webp' : (window.APP_PREFIX || '') + '/static/maps/eb_2048.jpg'
        },
        'RedHome': {
            low: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/red_bl_512.webp' : (window.APP_PREFIX || '') + '/static/maps/red_bl_512.jpg',
            high: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/red_bl_2048.webp' : (window.APP_PREFIX || '') + '/static/maps/red_bl_2048.jpg'
        },
        'BlueHome': {
            low: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/blue_bl_512.webp' : (window.APP_PREFIX || '') + '/static/maps/blue_bl_512.jpg',
            high: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/blue_bl_2048.webp' : (window.APP_PREFIX || '') + '/static/maps/blue_bl_2048.jpg'
        },
        'GreenHome': {
            low: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/green_bl_512.webp' : (window.APP_PREFIX || '') + '/static/maps/green_bl_512.jpg',
            high: SUPPORTS_WEBP ? (window.APP_PREFIX || '') + '/static/maps/green_bl_2048.webp' : (window.APP_PREFIX || '') + '/static/maps/green_bl_2048.jpg'
        }
    };
    
    // Create SVG map
    let html = `<svg class="wvw-map-svg" viewBox="0 0 ${config.width} ${config.height}">`;
    
    // Background image
    if (bgUrls[mapType]) {
        // Load low-res first; we'll swap to high-res once loaded
        html += `<image id="map-bg" href="${bgUrls[mapType].low}" width="${config.width}" height="${config.height}" preserveAspectRatio="none" opacity="0.85"/>`;
    } else {
        html += `<rect width="${config.width}" height="${config.height}" fill="#1a1a1a" stroke="#333" stroke-width="2"/>`;
    }
    
    // Very light overlay so markers are readable
    html += `<rect width="${config.width}" height="${config.height}" fill="#000" opacity="0.06"/>`;
    
    // Grid toggle support (defaults to on)
    const showGrid = document.getElementById('toggle-grid') ? document.getElementById('toggle-grid').checked : true;
    if (showGrid) {
        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * config.width;
            const y = (i / 10) * config.height;
            html += `<line x1="${x}" y1="0" x2="${x}" y2="${config.height}" stroke="#fff" stroke-width="0.5" opacity="0.08"/>`;
            html += `<line x1="0" y1="${y}" x2="${config.width}" y2="${y}" stroke="#fff" stroke-width="0.5" opacity="0.08"/>`;
        }
    }
    
    // Render objectives
    mapData.objectives.forEach(matchObj => {
        const objMeta = objectives[matchObj.id];
        if (!objMeta || !objMeta.coord) return;
        
        // Scale coordinates to map
        const x = ((objMeta.coord[0] - minX) / rangeX) * config.width;
        const y = config.height - ((objMeta.coord[1] - minY) / rangeY) * config.height;
        
        const color = getOwnerColor(matchObj.owner);
        const size = getObjectiveSize(matchObj.type);
        const icon = getObjectiveIcon(matchObj.type);
        
        // Objective marker
        html += `<g class="objective-marker" onclick="showObjectiveDetails('${matchObj.id}')" style="cursor: pointer;">`;
        
        // Glow effect for claimed objectives
        if (matchObj.claimed_by) {
            html += `<circle cx="${x}" cy="${y}" r="${size + 3}" fill="${color}" opacity="0.3"/>`;
        }
        
        // Main marker
        html += `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="#000" stroke-width="2"/>`;
        
        // Icon/text
        html += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" 
                       fill="#fff" font-size="14" font-weight="bold">${icon}</text>`;
        
        html += `</g>`;
    });
    
    html += '</svg>';
    
    // Add map legend
    html += '<div class="map-legend">';
    html += '<h4>Map Legend</h4>';
    html += '<div class="legend-items">';
    html += '<div class="legend-item"><span class="legend-icon keep">🏰</span> Keep</div>';
    html += '<div class="legend-item"><span class="legend-icon tower">🗼</span> Tower</div>';
    html += '<div class="legend-item"><span class="legend-icon camp">⛺</span> Camp</div>';
    html += '<div class="legend-item"><span class="legend-icon ruins">🏛️</span> Ruins</div>';
    html += '<div class="legend-item"><span class="legend-icon castle">👑</span> Castle</div>';
    html += '</div>';
    html += `<div class="map-scores">`;
    html += `<div style="color: #ff6b6b">Red: ${mapData.scores?.red || 0}</div>`;
    html += `<div style="color: #6bff6b">Green: ${mapData.scores?.green || 0}</div>`;
    html += `<div style="color: #6b6bff">Blue: ${mapData.scores?.blue || 0}</div>`;
    html += `</div>`;
    html += '</div>';
    
    container.innerHTML = html;

    // Progressive background swap to high-res once loaded (improves initial load time, esp. EB)
    try {
        if (bgUrls[mapType]) {
            const img = new Image();
            img.onload = () => {
                const bg = container.querySelector('#map-bg');
                if (bg) bg.setAttribute('href', bgUrls[mapType].high);
            };
            img.onerror = () => {
                // Remote wiki fallback if local high-res missing
                const fallback = {
                    'Center': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Eternal_Battlegrounds_map.jpg?width=2048',
                    'RedHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Red_Desert_Borderlands_map.jpg?width=2048',
                    'BlueHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Blue_Alpine_Borderlands_map.jpg?width=2048',
                    'GreenHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Green_Alpine_Borderlands_map.jpg?width=2048'
                };
                const bg = container.querySelector('#map-bg');
                if (bg && fallback[mapType]) bg.setAttribute('href', fallback[mapType]);
            };
            img.src = bgUrls[mapType].high;
        }
    } catch (e) {
        console.warn('High-res swap failed:', e);
    }
}
// Get icon for objective type
// Missing helpers restored after patch corrections
function getOwnerColor(owner) {
    const colors = {
        'Red': '#ff6b6b',
        'Green': '#6bff6b',
        'Blue': '#6b6bff',
        'Neutral': '#888888'
    };
    return colors[owner] || '#888888';
}

function getObjectiveSize(type) {
    const sizes = {
        'Castle': 25,
        'Keep': 20,
        'Tower': 15,
        'Camp': 12,
        'Ruins': 10,
        'Spawn': 18,
        'Resource': 8,
        'Mercenary': 10
    };
    return sizes[type] || 10;
}

function getObjectiveIcon(type) {
    const icons = {
        'Castle': '👑',
        'Keep': '🏰',
        'Tower': '🗼',
        'Camp': '⛺',
        'Ruins': '🏛',
        'Spawn': '🏁',
        'Resource': '⚒',
        'Mercenary': '⚔'
    };
    return icons[type] || '●';
}

// Show objective details
function showObjectiveDetails(objectiveId) {
    const objMeta = objectivesData[currentMapType][objectiveId];
    const matchObj = mapObjectives[currentMapType].objectives.find(o => o.id === objectiveId);
    
    if (!objMeta || !matchObj) return;
    
    const detailsContainer = document.getElementById('objective-details');
    if (!detailsContainer) return;
    
    let html = `<div class="objective-details-card">`;
    html += `<h3 style="color: ${getOwnerColor(matchObj.owner)}">${objMeta.name}</h3>`;
    html += `<p><strong>Type:</strong> ${matchObj.type}</p>`;
    html += `<p><strong>Owner:</strong> <span style="color: ${getOwnerColor(matchObj.owner)}">${matchObj.owner}</span></p>`;
    html += `<p><strong>Points per tick:</strong> ${matchObj.points_tick}</p>`;
    html += `<p><strong>Points on capture:</strong> ${matchObj.points_capture}</p>`;
    
    if (matchObj.yaks_delivered !== undefined) {
        html += `<p><strong>Yaks delivered:</strong> ${matchObj.yaks_delivered}</p>`;
    }
    
    if (matchObj.claimed_by && matchObj.guild_name) {
        html += `<p><strong>Claimed by:</strong> [${matchObj.guild_tag}] ${matchObj.guild_name}</p>`;
        html += `<p><strong>Claimed at:</strong> ${new Date(matchObj.claimed_at).toLocaleString()}</p>`;
    }
    
    html += `</div>`;
    
    detailsContainer.innerHTML = html;
}

// Auto-refresh functionality
function startAutoRefresh(intervalSeconds = null) {
    // Clear existing interval
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    // Use provided interval or fall back to current/default
    if (intervalSeconds !== null) {
        currentMapsInterval = intervalSeconds;
    }

    const intervalMs = currentMapsInterval * 1000;

    // Refresh at configured interval
    autoRefreshInterval = setInterval(async () => {
        await loadCurrentMatch();
        renderMap(currentMapType);
        console.log('Map data refreshed');
    }, intervalMs);

    console.log(`Maps auto-refresh started with ${currentMapsInterval}s interval`);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}
