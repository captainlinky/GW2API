// GW2 API Tool - JavaScript

// Global polling configuration
let dashboardPollingInterval = null;
let currentDashboardInterval = 60; // default 60 seconds

// Global data cache to prevent duplicate API calls
window.GW2Data = {
    matchData: null,
    matchDataTimestamp: null,
    objectivesMetadata: null,
    mapsMeta: {}, // key: mapId -> { map_rect, continent_rect }
    loadingMatch: null, // Promise to prevent concurrent loads
    
    async getMatchData(worldId = 1020, forceRefresh = false) {
        const now = Date.now();
        const cacheAge = this.matchDataTimestamp ? now - this.matchDataTimestamp : Infinity;
        
        // Return cached data if less than 30 seconds old
        if (!forceRefresh && this.matchData && cacheAge < 30000) {
            console.log('Using cached match data');
            return this.matchData;
        }
        
        // If already loading, wait for that promise
        if (this.loadingMatch) {
            console.log('Waiting for existing match data load');
            return this.loadingMatch;
        }
        
        // Load fresh data with timeout
        console.log('Loading fresh match data');
        const startTime = performance.now();
        this.loadingMatch = Promise.race([
            fetch(`/api/wvw/match/${worldId}`).then(response => response.json()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout after 15s')), 15000))
        ])
            .then(data => {
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                console.log(`[FRONTEND] Match data loaded in ${elapsed}s`);
                if (data.status === 'success') {
                    this.matchData = data.data;
                    this.matchDataTimestamp = now;
                    return this.matchData;
                }
                throw new Error(data.message || 'Failed to load match data');
            })
            .catch(error => {
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                console.error(`[FRONTEND] Match data error after ${elapsed}s:`, error);
                throw error;
            })
            .finally(() => {
                this.loadingMatch = null;
            });
        
        return this.loadingMatch;
    },
    
    async getObjectivesMetadata(forceRefresh = false) {
        if (!forceRefresh && this.objectivesMetadata) {
            console.log('Using cached objectives metadata');
            return this.objectivesMetadata;
        }
        
        console.log('Loading objectives metadata');
        const response = await fetch('https://api.guildwars2.com/v2/wvw/objectives?ids=all');
        const objectives = await response.json();
        
        // Organize by map type
        this.objectivesMetadata = {};
        objectives.forEach(obj => {
            if (!this.objectivesMetadata[obj.map_type]) {
                this.objectivesMetadata[obj.map_type] = {};
            }
            this.objectivesMetadata[obj.map_type][obj.id] = obj;
        });
        
        return this.objectivesMetadata;
    },

    async getMapMeta(mapId) {
        if (!mapId) throw new Error('getMapMeta requires mapId');
        if (this.mapsMeta[mapId]) {
            return this.mapsMeta[mapId];
        }
        console.log('Loading map meta for', mapId);
        const resp = await fetch(`/api/proxy/maps/${mapId}`);
        if (resp.ok) {
            const result = await resp.json();
            // Handle backend response format: {status: 'success', data: {...}}
            const data = result.status === 'success' ? result.data : result;
            // Also support direct array or maps wrapper
            const map = Array.isArray(data) ? data[0] : (data.maps ? data.maps[0] : data);
            if (map && map.map_rect) {
                this.mapsMeta[mapId] = { map_rect: map.map_rect, continent_rect: map.continent_rect };
                console.log(`Map ${mapId} metadata loaded:`, this.mapsMeta[mapId]);
                return this.mapsMeta[mapId];
            }
        }
        // Fallback direct API if backend proxy not available
        const direct = await fetch(`https://api.guildwars2.com/v2/maps?ids=${mapId}`);
        const arr = await direct.json();
        const map = Array.isArray(arr) ? arr[0] : arr;
        this.mapsMeta[mapId] = { map_rect: map.map_rect, continent_rect: map.continent_rect };
        return this.mapsMeta[mapId];
    }
};

// Enhanced WvW Stats with skirmish timer
let skirmishTimerInterval = null;

async function updateEnhancedWvWStats() {
    try {
        const response = await fetch('/api/wvw/stats/1020');
        const data = await response.json();

        if (data.status === 'success') {
            // Update tier badge
            if (data.tier_info && data.tier_info.tier) {
                const tierBadge = document.getElementById('tier-badge');
                if (tierBadge) {
                    tierBadge.textContent = `${data.tier_info.region} Tier ${data.tier_info.tier}`;
                    tierBadge.style.display = 'inline-block';
                }
            }

            // Update PPT
            document.getElementById('ppt-red').textContent = data.ppt.red || '--';
            document.getElementById('ppt-green').textContent = data.ppt.green || '--';
            document.getElementById('ppt-blue').textContent = data.ppt.blue || '--';

            // Update alliance names with colors in PPT labels
            if (data.team_names) {
                const pptRedLabel = document.getElementById('ppt-red-label');
                const pptGreenLabel = document.getElementById('ppt-green-label');
                const pptBlueLabel = document.getElementById('ppt-blue-label');

                if (pptRedLabel) pptRedLabel.textContent = `${data.team_names.red}:`;
                if (pptGreenLabel) pptGreenLabel.textContent = `${data.team_names.green}:`;
                if (pptBlueLabel) pptBlueLabel.textContent = `${data.team_names.blue}:`;

                // Update territory control team names
                const territoryRedTeam = document.getElementById('territory-red-team');
                const territoryGreenTeam = document.getElementById('territory-green-team');
                const territoryBlueTeam = document.getElementById('territory-blue-team');

                if (territoryRedTeam) territoryRedTeam.textContent = data.team_names.red;
                if (territoryGreenTeam) territoryGreenTeam.textContent = data.team_names.green;
                if (territoryBlueTeam) territoryBlueTeam.textContent = data.team_names.blue;
            }

            // Update territory control
            updateTerritoryControl(data);

            // Update skirmish timer
            if (data.skirmish && data.skirmish.seconds_to_next !== null) {
                startSkirmishCountdown(data.skirmish.seconds_to_next, data.skirmish.current, data.skirmish.total);
            }
        }
    } catch (error) {
        console.error('Error updating enhanced WvW stats:', error);
    }
}

function updateTerritoryControl(data) {
    const colors = ['red', 'green', 'blue'];

    colors.forEach(color => {
        const percent = data.territory_control[color] || 0;
        const objectives = data.objectives_count[color] || 0;
        const types = data.objective_types[color] || {};

        document.getElementById(`territory-${color}-percent`).textContent = `${percent}%`;
        document.getElementById(`territory-${color}-bar`).style.width = `${percent}%`;

        // Build details string
        const details = `${objectives} obj (${types.Camp || 0}C, ${types.Tower || 0}T, ${types.Keep || 0}K, ${types.Castle || 0}S)`;
        document.getElementById(`territory-${color}-details`).textContent = details;
    });
}

function startSkirmishCountdown(secondsRemaining, currentSkirmish, totalSkirmishes) {
    // Clear existing interval
    if (skirmishTimerInterval) {
        clearInterval(skirmishTimerInterval);
    }

    let remaining = secondsRemaining;

    function updateDisplay() {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('skirmish-countdown').textContent = display;
        document.getElementById('skirmish-info').textContent = `Skirmish ${currentSkirmish} / ${totalSkirmishes}`;

        if (remaining > 0) {
            remaining--;
        } else {
            // Skirmish ended, refresh stats
            updateEnhancedWvWStats();
        }
    }

    updateDisplay();
    skirmishTimerInterval = setInterval(updateDisplay, 1000);
}

// Start dashboard polling with configurable interval
function startDashboardPolling(intervalSeconds) {
    // Clear existing interval if any
    if (dashboardPollingInterval) {
        clearInterval(dashboardPollingInterval);
    }

    currentDashboardInterval = intervalSeconds;
    const intervalMs = intervalSeconds * 1000;

    // Set up new polling interval
    dashboardPollingInterval = setInterval(() => {
        updateDashboardStats();
        updateTeamBars();
        updateActivityTimeline();
        updateKDRTimeline();
        updatePPTTimeline();
        updateEnhancedWvWStats();
    }, intervalMs);

    console.log(`Dashboard polling started with ${intervalSeconds}s interval`);
}

// Load polling configuration from server
async function loadPollingConfig() {
    try {
        const response = await fetch('/api/polling-config');
        const data = await response.json();

        if (data.status === 'success') {
            currentDashboardInterval = data.config.dashboard_interval;
            return data.config;
        }
    } catch (error) {
        console.error('Failed to load polling config:', error);
    }

    // Return defaults if fetch fails
    return {
        dashboard_interval: 60,
        maps_interval: 30
    };
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    setupTabs();
    checkApiStatus();

    // Load polling configuration and start polling
    const config = await loadPollingConfig();

    // Initialize dashboard stats and auto-load match data (this will cache it)
    updateDashboardStats();
    updateTeamBars();
    updateActivityTimeline();
    updateKDRTimeline();
    updatePPTTimeline();
    updateEnhancedWvWStats();

    // Start polling with configured interval
    startDashboardPolling(config.dashboard_interval);

    // Update settings UI if on settings tab
    updatePollingConfigUI(config);
});

// Enhanced Dashboard Functions
async function updateDashboardStats() {
    try {
        // Get account info
        const accountResponse = await fetch('/api/account');
        const accountData = await accountResponse.json();
        
        if (accountData.data) {
            document.getElementById('stat-account-name').textContent = accountData.data.name || 'N/A';
        }
        
        // Get WvW match data from cache (with fast fail)
        try {
            const match = await Promise.race([
                window.GW2Data.getMatchData(1020),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard timeout')), 5000))
            ]);
            
            if (match) {
                
                // Find which team the player is on
                let myTeam = null;
                let myColor = null;
                for (const color of ['red', 'green', 'blue']) {
                    if (match.worlds[color].all_world_ids && match.worlds[color].all_world_ids.includes(1020)) {
                        myTeam = match.worlds[color];
                        myColor = color;
                        break;
                    }
                }
                
                if (myTeam && myColor) {
                    // Apply team color to stat cards
                    const teamColors = {
                        'red': '#ff6b6b',
                        'green': '#6bff6b',
                        'blue': '#6b6bff'
                    };
                    const teamColor = teamColors[myColor];
                    
                    document.getElementById('stat-card-vp').style.borderLeft = `4px solid ${teamColor}`;
                    document.getElementById('stat-card-vp').style.boxShadow = `0 2px 8px ${teamColor}33`;
                    document.getElementById('stat-card-score').style.borderLeft = `4px solid ${teamColor}`;
                    document.getElementById('stat-card-score').style.boxShadow = `0 2px 8px ${teamColor}33`;
                    document.getElementById('stat-card-kd').style.borderLeft = `4px solid ${teamColor}`;
                    document.getElementById('stat-card-kd').style.boxShadow = `0 2px 8px ${teamColor}33`;
                    
                    // Victory Points
                    const vp = match.victory_points[myColor] || 0;
                    document.getElementById('stat-victory-points').textContent = vp;
                    
                    // War Score
                    const score = match.scores[myColor] || 0;
                    document.getElementById('stat-war-score').textContent = score.toLocaleString();
                    
                    // K/D Ratio
                    const kills = match.kills[myColor] || 0;
                    const deaths = match.deaths[myColor] || 1; // Avoid division by zero
                    const kd = (kills / deaths).toFixed(2);
                    document.getElementById('stat-kd-ratio').textContent = kd;
                    
                    // Update match overview
                    updateMatchOverview(match, myColor);
                }
            }
        } catch (dashError) {
            console.warn('Dashboard WvW stats skipped (timeout or error):', dashError);
            // Don't block dashboard if WvW slow
        }
        
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
    }
}

function updateMatchOverview(match, myColor) {
    const container = document.getElementById('match-overview-content');
    if (!container) return;
    
    let html = '';
    
    // Team cards
    html += '<div class="match-teams-grid">';
    
    for (const color of ['red', 'green', 'blue']) {
        const team = match.worlds[color];
        const isMyTeam = color === myColor;
        const score = match.scores[color] || 0;
        const vp = match.victory_points[color] || 0;
        const kills = match.kills[color] || 0;
        const deaths = match.deaths[color] || 0;
        const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
        
        html += `<div class="match-team-card team-${color}">`;
        html += `<h4 style="color: ${getTeamColor(color)}">${isMyTeam ? '⭐ ' : ''}${team.display_name || team.main_world_name}</h4>`;
        
        html += `<div class="match-stat-row">`;
        html += `<span class="match-stat-label">War Score:</span>`;
        html += `<span class="match-stat-value">${score.toLocaleString()}</span>`;
        html += `</div>`;
        
        html += `<div class="match-stat-row">`;
        html += `<span class="match-stat-label">Victory Points:</span>`;
        html += `<span class="match-stat-value">${vp}</span>`;
        html += `</div>`;
        
        html += `<div class="match-stat-row">`;
        html += `<span class="match-stat-label">Kills:</span>`;
        html += `<span class="match-stat-value">${kills.toLocaleString()}</span>`;
        html += `</div>`;
        
        html += `<div class="match-stat-row">`;
        html += `<span class="match-stat-label">Deaths:</span>`;
        html += `<span class="match-stat-value">${deaths.toLocaleString()}</span>`;
        html += `</div>`;
        
        html += `<div class="match-stat-row">`;
        html += `<span class="match-stat-label">K/D Ratio:</span>`;
        html += `<span class="match-stat-value">${kd}</span>`;
        html += `</div>`;
        
        html += `</div>`;
    }
    
    html += '</div>';
    
    // Countdown to match end
    if (match.end_time) {
        const endDate = new Date(match.end_time);
        const now = new Date();
        const timeLeft = endDate - now;
        
        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            html += `<div class="match-countdown">`;
            html += `⏰ Match ends in <strong>${days}</strong> days and <strong>${hours}</strong> hours`;
            html += `</div>`;
        }
    }
    
    container.innerHTML = html;
}

async function updateTeamBars() {
    try {
        const matchesResponse = await fetch('/api/wvw/active-matches');
        const matchesData = await matchesResponse.json();
        
        if (matchesData.status === 'success' && matchesData.matches) {
            // Find my world's match in the summaries
            let myWorldMatch = null;
            for (const matchId in matchesData.matches) {
                const match = matchesData.matches[matchId];
                if (match.world_id) {
                    myWorldMatch = { match_id: matchId, ...match };
                    break;
                }
            }
            
            if (myWorldMatch && myWorldMatch.match_id) {
                const trackedResponse = await fetch(`/api/wvw/tracked-guilds/${myWorldMatch.match_id}`);
                const trackedData = await trackedResponse.json();

                // Check if match has expired (410 Gone status)
                if (trackedResponse.status === 410 || (trackedData.is_expired || trackedData.status === 'error' && trackedData.is_expired)) {
                    console.log('Match has expired, clearing old guild data');
                    // Clear old guild data
                    window.trackedGuildData = null;

                    // Reset team bars to show 0 guilds
                    ['red', 'green', 'blue'].forEach(color => {
                        const label = document.getElementById(`${color}-team-label`);
                        if (label) {
                            label.textContent = `${color === 'red' ? '🔴' : color === 'green' ? '🟢' : '🔵'} ${color.charAt(0).toUpperCase() + color.slice(1)} Team`;
                        }
                        const bar = document.getElementById(`${color}-bar`);
                        if (bar) {
                            bar.style.width = '0%';
                            bar.textContent = '';
                        }
                        const count = document.getElementById(`${color}-guild-count`);
                        if (count) {
                            count.textContent = '0 guilds';
                        }
                    });
                    return; // Exit early, don't try to display old data
                }

                if (trackedData.status === 'success' && trackedData.guilds && trackedData.match_info) {
                    // Store guild data globally for dropdown access
                    window.trackedGuildData = trackedData;

                    // Count unique guilds per team
                    const redCount = trackedData.guilds.red ? trackedData.guilds.red.length : 0;
                    const greenCount = trackedData.guilds.green ? trackedData.guilds.green.length : 0;
                    const blueCount = trackedData.guilds.blue ? trackedData.guilds.blue.length : 0;
                    const total = redCount + greenCount + blueCount;

                    // Get world display names from match_info (these are the in-game WvW instance names)
                    const redWorld = trackedData.match_info.teams.red.display_name ||
                                    trackedData.match_info.teams.red.main_world || 'Red Team';
                    const greenWorld = trackedData.match_info.teams.green.display_name ||
                                      trackedData.match_info.teams.green.main_world || 'Green Team';
                    const blueWorld = trackedData.match_info.teams.blue.display_name ||
                                     trackedData.match_info.teams.blue.main_world || 'Blue Team';

                    // Update red team
                    const redPercent = total > 0 ? (redCount / total) * 100 : 0;
                    const redLabel = document.getElementById('red-team-label');
                    if (redLabel) {
                        redLabel.textContent = `🔴 ${redWorld}`;
                    }
                    document.getElementById('red-bar').style.width = `${redPercent}%`;
                    document.getElementById('red-bar').textContent = redCount > 0 ? redCount : '';
                    document.getElementById('red-guild-count').textContent = `${redCount} guild${redCount !== 1 ? 's' : ''}`;

                    // Update green team
                    const greenPercent = total > 0 ? (greenCount / total) * 100 : 0;
                    const greenLabel = document.getElementById('green-team-label');
                    if (greenLabel) {
                        greenLabel.textContent = `🟢 ${greenWorld}`;
                    }
                    document.getElementById('green-bar').style.width = `${greenPercent}%`;
                    document.getElementById('green-bar').textContent = greenCount > 0 ? greenCount : '';
                    document.getElementById('green-guild-count').textContent = `${greenCount} guild${greenCount !== 1 ? 's' : ''}`;

                    // Update blue team
                    const bluePercent = total > 0 ? (blueCount / total) * 100 : 0;
                    const blueLabel = document.getElementById('blue-team-label');
                    if (blueLabel) {
                        blueLabel.textContent = `🔵 ${blueWorld}`;
                    }
                    document.getElementById('blue-bar').style.width = `${bluePercent}%`;
                    document.getElementById('blue-bar').textContent = blueCount > 0 ? blueCount : '';
                    document.getElementById('blue-guild-count').textContent = `${blueCount} guild${blueCount !== 1 ? 's' : ''}`;
                }
            }
        }
    } catch (error) {
        console.error('Error updating team bars:', error);
    }
}

// Toggle team guild dropdown
function toggleTeamGuilds(team) {
    const dropdown = document.getElementById(`${team}-guilds-dropdown`);
    const arrow = document.getElementById(`${team}-dropdown-arrow`);
    
    if (!dropdown) return;
    
    // Toggle visibility
    const isVisible = dropdown.style.display !== 'none';
    
    if (isVisible) {
        // Hide dropdown
        dropdown.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        // Show and populate dropdown
        dropdown.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        
        // Populate with guild data if available
        if (window.trackedGuildData) {
            populateTeamGuildsDropdown(team, dropdown);
        } else {
            dropdown.innerHTML = '<p style="padding: 10px; color: #888;">Loading guild data...</p>';
            // Try to load fresh data
            updateTeamBars().then(() => {
                if (window.trackedGuildData) {
                    populateTeamGuildsDropdown(team, dropdown);
                }
            });
        }
    }
}

function populateTeamGuildsDropdown(team, dropdown) {
    const data = window.trackedGuildData;
    if (!data || !data.guilds || !data.guilds[team]) {
        dropdown.innerHTML = '<p style="padding: 10px; color: #888;">No guild data available</p>';
        return;
    }
    
    const guilds = data.guilds[team];
    
    if (guilds.length === 0) {
        dropdown.innerHTML = '<p style="padding: 10px; color: #888; font-style: italic;">No guilds tracked for this team yet.</p>';
        return;
    }
    
    let html = '<div style="padding: 10px; background: rgba(0,0,0,0.2); margin-top: 5px; border-radius: 5px;">';
    html += `<strong style="color: ${getTeamColor(team)}">Tracked Guilds (${guilds.length})</strong>`;
    html += '<table style="width: 100%; margin-top: 10px; font-size: 0.9em;" class="guilds-table">';
    html += '<thead><tr style="background: rgba(255,255,255,0.05);">';
    html += '<th style="padding: 5px; text-align: left;">Tag</th>';
    html += '<th style="padding: 5px; text-align: left;">Guild Name</th>';
    html += '<th style="padding: 5px; text-align: center;">Claims</th>';
    html += '<th style="padding: 5px; text-align: left;">Objective Types</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    guilds.forEach(guild => {
        html += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">';
        html += `<td style="padding: 5px;"><strong>[${guild.tag || 'N/A'}]</strong></td>`;
        html += `<td style="padding: 5px;">${guild.name}</td>`;
        html += `<td style="padding: 5px; text-align: center;">${guild.claims_count}</td>`;
        html += `<td style="padding: 5px;">${guild.objective_types.join(', ')}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    html += '</div>';
    
    dropdown.innerHTML = html;
}

// Activity Timeline Visualization
let activityChartData = null;
let activityTimeWindow = '6h';  // Default time window

async function updateActivityTimeline() {
    try {
        const response = await fetch(`/api/wvw/activity/1020?window=${activityTimeWindow}`);
        const data = await response.json();
        
        if (data.status === 'success' && data.timeline) {
            console.log('Activity data received:', data.timeline.length, 'buckets');
            activityChartData = data; // Store for tooltip
            
            // Update legend with team names
            if (data.team_names) {
                document.getElementById('legend-red-team').textContent = data.team_names.red || 'Red Team';
                document.getElementById('legend-green-team').textContent = data.team_names.green || 'Green Team';
                document.getElementById('legend-blue-team').textContent = data.team_names.blue || 'Blue Team';

                // Apply team colors to legend team names
                applyTeamColor('legend-red-team', '#ff6b6b');
                applyTeamColor('legend-green-team', '#6bff6b');
                applyTeamColor('legend-blue-team', '#6b6bff');
            }
            
            renderActivityChart(data.timeline, data.team_names);
        } else {
            console.error('Activity data error:', data);
        }
    } catch (error) {
        console.error('Error updating activity timeline:', error);
    }
}

function renderActivityChart(timeline, teamNames) {
    const canvas = document.getElementById('activity-chart');
    if (!canvas) {
        console.error('Activity chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('activity-chart-container');
    
    // Set canvas size
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    canvas.width = containerWidth - 30;
    canvas.height = 250;
    
    console.log('Rendering line chart:', canvas.width, 'x', canvas.height);
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate time labels
    const now = new Date();
    const timeLabels = timeline.map((bucket, index) => {
        const minutesAgo = bucket.minutes_ago;
        const time = new Date(now.getTime() - minutesAgo * 60000);
        return {
            hour: time.getHours(),
            minute: time.getMinutes(),
            label: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
        };
    });
    
    // Find max value for scaling
    const maxValue = Math.max(
        Math.max(...timeline.map(b => b.red)),
        Math.max(...timeline.map(b => b.green)),
        Math.max(...timeline.map(b => b.blue)),
        1
    );
    
    console.log('Max captures in a bucket:', maxValue);
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }
    
    // Vertical grid lines (every hour)
    const xStep = chartWidth / (timeline.length - 1);
    for (let i = 0; i < timeline.length; i++) {
        if (timeLabels[i].minute === 0) {
            const x = padding.left + i * xStep;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
    }
    
    // Draw axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();
    
    // Helper function to draw line with points
    const drawTeamLine = (color, data, teamName) => {
        const points = [];
        
        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        let firstPoint = true;
        data.forEach((value, index) => {
            const x = padding.left + index * xStep;
            const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
            
            points.push({ x, y, value, index });
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points (circles)
        points.forEach(point => {
            if (point.value > 0) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                ctx.fill();
                
                // Add a white border to make points more visible
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });
        
        return points;
    };
    
    // Draw all three team lines
    const redData = timeline.map(b => b.red);
    const greenData = timeline.map(b => b.green);
    const blueData = timeline.map(b => b.blue);
    
    const redPoints = drawTeamLine('#ff6b6b', redData, teamNames?.red);
    const greenPoints = drawTeamLine('#6bff6b', greenData, teamNames?.green);
    const bluePoints = drawTeamLine('#6b6bff', blueData, teamNames?.blue);
    
    // Store points for tooltip detection
    canvas.chartPoints = { red: redPoints, green: greenPoints, blue: bluePoints };
    
    // Draw time labels on X-axis
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    // Determine label interval based on number of buckets and time window
    let labelInterval;
    if (timeline.length <= 24) {
        // 6h view (24 buckets): show every 4th label (every hour)
        labelInterval = 4;
    } else if (timeline.length <= 48) {
        // 24h view: show every 4th label
        labelInterval = 4;
    } else {
        // 7d view: show every 4th label
        labelInterval = 4;
    }

    timeline.forEach((bucket, index) => {
        // Show label based on interval
        if (index % labelInterval === 0 || index === timeline.length - 1) {
            const x = padding.left + index * xStep;
            // For time windows over 24 hours, show day of week + date (and time for 24h view)
            if (timeline.length > 24) {
                let time;
                if (bucket.timestamp) {
                    time = new Date(bucket.timestamp);
                } else {
                    time = new Date(now.getTime() - bucket.minutes_ago * 60000);
                }
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = dayNames[time.getDay()];
                // For 7-day view, just show day and date; for 24h view, add time
                if (timeline.length > 48) {
                    const dateLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                } else {
                    const dateLabel = `${dayName} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                }
            } else {
                ctx.fillText(timeLabels[index].label, x, padding.top + chartHeight + 20);
            }
        }
    });

    // Draw Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        const value = Math.round(maxValue * (1 - i / 5));
        ctx.fillText(value.toString(), padding.left - 10, y + 4);
    }

    // Y-axis label
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 12px Arial';
    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Captures', 0, 0);
    ctx.restore();
    
    // Add mouse move listener for tooltip
    canvas.onmousemove = (e) => showActivityTooltip(e, canvas, timeline, teamNames, padding, xStep);
    canvas.onmouseleave = () => hideActivityTooltip();
}

function showActivityTooltip(e, canvas, timeline, teamNames, padding, xStep) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const points = canvas.chartPoints;
    if (!points) return;
    
    // Check all points to see if mouse is near any
    let nearestPoint = null;
    let nearestDistance = Infinity;
    let nearestTeam = null;
    
    const checkPoints = (teamPoints, teamName, color) => {
        teamPoints.forEach(point => {
            if (point.value > 0) {
                const distance = Math.sqrt(
                    Math.pow(mouseX - point.x, 2) + 
                    Math.pow(mouseY - point.y, 2)
                );
                
                if (distance < 10 && distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPoint = point;
                    nearestTeam = { name: teamName, color: color };
                }
            }
        });
    };
    
    checkPoints(points.red, teamNames?.red || 'Red Team', '#ff6b6b');
    checkPoints(points.green, teamNames?.green || 'Green Team', '#6bff6b');
    checkPoints(points.blue, teamNames?.blue || 'Blue Team', '#6b6bff');
    
    if (!nearestPoint) {
        hideActivityTooltip();
        return;
    }
    
    const bucket = timeline[nearestPoint.index];
    
    // Create or update tooltip
    let tooltip = document.getElementById('activity-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'activity-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '10px';
        tooltip.style.borderRadius = '5px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.border = '1px solid #d4af37';
        tooltip.style.minWidth = '150px';
        tooltip.style.whiteSpace = 'nowrap';
        // Append to the chart container instead of body
        canvas.parentElement.appendChild(tooltip);
    }
    
    // Calculate time for this bucket
    const now = new Date();
    let time;
    if (bucket.timestamp) {
        time = new Date(bucket.timestamp);
    } else {
        time = new Date(now.getTime() - bucket.minutes_ago * 60000);
    }

    // Format time label based on time window
    let timeLabel;
    if (timeline.length > 48) {
        // 7-day view: show day, date, and time
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[time.getDay()];
        timeLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    } else {
        // 6h or 24h view: show just time
        timeLabel = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    }

    // Format tooltip content
    let html = `<div style="margin-bottom: 5px; font-weight: bold; color: #d4af37;">${timeLabel}</div>`;
    
    // Helper function to format objective types
    const formatTypes = (types) => {
        if (!types || Object.keys(types).length === 0) return '';
        return Object.entries(types)
            .map(([type, count]) => `  ${type}: ${count}`)
            .join('<br>');
    };
    
    // Show data for the hovered team
    const teamIcon = nearestTeam.color === '#ff6b6b' ? '🔴' : 
                     nearestTeam.color === '#6bff6b' ? '🟢' : '🔵';
    
    html += `<div style="color: ${nearestTeam.color}; margin-top: 5px;">`;
    html += `<strong>${teamIcon} ${nearestTeam.name}: ${nearestPoint.value}</strong><br>`;
    
    // Get the types for this team
    const types = nearestTeam.color === '#ff6b6b' ? bucket.red_types :
                  nearestTeam.color === '#6bff6b' ? bucket.green_types :
                  bucket.blue_types;
    
    const typesStr = formatTypes(types);
    if (typesStr) html += typesStr;
    html += `</div>`;
    
    tooltip.innerHTML = html;
    
    // Position tooltip relative to canvas (since tooltip is in same container)
    const canvasOffsetX = canvas.offsetLeft;
    const canvasOffsetY = canvas.offsetTop;
    
    let tooltipX = canvasOffsetX + nearestPoint.x + 15;
    let tooltipY = canvasOffsetY + nearestPoint.y - 10;
    
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
    tooltip.style.display = 'block';
    
    // Adjust position if tooltip would go off the edge
    setTimeout(() => {
        const containerWidth = canvas.parentElement.clientWidth;
        const tooltipWidth = tooltip.offsetWidth;
        
        // If tooltip goes off right edge, show it to the left of the point
        if (tooltipX + tooltipWidth > containerWidth) {
            tooltip.style.left = (canvasOffsetX + nearestPoint.x - tooltipWidth - 15) + 'px';
        }
    }, 0);
}

function hideActivityTooltip() {
    const tooltip = document.getElementById('activity-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// K/D Ratio Timeline Visualization
let kdrChartData = null;
let kdrTimeWindow = '6h';  // Default time window

async function updateKDRTimeline() {
    try {
        const response = await fetch(`/api/wvw/kdr/1020?window=${kdrTimeWindow}`);
        const data = await response.json();
        
        if (data.status === 'success' && data.timeline) {
            console.log('K/D data received:', data.timeline.length, 'buckets');
            kdrChartData = data;
            
            // Update legend with team names
            if (data.team_names) {
                document.getElementById('kdr-legend-red-team').textContent = data.team_names.red || 'Red Team';
                document.getElementById('kdr-legend-green-team').textContent = data.team_names.green || 'Green Team';
                document.getElementById('kdr-legend-blue-team').textContent = data.team_names.blue || 'Blue Team';

                // Apply team colors to legend team names
                applyTeamColor('kdr-legend-red-team', '#ff6b6b');
                applyTeamColor('kdr-legend-green-team', '#6bff6b');
                applyTeamColor('kdr-legend-blue-team', '#6b6bff');
            }
            
            renderKDRChart(data.timeline, data.team_names, data.current_kills, data.current_deaths);
        } else {
            console.error('K/D data error:', data);
        }
    } catch (error) {
        console.error('Error updating K/D timeline:', error);
    }
}

function renderKDRChart(timeline, teamNames, kills, deaths) {
    const canvas = document.getElementById('kdr-chart');
    if (!canvas) {
        console.error('K/D chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('kdr-chart-container');
    
    // Set canvas size
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    canvas.width = containerWidth - 30;
    canvas.height = 250;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    console.log('Rendering K/D chart:', width, 'x', height);
    console.log('Timeline buckets:', timeline.length);
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate time labels
    const now = new Date();
    const timeLabels = timeline.map((bucket, index) => {
        const minutesAgo = bucket.minutes_ago;
        const time = new Date(now.getTime() - minutesAgo * 60000);
        return {
            hour: time.getHours(),
            minute: time.getMinutes(),
            label: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
        };
    });
    
    // Find max K/D ratio for scaling
    const maxKDR = Math.max(
        Math.max(...timeline.map(b => b.red_kdr)),
        Math.max(...timeline.map(b => b.green_kdr)),
        Math.max(...timeline.map(b => b.blue_kdr)),
        2.0  // Minimum scale of 2.0
    );
    
    console.log('Max K/D ratio:', maxKDR);
    console.log('Sample K/D values - Red:', timeline[0]?.red_kdr, 'Green:', timeline[0]?.green_kdr, 'Blue:', timeline[0]?.blue_kdr);
    
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }
    
    // Draw 1.0 K/D reference line (break-even)
    const kdOne_Y = padding.top + chartHeight - (1.0 / maxKDR) * chartHeight;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, kdOne_Y);
    ctx.lineTo(padding.left + chartWidth, kdOne_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label for 1.0 line
    ctx.fillStyle = '#d4af37';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('1.0 (Break Even)', padding.left + 5, kdOne_Y - 5);
    
    // Vertical grid lines (every hour)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const xStep = chartWidth / (timeline.length - 1);
    for (let i = 0; i < timeline.length; i++) {
        if (timeLabels[i].minute === 0) {
            const x = padding.left + i * xStep;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
    }
    
    // Draw axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();
    
    // Helper function to draw line with points
    const drawKDRLine = (color, data, teamName) => {
        const points = [];

        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let firstPoint = true;
        data.forEach((kdr, index) => {
            const x = padding.left + index * xStep;
            const y = padding.top + chartHeight - (kdr / maxKDR) * chartHeight;

            points.push({ x, y, kdr, index });

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points (circles) - show all points
        points.forEach(point => {
            if (point && point.kdr > 0) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        return points;
    };
    
    // Draw all three team lines
    const redData = timeline.map(b => b.red_kdr);
    const greenData = timeline.map(b => b.green_kdr);
    const blueData = timeline.map(b => b.blue_kdr);
    
    const redPoints = drawKDRLine('#ff6b6b', redData, teamNames?.red);
    const greenPoints = drawKDRLine('#6bff6b', greenData, teamNames?.green);
    const bluePoints = drawKDRLine('#6b6bff', blueData, teamNames?.blue);
    
    // Store points for tooltip detection
    canvas.chartPoints = { red: redPoints, green: greenPoints, blue: bluePoints };
    
    // Draw time labels on X-axis
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    // Determine label interval based on number of buckets and time window
    let labelInterval;
    if (timeline.length <= 24) {
        // 6h view (24 buckets): show every 4th label (every hour)
        labelInterval = 4;
    } else if (timeline.length <= 48) {
        // 24h view: show every 4th label
        labelInterval = 4;
    } else {
        // 7d view: show every 4th label
        labelInterval = 4;
    }

    timeline.forEach((bucket, index) => {
        // Show label based on interval
        if (index % labelInterval === 0 || index === timeline.length - 1) {
            const x = padding.left + index * xStep;
            // For time windows over 24 hours, show day of week + date (and time for 24h view)
            if (timeline.length > 24) {
                let time;
                if (bucket.timestamp) {
                    time = new Date(bucket.timestamp);
                } else {
                    time = new Date(now.getTime() - bucket.minutes_ago * 60000);
                }
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = dayNames[time.getDay()];
                // For 7-day view, just show day and date; for 24h view, add time
                if (timeline.length > 48) {
                    const dateLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                } else {
                    const dateLabel = `${dayName} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                }
            } else {
                ctx.fillText(timeLabels[index].label, x, padding.top + chartHeight + 20);
            }
        }
    });

    // Draw Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        const value = (maxKDR * (1 - i / 5)).toFixed(1);
        ctx.fillText(value, padding.left - 10, y + 4);
    }

    // Y-axis label
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 12px Arial';
    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('K/D Ratio', 0, 0);
    ctx.restore();
    
    // Add mouse move listener for tooltip
    canvas.onmousemove = (e) => showKDRTooltip(e, canvas, timeline, teamNames, kills, deaths, padding, xStep);
    canvas.onmouseleave = () => hideKDRTooltip();
}

function showKDRTooltip(e, canvas, timeline, teamNames, kills, deaths, padding, xStep) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const points = canvas.chartPoints;
    if (!points) return;
    
    // Check all points to see if mouse is near any
    let nearestPoint = null;
    let nearestDistance = Infinity;
    let nearestTeam = null;
    
    const checkPoints = (teamPoints, teamName, color, teamKey) => {
        teamPoints.forEach(point => {
            const distance = Math.sqrt(
                Math.pow(mouseX - point.x, 2) + 
                Math.pow(mouseY - point.y, 2)
            );
            
            if (distance < 10 && distance < nearestDistance) {
                nearestDistance = distance;
                nearestPoint = point;
                nearestTeam = { name: teamName, color: color, key: teamKey };
            }
        });
    };
    
    checkPoints(points.red, teamNames?.red || 'Red Team', '#ff6b6b', 'red');
    checkPoints(points.green, teamNames?.green || 'Green Team', '#6bff6b', 'green');
    checkPoints(points.blue, teamNames?.blue || 'Blue Team', '#6b6bff', 'blue');
    
    if (!nearestPoint) {
        hideKDRTooltip();
        return;
    }
    
    const bucket = timeline[nearestPoint.index];
    
    // Create or update tooltip
    let tooltip = document.getElementById('kdr-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'kdr-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '10px';
        tooltip.style.borderRadius = '5px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.border = '1px solid #d4af37';
        tooltip.style.minWidth = '150px';
        tooltip.style.whiteSpace = 'nowrap';
        canvas.parentElement.appendChild(tooltip);
    }
    
    // Calculate time for this bucket
    const now = new Date();
    let time;
    if (bucket.timestamp) {
        time = new Date(bucket.timestamp);
    } else {
        time = new Date(now.getTime() - bucket.minutes_ago * 60000);
    }

    // Format time label based on time window
    let timeLabel;
    if (timeline.length > 48) {
        // 7-day view: show day, date, and time
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[time.getDay()];
        timeLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    } else {
        // 6h or 24h view: show just time
        timeLabel = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    }

    // Format tooltip content
    const teamIcon = nearestTeam.color === '#ff6b6b' ? '🔴' :
                     nearestTeam.color === '#6bff6b' ? '🟢' : '🔵';
    
    let html = `<div style="margin-bottom: 5px; font-weight: bold; color: #d4af37;">${timeLabel}</div>`;
    html += `<div style="color: ${nearestTeam.color}; margin-top: 5px;">`;
    html += `<strong>${teamIcon} ${nearestTeam.name}</strong><br>`;
    html += `K/D Ratio: <strong>${nearestPoint.kdr}</strong><br>`;
    html += `Kills: ${kills[nearestTeam.key].toLocaleString()}<br>`;
    html += `Deaths: ${deaths[nearestTeam.key].toLocaleString()}`;
    html += `</div>`;
    
    tooltip.innerHTML = html;
    
    // Position tooltip relative to canvas
    const canvasOffsetX = canvas.offsetLeft;
    const canvasOffsetY = canvas.offsetTop;
    
    let tooltipX = canvasOffsetX + nearestPoint.x + 15;
    let tooltipY = canvasOffsetY + nearestPoint.y - 10;
    
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
    tooltip.style.display = 'block';
    
    // Adjust if tooltip goes off edge
    setTimeout(() => {
        const containerWidth = canvas.parentElement.clientWidth;
        const tooltipWidth = tooltip.offsetWidth;
        
        if (tooltipX + tooltipWidth > containerWidth) {
            tooltip.style.left = (canvasOffsetX + nearestPoint.x - tooltipWidth - 15) + 'px';
        }
    }, 0);
}

function hideKDRTooltip() {
    const tooltip = document.getElementById('kdr-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Time Window Selection Functions
function setActivityTimeWindow(window) {
    activityTimeWindow = window;

    // Update button states
    document.querySelectorAll('[id^="activity-window-"]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`activity-window-${window}`).classList.add('active');

    // Reload chart with new window
    updateActivityTimeline();
}

function setKDRTimeWindow(window) {
    kdrTimeWindow = window;

    // Update button states
    document.querySelectorAll('[id^="kdr-window-"]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`kdr-window-${window}`).classList.add('active');

    // Reload chart with new window
    updateKDRTimeline();
}

// PPT Coverage Analysis Chart
let pptChartData = null;
let pptTimeWindow = '6h';  // Default time window

async function updatePPTTimeline() {
    try {
        const response = await fetch(`/api/wvw/ppt/1020?window=${pptTimeWindow}`);
        const data = await response.json();

        if (data.status === 'success' && data.timeline) {
            console.log('PPT data received:', data.timeline.length, 'buckets');
            pptChartData = data;

            // Update legend with team names
            if (data.team_names) {
                document.getElementById('ppt-legend-red-team').textContent = data.team_names.red || 'Red Team';
                document.getElementById('ppt-legend-green-team').textContent = data.team_names.green || 'Green Team';
                document.getElementById('ppt-legend-blue-team').textContent = data.team_names.blue || 'Blue Team';

                // Apply team colors to legend team names
                applyTeamColor('ppt-legend-red-team', '#ff6b6b');
                applyTeamColor('ppt-legend-green-team', '#6bff6b');
                applyTeamColor('ppt-legend-blue-team', '#6b6bff');
            }

            renderPPTChart(data.timeline, data.team_names, data.current_ppt);
        } else {
            console.error('PPT data error:', data);
        }
    } catch (error) {
        console.error('Error updating PPT timeline:', error);
    }
}

function renderPPTChart(timeline, teamNames, currentPPT) {
    const canvas = document.getElementById('ppt-chart');
    if (!canvas) {
        console.error('PPT chart canvas not found');
        return;
    }

    const ctx = canvas.getContext('2d');
    const container = document.getElementById('ppt-chart-container');

    // Set canvas size
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    canvas.width = containerWidth - 30;
    canvas.height = 250;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate time labels
    const now = new Date();
    const timeLabels = timeline.map((bucket, index) => {
        const minutesAgo = bucket.minutes_ago;
        const time = new Date(now.getTime() - minutesAgo * 60000);
        return {
            hour: time.getHours(),
            minute: time.getMinutes(),
            label: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
        };
    });

    // Find max PPT for scaling
    const maxPPT = Math.max(
        Math.max(...timeline.map(b => b.red_ppt)),
        Math.max(...timeline.map(b => b.green_ppt)),
        Math.max(...timeline.map(b => b.blue_ppt)),
        50  // Minimum scale of 50 PPT
    );

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }

    // Vertical grid lines
    const xStep = chartWidth / (timeline.length - 1);
    for (let i = 0; i < timeline.length; i++) {
        if (timeLabels[i].minute === 0) {
            const x = padding.left + i * xStep;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
    }

    // Draw axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // Helper function to draw line with points
    const drawPPTLine = (color, data, teamName) => {
        const points = [];

        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let firstPoint = true;
        data.forEach((ppt, index) => {
            const x = padding.left + index * xStep;
            const y = padding.top + chartHeight - (ppt / maxPPT) * chartHeight;

            points.push({ x, y, ppt, index });

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points (circles)
        points.forEach(point => {
            if (point.ppt > 0) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                ctx.fill();

                // Add a white border to make points more visible
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        return points;
    };

    // Draw all three team lines
    const redData = timeline.map(b => b.red_ppt);
    const greenData = timeline.map(b => b.green_ppt);
    const blueData = timeline.map(b => b.blue_ppt);

    const redPoints = drawPPTLine('#ff6b6b', redData, teamNames?.red);
    const greenPoints = drawPPTLine('#6bff6b', greenData, teamNames?.green);
    const bluePoints = drawPPTLine('#6b6bff', blueData, teamNames?.blue);

    // Store points for tooltip detection
    canvas.chartPoints = { red: redPoints, green: greenPoints, blue: bluePoints };

    // Draw time labels on X-axis
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    // Determine label interval
    let labelInterval;
    if (timeline.length <= 24) {
        labelInterval = 4;
    } else if (timeline.length <= 48) {
        labelInterval = 4;
    } else {
        labelInterval = 4;
    }

    timeline.forEach((bucket, index) => {
        if (index % labelInterval === 0 || index === timeline.length - 1) {
            const x = padding.left + index * xStep;
            // For time windows over 24 hours, show day of week + date (and time for 24h view)
            if (timeline.length > 24) {
                let time;
                if (bucket.timestamp) {
                    time = new Date(bucket.timestamp);
                } else {
                    time = new Date(now.getTime() - bucket.minutes_ago * 60000);
                }
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = dayNames[time.getDay()];
                // For 7-day view, just show day and date; for 24h view, add time
                if (timeline.length > 48) {
                    const dateLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                } else {
                    const dateLabel = `${dayName} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
                    ctx.fillText(dateLabel, x, padding.top + chartHeight + 20);
                }
            } else {
                ctx.fillText(timeLabels[index].label, x, padding.top + chartHeight + 20);
            }
        }
    });

    // Draw Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        const value = Math.round(maxPPT * (1 - i / 5));
        ctx.fillText(value.toString(), padding.left - 10, y + 4);
    }

    // Y-axis label
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 12px Arial';
    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('PPT (Points Per Tick)', 0, 0);
    ctx.restore();

    // Add mouse move listener for tooltip
    canvas.onmousemove = (e) => showPPTTooltip(e, canvas, timeline, teamNames, currentPPT, padding, xStep);
    canvas.onmouseleave = () => hidePPTTooltip();
}

function showPPTTooltip(e, canvas, timeline, teamNames, currentPPT, padding, xStep) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const points = canvas.chartPoints;
    if (!points) return;

    // Check all points to see if mouse is near any
    let nearestPoint = null;
    let nearestDistance = Infinity;
    let nearestTeam = null;

    const checkPoints = (teamPoints, teamName, color) => {
        teamPoints.forEach(point => {
            if (point.ppt > 0) {
                const distance = Math.sqrt(
                    Math.pow(mouseX - point.x, 2) +
                    Math.pow(mouseY - point.y, 2)
                );

                if (distance < 10 && distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPoint = point;
                    nearestTeam = { name: teamName, color: color };
                }
            }
        });
    };

    checkPoints(points.red, teamNames?.red || 'Red Team', '#ff6b6b');
    checkPoints(points.green, teamNames?.green || 'Green Team', '#6bff6b');
    checkPoints(points.blue, teamNames?.blue || 'Blue Team', '#6b6bff');

    if (!nearestPoint) {
        hidePPTTooltip();
        return;
    }

    const bucket = timeline[nearestPoint.index];

    // Create or update tooltip
    let tooltip = document.getElementById('ppt-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'ppt-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '10px';
        tooltip.style.borderRadius = '5px';
        tooltip.style.fontSize = '12px';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.border = '1px solid #d4af37';
        tooltip.style.minWidth = '150px';
        tooltip.style.whiteSpace = 'nowrap';
        canvas.parentElement.appendChild(tooltip);
    }

    // Calculate time for this bucket
    const now = new Date();
    let time;
    if (bucket.timestamp) {
        time = new Date(bucket.timestamp);
    } else {
        time = new Date(now.getTime() - bucket.minutes_ago * 60000);
    }

    // Format time label
    let timeLabel;
    if (timeline.length > 48) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[time.getDay()];
        timeLabel = `${dayName} ${time.getMonth() + 1}/${time.getDate()} ${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    } else {
        timeLabel = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    }

    tooltip.innerHTML = `
        <div style="border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 5px;">
            <strong>${timeLabel}</strong>
        </div>
        <div style="color: ${nearestTeam.color}; font-weight: bold;">
            ${nearestTeam.name}
        </div>
        <div>PPT: <strong>${nearestPoint.ppt.toFixed(0)}</strong></div>
        <div style="margin-top: 5px; font-size: 10px; color: #888;">
            ${nearestPoint.ppt * 12} pts/hour
        </div>
    `;

    // Position tooltip near the point
    tooltip.style.left = `${e.clientX - rect.left + 15}px`;
    tooltip.style.top = `${e.clientY - rect.top - 30}px`;
    tooltip.style.display = 'block';
}

function hidePPTTooltip() {
    const tooltip = document.getElementById('ppt-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

function setPPTTimeWindow(window) {
    pptTimeWindow = window;

    // Update button states
    document.querySelectorAll('[id^="ppt-window-"]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`ppt-window-${window}`).classList.add('active');

    // Reload chart with new window
    updatePPTTimeline();
}

// Helper function to apply team color to elements
function applyTeamColor(elementId, color) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.color = color;
    }
}

// Quick action to show tracked guilds for a specific team
async function showTeamGuildsQuick(team) {
    // Switch to WvW tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    const wvwTab = document.querySelector('[data-tab="wvw"]');
    wvwTab.classList.add('active');
    document.getElementById('wvw').classList.add('active');
    
    // Load tracked guilds
    await loadTrackedGuilds();
    
    // Switch to the specific team tab
    setTimeout(() => {
        showTeamGuilds(team);
        const trackedSection = document.querySelector('.tracked-guilds-container');
        if (trackedSection) {
            trackedSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 500);
}

async function loadMyWorldWvW() {
    // Deprecated - use reloadMatchData() instead
    await reloadMatchData();
}

async function loadTrackedGuildsQuick() {
    // Show in dashboard result area instead of switching tabs
    const resultDiv = document.getElementById('dashboard-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading tracked guilds...';
    resultDiv.scrollIntoView({ behavior: 'smooth' });
    
    try {
        // First, get active matches
        const matchesResponse = await fetch('/api/wvw/active-matches');
        const matchesData = await matchesResponse.json();
        
        if (matchesData.status !== 'success' || Object.keys(matchesData.matches).length === 0) {
            resultDiv.innerHTML = `
                <div class="info-box">
                    <p>No tracked matches yet.</p>
                    <p>Click "Reload Match Data" to start tracking guilds.</p>
                </div>
            `;
            return;
        }
        
        // Get the first (most recent) match or use current match ID
        const matchId = currentMatchId || Object.keys(matchesData.matches)[0];
        currentMatchId = matchId;
        
        // Fetch tracked guilds for this match
        const guildsResponse = await fetch(`/api/wvw/tracked-guilds/${matchId}`);
        const guildsData = await guildsResponse.json();

        // Check if match has expired
        if (guildsResponse.status === 410 || (guildsData.is_expired || guildsData.status === 'error' && guildsData.is_expired)) {
            resultDiv.innerHTML = `
                <div class="info-box" style="background: rgba(255, 165, 0, 0.1); border-color: orange;">
                    <h3 style="color: orange;">⚠️ Match Has Ended</h3>
                    <p>${guildsData.message || 'The previous match has ended and guild tracking data has been cleared.'}</p>
                    <p>Click <strong>Reload Match Data</strong> above to load the current matchup and start tracking new guilds.</p>
                    <button onclick="reloadMatchData()" class="btn btn-primary" style="margin-top: 10px;">🔄 Reload Match Data</button>
                </div>
            `;
            return;
        }

        if (guildsData.status === 'success') {
            renderTrackedGuildsInDashboard(guildsData, resultDiv);
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${guildsData.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

function renderTrackedGuildsInDashboard(data, container) {
    const matchInfo = data.match_info;
    const guilds = data.guilds;
    
    let html = '<div class="tracked-guilds-container">';
    
    // Header with match info
    html += '<div class="tracked-header">';
    html += `<h3>📊 Tracked Guilds for Matchup</h3>`;
    html += `<p><strong>Match ID:</strong> ${matchInfo.match_id}</p>`;
    
    if (matchInfo.start_time && matchInfo.end_time) {
        const start = new Date(matchInfo.start_time);
        const end = new Date(matchInfo.end_time);
        html += `<p><strong>Duration:</strong> ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</p>`;
    }
    
    if (matchInfo.last_updated) {
        const updated = new Date(matchInfo.last_updated);
        html += `<p><strong>Last Updated:</strong> ${updated.toLocaleString()}</p>`;
    }
    
    html += '</div>';
    
    // Create tabs for each team
    html += '<div class="team-tabs">';
    html += `<button class="team-tab active" onclick="showTeamGuildsInDashboard('red', event)" style="color: #ff6b6b">🔴 ${matchInfo.teams.red.display_name || matchInfo.teams.red.main_world || 'Red Team'}</button>`;
    html += `<button class="team-tab" onclick="showTeamGuildsInDashboard('green', event)" style="color: #6bff6b">🟢 ${matchInfo.teams.green.display_name || matchInfo.teams.green.main_world || 'Green Team'}</button>`;
    html += `<button class="team-tab" onclick="showTeamGuildsInDashboard('blue', event)" style="color: #6b6bff">🔵 ${matchInfo.teams.blue.display_name || matchInfo.teams.blue.main_world || 'Blue Team'}</button>`;
    html += '</div>';
    
    // Team guild lists
    ['red', 'green', 'blue'].forEach(color => {
        const teamGuilds = guilds[color];
        const teamInfo = matchInfo.teams[color];
        const isFirstTeam = color === 'red';
        const worldName = teamInfo.display_name || teamInfo.main_world || `${color.charAt(0).toUpperCase() + color.slice(1)} Team`;
        
        html += `<div id="team-${color}-guilds-dash" class="team-guilds-list" style="display: ${isFirstTeam ? 'block' : 'none'}">`;
        html += `<div class="team-info">`;
        html += `<h4 style="color: ${getTeamColor(color)}">${worldName}</h4>`;
        html += `<p><strong>Main World ID:</strong> ${teamInfo.main_world_id || 'N/A'}</p>`;
        
        if (teamInfo.linked_worlds && teamInfo.linked_worlds.length > 0) {
            html += '<p><strong>Linked Worlds:</strong></p><ul>';
            teamInfo.linked_worlds.forEach(world => {
                html += `<li>${world.name} (${world.id})</li>`;
            });
            html += '</ul>';
        }
        html += '</div>';
        
        if (teamGuilds.length === 0) {
            html += '<p><em>No guilds tracked for this team yet.</em></p>';
        } else {
            html += `<div class="guild-stats"><strong>Total Guilds:</strong> ${teamGuilds.length}</div>`;
            html += '<table class="guilds-table">';
            html += '<thead><tr>';
            html += '<th>Tag</th>';
            html += '<th>Guild Name</th>';
            html += '<th>Claims</th>';
            html += '<th>Objective Types</th>';
            html += '<th>Maps Active</th>';
            html += '<th>First Seen</th>';
            html += '<th>Last Seen</th>';
            html += '</tr></thead>';
            html += '<tbody>';
            
            teamGuilds.forEach(guild => {
                const firstSeen = new Date(guild.first_seen).toLocaleString();
                const lastSeen = new Date(guild.last_seen).toLocaleString();
                
                html += '<tr>';
                html += `<td><strong>[${guild.tag || 'N/A'}]</strong></td>`;
                html += `<td>${guild.name}</td>`;
                html += `<td class="text-center">${guild.claims_count}</td>`;
                html += `<td>${guild.objective_types.join(', ')}</td>`;
                html += `<td>${guild.maps_seen.map(m => getMapName(m)).join(', ')}</td>`;
                html += `<td style="font-size: 0.85em">${firstSeen}</td>`;
                html += `<td style="font-size: 0.85em">${lastSeen}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function showTeamGuildsInDashboard(team, event) {
    // Update tab buttons
    const parentContainer = event.target.closest('.tracked-guilds-container');
    parentContainer.querySelectorAll('.team-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Show/hide team lists
    ['red', 'green', 'blue'].forEach(color => {
        const teamDiv = document.getElementById(`team-${color}-guilds-dash`);
        if (teamDiv) {
            teamDiv.style.display = color === team ? 'block' : 'none';
        }
    });
}

async function reloadMatchData() {
    // Force refresh match data and update all dashboard stats
    const resultDiv = document.getElementById('dashboard-result');
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div class="loading"></div>
            <p style="margin-top: 15px;">Reloading match data...</p>
        </div>
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
    
    const startTime = performance.now();
    
    try {
        // Force refresh the match data
        const match = await window.GW2Data.getMatchData(1020, true);
        
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        
        if (match) {
            // Update dashboard stats with new data
            await updateDashboardStats();
            
            let html = `<div class="info-box" style="background: rgba(76, 175, 80, 0.1); border-left: 4px solid #4caf50;">`;
            html += `<h3>✅ Match Data Reloaded</h3>`;
            html += `<p>Successfully updated matchup data in ${elapsed}s</p>`;
            html += `<p><strong>Match ID:</strong> ${match.id}</p>`;
            
            if (match.start_time && match.end_time) {
                const start = new Date(match.start_time);
                const end = new Date(match.end_time);
                html += `<p><strong>Match Period:</strong> ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</p>`;
            }
            
            html += `<p style="margin-top: 15px;"><em>Stats above have been updated with the latest data.</em></p>`;
            html += `</div>`;
            
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: Could not load match data</div>`;
        }
    } catch (error) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.error('Match reload error:', error);
        resultDiv.innerHTML = `
            <div class="status-message status-error">
                <strong>Error reloading match data</strong> (${elapsed}s)
                <br><br>
                ${error.message}
                <br><br>
                <button onclick="reloadMatchData()" style="padding: 10px 20px; cursor: pointer;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

async function loadAccountQuick() {
    // Switch to account tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    const accountTab = document.querySelector('[data-tab="account"]');
    accountTab.classList.add('active');
    document.getElementById('account').classList.add('active');
    
    // Load account info
    await loadAccount();
}

async function loadWalletQuick() {
    // Switch to account tab
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    const accountTab = document.querySelector('[data-tab="account"]');
    accountTab.classList.add('active');
    document.getElementById('account').classList.add('active');
    
    // Load account info (which includes wallet)
    await loadAccount();
    
    // Scroll to wallet section
    const walletSection = document.querySelector('#account-content h3:last-of-type');
    if (walletSection) {
        walletSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Tab Management
function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// API Status Check
async function checkApiStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        const badge = document.getElementById('account-badge');
        if (data.status === 'success') {
            // API key is valid and working
            badge.innerHTML = `✓ ${data.account_name}`;
            badge.style.background = 'rgba(76, 175, 80, 0.2)';
            badge.style.color = '#4caf50';
        } else if (data.has_key) {
            // API key exists but call failed (rate limit, network error, invalid key)
            badge.innerHTML = '⚠ API Error';
            badge.style.background = 'rgba(244, 67, 54, 0.2)';
            badge.style.color = '#f44336';
            badge.title = data.message || 'API request failed';
        } else {
            // No API key configured
            badge.innerHTML = '⚠ No API Key';
            badge.style.background = 'rgba(255, 152, 0, 0.2)';
            badge.style.color = '#ff9800';
        }

        updateKeyStatus();
    } catch (error) {
        console.error('Error checking API status:', error);
        const badge = document.getElementById('account-badge');
        if (badge) {
            badge.innerHTML = '⚠ Connection Error';
            badge.style.background = 'rgba(158, 158, 158, 0.2)';
            badge.style.color = '#9e9e9e';
        }
    }
}

// Settings - API Key Management
async function updateKeyStatus() {
    try {
        const response = await fetch('/api/key');
        const data = await response.json();
        
        const statusDiv = document.getElementById('current-key-status');
        if (data.has_key) {
            statusDiv.innerHTML = `
                <div class="status-message status-success">
                    ✓ API Key configured: ${data.masked_key}
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="status-message status-warning">
                    ⚠ No API key configured. Please add one below.
                </div>
            `;
        }
    } catch (error) {
        console.error('Error updating key status:', error);
    }
}

async function saveApiKey() {
    const apiKey = document.getElementById('new-api-key').value.trim();
    
    if (!apiKey) {
        showMessage('settings', 'Please enter an API key', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ api_key: apiKey })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            showMessage('settings', `API key saved successfully! Account: ${data.account_name}`, 'success');
            document.getElementById('new-api-key').value = '';
            checkApiStatus();
        } else {
            showMessage('settings', data.message, 'error');
        }
    } catch (error) {
        showMessage('settings', 'Error saving API key: ' + error.message, 'error');
    }
}

async function deleteApiKey() {
    if (!confirm('Are you sure you want to delete your API key? You will need to add a new one to use the tool.')) {
        return;
    }

    try {
        const response = await fetch('/api/key', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showMessage('settings', 'API key deleted successfully. Add a new one to continue using the tool.', 'success');
            checkApiStatus();
        } else {
            showMessage('settings', data.message || 'Error deleting API key', 'error');
        }
    } catch (error) {
        showMessage('settings', 'Error deleting API key: ' + error.message, 'error');
    }
}

// Polling Configuration Functions
function updatePollingConfigUI(config) {
    const dashboardInput = document.getElementById('dashboard-interval');
    const mapsInput = document.getElementById('maps-interval');

    if (dashboardInput && config.dashboard_interval) {
        dashboardInput.value = config.dashboard_interval;
    }
    if (mapsInput && config.maps_interval) {
        mapsInput.value = config.maps_interval;
    }

    // Show current status
    const statusDiv = document.getElementById('polling-config-status');
    if (statusDiv) {
        statusDiv.innerHTML = `<div class="info-box">
            <p><strong>Current Settings:</strong> Dashboard refreshes every ${config.dashboard_interval} seconds, Maps refresh every ${config.maps_interval} seconds</p>
        </div>`;
    }
}

async function savePollingConfig() {
    const dashboardInterval = parseInt(document.getElementById('dashboard-interval').value);
    const mapsInterval = parseInt(document.getElementById('maps-interval').value);

    // Validate inputs
    if (isNaN(dashboardInterval) || isNaN(mapsInterval)) {
        showMessage('settings', 'Please enter valid numbers for both intervals', 'error');
        return;
    }

    if (dashboardInterval < 5 || dashboardInterval > 300) {
        showMessage('settings', 'Dashboard interval must be between 5 and 300 seconds', 'error');
        return;
    }

    if (mapsInterval < 5 || mapsInterval > 300) {
        showMessage('settings', 'Maps interval must be between 5 and 300 seconds', 'error');
        return;
    }

    try {
        const response = await fetch('/api/polling-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dashboard_interval: dashboardInterval,
                maps_interval: mapsInterval
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showMessage('settings', 'Polling settings saved successfully! Restart polling with new intervals...', 'success');

            // Restart dashboard polling with new interval
            startDashboardPolling(dashboardInterval);

            // Update maps polling if maps are loaded
            if (typeof startAutoRefresh === 'function') {
                startAutoRefresh(mapsInterval);
            }

            // Update status display
            updatePollingConfigUI(data.config);
        } else {
            showMessage('settings', data.message || 'Error saving polling configuration', 'error');
        }
    } catch (error) {
        showMessage('settings', 'Error saving polling configuration: ' + error.message, 'error');
    }
}

function resetPollingDefaults() {
    document.getElementById('dashboard-interval').value = 60;
    document.getElementById('maps-interval').value = 30;
    showMessage('settings', 'Reset to default values. Click "Save Settings" to apply.', 'info');
}

function toggleKeyVisibility() {
    const input = document.getElementById('new-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Account Functions
async function loadAccount() {
    await loadAccountDetails();
}

async function loadAccountDetails() {
    const resultDiv = document.getElementById('account-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading account information...';
    
    try {
        const response = await fetch('/api/account');
        const data = await response.json();
        
        if (data.status === 'success') {
            const account = data.data;
            resultDiv.innerHTML = `
                <h3>Account Information</h3>
                <table class="data-table">
                    <tr><td><strong>Name:</strong></td><td>${account.name}</td></tr>
                    <tr><td><strong>World:</strong></td><td>${account.world}</td></tr>
                    <tr><td><strong>Created:</strong></td><td>${new Date(account.created).toLocaleDateString()}</td></tr>
                    <tr><td><strong>Age:</strong></td><td>${account.age_days.toLocaleString()} days (${account.age_hours.toLocaleString()} hours)</td></tr>
                    <tr><td><strong>Commander:</strong></td><td>${account.commander ? '✓ Yes' : '✗ No'}</td></tr>
                    <tr><td><strong>Guilds:</strong></td><td>${account.guilds.length}</td></tr>
                    <tr><td><strong>Access:</strong></td><td>${account.access.join(', ')}</td></tr>
                    <tr><td><strong>Fractal Level:</strong></td><td>${account.fractal_level || 0}</td></tr>
                    <tr><td><strong>Daily AP:</strong></td><td>${account.daily_ap || 0}</td></tr>
                    <tr><td><strong>Monthly AP:</strong></td><td>${account.monthly_ap || 0}</td></tr>
                    <tr><td><strong>WvW Rank:</strong></td><td>${account.wvw_rank || 0}</td></tr>
                </table>
            `;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

async function loadWallet() {
    const resultDiv = document.querySelector('#account.active .result-container') || 
                      document.getElementById('dashboard-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading wallet...';
    
    try {
        const response = await fetch('/api/wallet');
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = '<h3>Wallet</h3><table class="data-table"><thead><tr><th>Currency</th><th>Amount</th></tr></thead><tbody>';
            
            data.data.forEach(item => {
                html += `<tr><td>${item.name}</td><td>${item.formatted}</td></tr>`;
            });
            
            html += '</tbody></table>';
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Character Functions
async function loadCharacters() {
    switchTab('characters');
    await loadCharacterList();
}

async function loadCharacterList() {
    const selectDiv = document.getElementById('character-select');
    const resultDiv = document.getElementById('characters-result');
    
    selectDiv.innerHTML = '<div class="loading"></div> Loading characters...';
    resultDiv.innerHTML = '';
    
    try {
        const response = await fetch('/api/characters');
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = '<h3>Select a Character</h3><div class="character-grid">';
            
            data.data.forEach(name => {
                html += `
                    <div class="character-card" onclick="loadCharacterDetails('${name}')">
                        <h4>${name}</h4>
                        <p>Click to view details</p>
                    </div>
                `;
            });
            
            html += '</div>';
            selectDiv.innerHTML = html;
        } else {
            selectDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        selectDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

async function loadCharacterDetails(name) {
    const resultDiv = document.getElementById('characters-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading character details...';
    
    try {
        const response = await fetch(`/api/character/${encodeURIComponent(name)}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            const char = data.data;
            resultDiv.innerHTML = `
                <h3>${char.name}</h3>
                <table class="data-table">
                    <tr><td><strong>Race:</strong></td><td>${char.race}</td></tr>
                    <tr><td><strong>Profession:</strong></td><td>${char.profession}</td></tr>
                    <tr><td><strong>Level:</strong></td><td>${char.level}</td></tr>
                    <tr><td><strong>Gender:</strong></td><td>${char.gender}</td></tr>
                    <tr><td><strong>Age:</strong></td><td>${char.age_hours.toLocaleString()} hours</td></tr>
                    <tr><td><strong>Deaths:</strong></td><td>${char.deaths || 0}</td></tr>
                    <tr><td><strong>Guild:</strong></td><td>${char.guild || 'None'}</td></tr>
                    <tr><td><strong>Created:</strong></td><td>${new Date(char.created).toLocaleDateString()}</td></tr>
                </table>
            `;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Materials Functions
async function loadMaterials() {
    const resultDiv = document.getElementById('dashboard-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading materials...';
    
    try {
        const response = await fetch('/api/materials');
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = `<h3>Material Storage (${data.total_types} types)</h3>`;
            html += '<table class="data-table"><thead><tr><th>Item ID</th><th>Count</th><th>Category</th></tr></thead><tbody>';
            
            data.data.slice(0, 50).forEach(item => {
                html += `<tr><td>${item.id}</td><td>${item.count.toLocaleString()}</td><td>${item.category || 'Unknown'}</td></tr>`;
            });
            
            html += '</tbody></table>';
            if (data.total_types > 50) {
                html += `<p style="margin-top: 10px; color: #a0a0a0;">Showing top 50 of ${data.total_types}</p>`;
            }
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Bank Functions
async function loadBank() {
    const resultDiv = document.getElementById('dashboard-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading bank...';
    
    try {
        const response = await fetch('/api/bank');
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = `<h3>Bank (${data.filled_slots} / ${data.total_slots} slots)</h3>`;
            html += '<table class="data-table"><thead><tr><th>Item ID</th><th>Count</th><th>Binding</th></tr></thead><tbody>';
            
            data.data.slice(0, 50).forEach(item => {
                html += `<tr><td>${item.id}</td><td>${item.count}</td><td>${item.binding || 'None'}</td></tr>`;
            });
            
            html += '</tbody></table>';
            if (data.data.length > 50) {
                html += `<p style="margin-top: 10px; color: #a0a0a0;">Showing first 50 items</p>`;
            }
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Trading Post Functions
function setItemIds(ids) {
    document.getElementById('item-ids').value = ids;
}

async function loadTradingPost() {
    const itemIds = document.getElementById('item-ids').value.trim();
    
    if (!itemIds) {
        showMessage('trading', 'Please enter item IDs', 'error');
        return;
    }
    
    const resultDiv = document.getElementById('trading-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading prices...';
    
    try {
        const response = await fetch(`/api/tp/prices?ids=${encodeURIComponent(itemIds)}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = '<h3>Trading Post Prices</h3>';
            html += '<table class="data-table"><thead><tr><th>Item</th><th>Buy Price</th><th>Sell Price</th><th>Spread</th><th>Supply</th><th>Demand</th><th>Action</th></tr></thead><tbody>';

            data.data.forEach(item => {
                html += `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.buy_formatted}</td>
                        <td>${item.sell_formatted}</td>
                        <td>${item.spread.toLocaleString()}c</td>
                        <td>${item.sell_quantity.toLocaleString()}</td>
                        <td>${item.buy_quantity.toLocaleString()}</td>
                        <td><button class="btn btn-small" onclick="loadItemEconomics(${item.id})">📊 Analyze</button></td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            resultDiv.innerHTML = html;

            // Auto-analyze if only one item was searched
            if (data.data.length === 1) {
                loadItemEconomics(data.data[0].id);
            }
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

function quickQuery(ids) {
    switchTab('trading');
    setItemIds(ids);
    loadTradingPost();
}

// Trading Post view switching
function switchTPView(view) {
    // Update tabs
    document.querySelectorAll('.tp-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    // Update views
    document.querySelectorAll('.tp-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`tp-view-${view}`).classList.add('active');

    // Clear results when switching views
    document.getElementById('trading-result').innerHTML = '';
}

// Load trading post transactions
async function loadTPTransactions(transactionType) {
    const resultDiv = document.getElementById('trading-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading transactions...';

    try {
        const response = await fetch(`/api/tp/transactions/${transactionType}`);
        const data = await response.json();

        if (data.status === 'success') {
            if (data.count === 0) {
                resultDiv.innerHTML = '<div class="info-box">No transactions found.</div>';
                return;
            }

            const typeLabels = {
                'current-sells': 'Current Sell Listings',
                'current-buys': 'Current Buy Orders',
                'history-sells': 'Sold Items (Last 90 Days)',
                'history-buys': 'Bought Items (Last 90 Days)'
            };

            let html = `<h3>${typeLabels[transactionType]} (${data.count})</h3>`;
            html += '<table class="data-table"><thead><tr>';
            html += '<th>Item</th><th>Quantity</th><th>Price (each)</th><th>Total</th>';

            if (transactionType.startsWith('history')) {
                html += '<th>Created</th><th>Completed</th>';
            } else {
                html += '<th>Created</th>';
            }

            html += '</tr></thead><tbody>';

            data.data.forEach(transaction => {
                const total = transaction.price * transaction.quantity;
                const totalFormatted = formatCurrency(total);

                html += `<tr>
                    <td>
                        ${transaction.icon ? `<img src="${transaction.icon}" width="24" height="24" style="vertical-align: middle; margin-right: 5px;">` : ''}
                        ${transaction.item_name}
                    </td>
                    <td>${transaction.quantity}</td>
                    <td>${transaction.price_formatted}</td>
                    <td>${totalFormatted}</td>`;

                if (transactionType.startsWith('history')) {
                    html += `<td>${formatDate(transaction.created)}</td>
                             <td>${formatDate(transaction.purchased)}</td>`;
                } else {
                    html += `<td>${formatDate(transaction.created)}</td>`;
                }

                html += '</tr>';
            });

            html += '</tbody></table>';
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Item search cache
let itemSearchCache = null;
let itemSearchTimeout = null;

// Search items by name
async function searchItems(query) {
    const resultsDiv = document.getElementById('item-search-results');

    if (!query || query.length < 2) {
        resultsDiv.classList.remove('active');
        return;
    }

    // Clear previous timeout
    if (itemSearchTimeout) {
        clearTimeout(itemSearchTimeout);
    }

    // Debounce the search
    itemSearchTimeout = setTimeout(async () => {
        try {
            // Build search cache on first search (common tradeable items)
            if (!itemSearchCache) {
                resultsDiv.innerHTML = '<div style="padding: 15px;">Loading item database...</div>';
                resultsDiv.classList.add('active');

                // Fetch commonly traded items (this list can be expanded)
                const commonItems = [
                    19721, 24277, 19976, 24295, 24358, 24289, 24300, 24277,
                    19684, 19685, 19686, 19687, 19688, 19689, 19690, 19691, // T6 materials
                    24341, 24342, 24343, 24344, 24345, 24346, // Charged items
                    46731, 46732, 46733, 46734, 46735, 46736, // Obsidian Shards, etc
                    19721, 19724, 19725, 19726, 19727, 19728, // Essences
                    12138, 12141, 12142, 12143, 12144, 12145, 12146, 12147, // Cores
                    24357, 24351, 24350, 24356, 24289, 24300, // Lodestones
                    19685, 19684, 19686, 19687, // More T6
                    19976, 19977, 24277, 24295, // Mystic materials
                    68063, 77482, 76491, 75762 // Legendary materials
                ];

                const response = await fetch(`/api/items?ids=${commonItems.join(',')}`);
                const data = await response.json();

                if (data.status === 'success') {
                    itemSearchCache = data.data;
                } else {
                    resultsDiv.innerHTML = '<div style="padding: 15px; color: #f44336;">Error loading items</div>';
                    return;
                }
            }

            // Filter items by query
            const lowerQuery = query.toLowerCase();
            const matches = itemSearchCache.filter(item =>
                item.name.toLowerCase().includes(lowerQuery)
            ).slice(0, 10); // Limit to 10 results

            if (matches.length === 0) {
                resultsDiv.innerHTML = '<div style="padding: 15px; opacity: 0.6;">No matches found. Try searching for common items like "ecto" or "mystic".</div>';
            } else {
                let html = '';
                matches.forEach(item => {
                    html += `
                        <div class="search-result-item" onclick="selectItem(${item.id}, '${item.name.replace(/'/g, "\\'")}')">
                            ${item.icon ? `<img src="${item.icon}" alt="${item.name}">` : ''}
                            <div>${item.name}</div>
                        </div>
                    `;
                });
                resultsDiv.innerHTML = html;
            }

            resultsDiv.classList.add('active');
        } catch (error) {
            console.error('Error searching items:', error);
            resultsDiv.innerHTML = '<div style="padding: 15px; color: #f44336;">Search error</div>';
        }
    }, 300); // 300ms debounce
}

function selectItem(itemId, itemName) {
    document.getElementById('item-ids').value = itemId;
    document.getElementById('item-search').value = itemName;
    document.getElementById('item-search-results').classList.remove('active');
    loadTradingPost();
}

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Helper function to format currency
function formatCurrency(copper) {
    const gold = Math.floor(copper / 10000);
    const silver = Math.floor((copper % 10000) / 100);
    const copperRem = copper % 100;
    return `${gold}g ${silver}s ${copperRem}c`;
}

// WvW Functions
function setWorldId(worldId) {
    document.getElementById('wvw-world-id').value = worldId;
}

async function loadAllWvWMatches() {
    const resultDiv = document.getElementById('wvw-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading all WvW matches...';
    
    try {
        const response = await fetch('/api/wvw/matches');
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = '<h3>All WvW Matches</h3>';
            
            data.data.forEach((match, index) => {
                html += renderMatchDetail(match, index + 1);
            });
            
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

async function loadMyWorldMatch() {
    const resultDiv = document.getElementById('wvw-result');
    
    // Show fast skeleton
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div class="loading"></div>
            <p style="margin-top: 15px;">Loading your world's match...</p>
            <p style="font-size: 0.9em; color: #888; margin-top: 5px;">
                This may take a few seconds on first load
            </p>
        </div>
    `;
    
    const startTime = performance.now();
    
    try {
        // Use cached match data with timeout
        const match = await window.GW2Data.getMatchData(1020);
        
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`[UI] Match loaded and rendered in ${elapsed}s`);
        
        if (match) {
            let html = `<h3>WvW Match for Your World (1020)</h3>`;
            html += `<p style="color: #888; font-size: 0.9em;">Loaded in ${elapsed}s</p>`;
            html += renderMatchDetail(match, null, 1020);
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: Could not load match data</div>`;
        }
    } catch (error) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.error('Match load error:', error);
        resultDiv.innerHTML = `
            <div class="status-message status-error">
                <strong>Error loading match data</strong> (${elapsed}s)
                <br><br>
                ${error.message}
                <br><br>
                <button onclick="loadMyWorldMatch()" style="padding: 10px 20px; cursor: pointer;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

async function loadSpecificWorldMatch() {
    const worldId = document.getElementById('wvw-world-id').value.trim();
    
    if (!worldId) {
        showMessage('wvw', 'Please enter a world ID', 'error');
        return;
    }
    
    const resultDiv = document.getElementById('wvw-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading match for world ' + worldId + '...';
    
    try {
        const response = await fetch(`/api/wvw/match/${worldId}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            let html = `<h3>WvW Match for World ${worldId}</h3>`;
            html += renderMatchDetail(data.data, null, parseInt(worldId));
            resultDiv.innerHTML = html;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

function renderMatchDetail(match, matchNumber, highlightWorldId) {
    let html = '<div class="wvw-match-card">';
    
    if (matchNumber) {
        html += `<h4>Match ${matchNumber}: ${match.id}</h4>`;
    } else {
        html += `<h4>Match: ${match.id}</h4>`;
    }
    
    // Match timing
    if (match.start_time && match.end_time) {
        const start = new Date(match.start_time);
        const end = new Date(match.end_time);
        html += `<p><strong>Duration:</strong> ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</p>`;
    }
    
    // Teams and Scores
    html += '<div class="wvw-teams">';
    
    ['red', 'green', 'blue'].forEach(color => {
        if (match.worlds && match.worlds[color]) {
            const team = match.worlds[color];
            const isMyWorld = highlightWorldId && 
                (team.main_world_id === highlightWorldId || 
                 team.all_world_ids?.includes(highlightWorldId));
            const worldName = team.display_name || team.main_world_name || `${color.charAt(0).toUpperCase() + color.slice(1)} Team`;
            
            html += `<div class="wvw-team wvw-team-${color} ${isMyWorld ? 'wvw-my-team' : ''}">`;
            html += `<h5 style="color: ${getTeamColor(color)}">⚔ ${worldName}</h5>`;
            html += `<p><strong>Legacy Server:</strong> ${team.main_world_name} (ID: ${team.main_world_id})</p>`;
            
            if (team.linked_worlds && team.linked_worlds.length > 0) {
                html += '<p><strong>Linked Worlds:</strong></p><ul>';
                team.linked_worlds.forEach(world => {
                    html += `<li>${world.name} (${world.id})</li>`;
                });
                html += '</ul>';
            } else {
                html += '<p><em>No linked worlds</em></p>';
            }
            
            // Scores
            if (match.victory_points && match.victory_points[color] !== undefined) {
                html += `<p><strong>Victory Points:</strong> ${match.victory_points[color]}</p>`;
            }
            if (match.kills && match.kills[color] !== undefined) {
                html += `<p><strong>Kills:</strong> ${match.kills[color].toLocaleString()}</p>`;
            }
            if (match.deaths && match.deaths[color] !== undefined) {
                html += `<p><strong>Deaths:</strong> ${match.deaths[color].toLocaleString()}</p>`;
            }
            
            html += '</div>';
        }
    });
    
    html += '</div>';
    
    // Maps information
    if (match.maps && match.maps.length > 0) {
        html += '<div class="wvw-maps"><h5>Map Details</h5>';
        
        match.maps.forEach(map => {
            html += '<div class="wvw-map-card">';
            html += `<h6>${getMapName(map.type)}</h6>`;
            
            if (map.scores) {
                html += '<div class="wvw-map-scores">';
                ['red', 'green', 'blue'].forEach(color => {
                    if (map.scores[color] !== undefined) {
                        html += `<span class="score-badge score-${color}">${color}: ${map.scores[color].toLocaleString()}</span>`;
                    }
                });
                html += '</div>';
            }
            
            // Objectives summary
            if (map.objectives) {
                const objByOwner = { red: 0, green: 0, blue: 0, neutral: 0 };
                const guildClaims = [];
                
                map.objectives.forEach(obj => {
                    const owner = obj.owner.toLowerCase();
                    if (objByOwner[owner] !== undefined) {
                        objByOwner[owner]++;
                    }
                    
                    // Collect guild claims
                    if (obj.claimed_by && obj.guild_name) {
                        guildClaims.push({
                            type: obj.type,
                            owner: obj.owner,
                            guild_name: obj.guild_name,
                            guild_tag: obj.guild_tag,
                            yaks: obj.yaks_delivered
                        });
                    }
                });
                
                html += '<p><strong>Objectives held:</strong> ';
                html += `<span style="color: #ff6b6b">Red: ${objByOwner.red}</span>, `;
                html += `<span style="color: #6bff6b">Green: ${objByOwner.green}</span>, `;
                html += `<span style="color: #6b6bff">Blue: ${objByOwner.blue}</span>`;
                if (objByOwner.neutral > 0) {
                    html += `, Neutral: ${objByOwner.neutral}`;
                }
                html += '</p>';
                
                // Show guild claims
                if (guildClaims.length > 0) {
                    html += '<div class="guild-claims">';
                    html += `<p><strong>Guild Claims (${guildClaims.length}):</strong></p>`;
                    html += '<ul class="guild-list">';
                    guildClaims.forEach(claim => {
                        html += `<li style="color: ${getTeamColor(claim.owner.toLowerCase())}">`;
                        
                        // Show guild name/tag if available, otherwise show guild ID
                        if (claim.guild_name && claim.guild_tag) {
                            html += `[${claim.guild_tag}] ${claim.guild_name}`;
                        } else if (claim.guild_name) {
                            html += claim.guild_name;
                        } else if (claim.claimed_by) {
                            // Show abbreviated guild ID for guilds we couldn't fetch
                            const shortId = claim.claimed_by.substring(0, 8);
                            html += `<span style="opacity: 0.6" title="${claim.claimed_by}">Guild ${shortId}...</span>`;
                        }
                        
                        html += ` - ${claim.type} (${claim.yaks} yaks)`;
                        html += `</li>`;
                    });
                    html += '</ul></div>';
                }
            }
            
            html += '</div>';
        });
        
        html += '</div>';
    }
    
    // Skirmishes
    if (match.skirmishes && match.skirmishes.length > 0) {
        const latestSkirmish = match.skirmishes[match.skirmishes.length - 1];
        html += '<div class="wvw-skirmish-info">';
        html += `<h5>Latest Skirmish (${latestSkirmish.id})</h5>`;
        
        if (latestSkirmish.scores) {
            html += '<p>';
            ['red', 'green', 'blue'].forEach(color => {
                if (latestSkirmish.scores[color] !== undefined) {
                    html += `<span class="score-badge score-${color}">${color}: ${latestSkirmish.scores[color].toLocaleString()}</span> `;
                }
            });
            html += '</p>';
        }
        
        html += `<p><em>Total skirmishes: ${match.skirmishes.length}</em></p>`;
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function getTeamColor(color) {
    const colors = {
        'red': '#ff6b6b',
        'green': '#6bff6b',
        'blue': '#6b6bff'
    };
    return colors[color] || '#ffffff';
}

function getMapName(type) {
    const mapNames = {
        'Center': 'Eternal Battlegrounds',
        'RedHome': 'Red Borderlands',
        'GreenHome': 'Green Borderlands',
        'BlueHome': 'Blue Borderlands'
    };
    return mapNames[type] || type;
}

// Custom Query Functions
function setQuery(endpoint, params) {
    document.getElementById('custom-endpoint').value = endpoint;
    document.getElementById('custom-params').value = params;
}

async function executeCustomQuery() {
    const endpoint = document.getElementById('custom-endpoint').value.trim();
    const paramsText = document.getElementById('custom-params').value.trim();
    
    if (!endpoint) {
        showMessage('query', 'Please enter an endpoint', 'error');
        return;
    }
    
    let params = {};
    if (paramsText) {
        try {
            params = JSON.parse(paramsText);
        } catch (e) {
            showMessage('query', 'Invalid JSON in parameters', 'error');
            return;
        }
    }
    
    const resultDiv = document.getElementById('query-result');
    resultDiv.innerHTML = '<div class="loading"></div> Executing query...';
    
    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ endpoint, params })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            resultDiv.innerHTML = `
                <h3>Query Result</h3>
                <pre>${JSON.stringify(data.data, null, 2)}</pre>
            `;
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${data.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

// Utility Functions
function showMessage(tab, message, type) {
    const resultDiv = document.getElementById(`${tab}-result`) || document.getElementById('dashboard-result');
    const className = `status-${type}`;
    resultDiv.innerHTML = `<div class="status-message ${className}">${message}</div>`;
}

// Tracked Guilds Functions
let currentMatchId = null;

async function loadTrackedGuilds() {
    const resultDiv = document.getElementById('wvw-result');
    resultDiv.innerHTML = '<div class="loading"></div> Loading tracked guilds...';
    
    try {
        // First, get active matches
        const matchesResponse = await fetch('/api/wvw/active-matches');
        const matchesData = await matchesResponse.json();
        
        if (matchesData.status !== 'success' || Object.keys(matchesData.matches).length === 0) {
            resultDiv.innerHTML = `
                <div class="info-box">
                    <p>No tracked matches yet.</p>
                    <p>Click "My World's Match" or "Load All Matches" to start tracking guilds.</p>
                </div>
            `;
            return;
        }
        
        // Get the first (most recent) match or use current match ID
        const matchId = currentMatchId || Object.keys(matchesData.matches)[0];
        currentMatchId = matchId;
        
        // Fetch tracked guilds for this match
        const guildsResponse = await fetch(`/api/wvw/tracked-guilds/${matchId}`);
        const guildsData = await guildsResponse.json();
        
        if (guildsData.status === 'success') {
            renderTrackedGuilds(guildsData);
        } else {
            resultDiv.innerHTML = `<div class="status-message status-error">Error: ${guildsData.message}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="status-message status-error">Error: ${error.message}</div>`;
    }
}

function renderTrackedGuilds(data) {
    const resultDiv = document.getElementById('wvw-result');
    const matchInfo = data.match_info;
    const guilds = data.guilds;
    
    let html = '<div class="tracked-guilds-container">';
    
    // Header with match info
    html += '<div class="tracked-header">';
    html += `<h3>📊 Tracked Guilds for Matchup</h3>`;
    html += `<p><strong>Match ID:</strong> ${matchInfo.match_id}</p>`;
    
    if (matchInfo.start_time && matchInfo.end_time) {
        const start = new Date(matchInfo.start_time);
        const end = new Date(matchInfo.end_time);
        html += `<p><strong>Duration:</strong> ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</p>`;
    }
    
    if (matchInfo.last_updated) {
        const updated = new Date(matchInfo.last_updated);
        html += `<p><strong>Last Updated:</strong> ${updated.toLocaleString()}</p>`;
    }
    
    html += '</div>';
    
    // Create tabs for each team
    html += '<div class="team-tabs">';
    html += `<button class="team-tab active" onclick="showTeamGuilds('red', event)" style="color: #ff6b6b">🔴 ${matchInfo.teams.red.display_name || matchInfo.teams.red.main_world || 'Red Team'}</button>`;
    html += `<button class="team-tab" onclick="showTeamGuilds('green', event)" style="color: #6bff6b">🟢 ${matchInfo.teams.green.display_name || matchInfo.teams.green.main_world || 'Green Team'}</button>`;
    html += `<button class="team-tab" onclick="showTeamGuilds('blue', event)" style="color: #6b6bff">🔵 ${matchInfo.teams.blue.display_name || matchInfo.teams.blue.main_world || 'Blue Team'}</button>`;
    html += '</div>';
    
    // Team guild lists
    ['red', 'green', 'blue'].forEach(color => {
        const teamGuilds = guilds[color];
        const teamInfo = matchInfo.teams[color];
        const isFirstTeam = color === 'red';
        const worldName = teamInfo.display_name || teamInfo.main_world || `${color.charAt(0).toUpperCase() + color.slice(1)} Team`;
        
        html += `<div id="team-${color}-guilds" class="team-guilds-list" style="display: ${isFirstTeam ? 'block' : 'none'}">`;
        html += `<div class="team-info">`;
        html += `<h4 style="color: ${getTeamColor(color)}">${worldName}</h4>`;
        html += `<p><strong>Main World ID:</strong> ${teamInfo.main_world_id || 'N/A'}</p>`;
        
        if (teamInfo.linked_worlds && teamInfo.linked_worlds.length > 0) {
            html += '<p><strong>Linked Worlds:</strong></p><ul>';
            teamInfo.linked_worlds.forEach(world => {
                html += `<li>${world.name} (${world.id})</li>`;
            });
            html += '</ul>';
        }
        html += '</div>';
        
        if (teamGuilds.length === 0) {
            html += '<p><em>No guilds tracked for this team yet.</em></p>';
        } else {
            html += `<div class="guild-stats"><strong>Total Guilds:</strong> ${teamGuilds.length}</div>`;
            html += '<table class="guilds-table">';
            html += '<thead><tr>';
            html += '<th>Tag</th>';
            html += '<th>Guild Name</th>';
            html += '<th>Claims</th>';
            html += '<th>Objective Types</th>';
            html += '<th>Maps Active</th>';
            html += '<th>First Seen</th>';
            html += '<th>Last Seen</th>';
            html += '</tr></thead>';
            html += '<tbody>';
            
            teamGuilds.forEach(guild => {
                const firstSeen = new Date(guild.first_seen).toLocaleString();
                const lastSeen = new Date(guild.last_seen).toLocaleString();
                
                html += '<tr>';
                html += `<td><strong>[${guild.tag || 'N/A'}]</strong></td>`;
                html += `<td>${guild.name}</td>`;
                html += `<td class="text-center">${guild.claims_count}</td>`;
                html += `<td>${guild.objective_types.join(', ')}</td>`;
                html += `<td>${guild.maps_seen.map(m => getMapName(m)).join(', ')}</td>`;
                html += `<td style="font-size: 0.85em">${firstSeen}</td>`;
                html += `<td style="font-size: 0.85em">${lastSeen}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    resultDiv.innerHTML = html;
}

function showTeamGuilds(team, event) {
    // Update tab buttons
    document.querySelectorAll('.team-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Show/hide team lists
    ['red', 'green', 'blue'].forEach(color => {
        const teamDiv = document.getElementById(`team-${color}-guilds`);
        teamDiv.style.display = color === team ? 'block' : 'none';
    });
}

// ============================================================================
// WAR ROOM FUNCTIONALITY
// ============================================================================

// War Room state
let warroomCurrentMapType = 'Center';
let warroomMapObjectives = {};
let warroomObjectivesData = {};
let warroomMatchData = null;
let warroomAutoRefreshInterval = null;
let warroomCaptureEvents = [];
let warroomDebugMode = false;
let warroomDebugAdjustments = {}; // Store manual position adjustments
let warroomMapMeta = {}; // Store map metadata for debugging

// Debug function to expose map metadata
window.getWarRoomMapMeta = function(mapType) {
    mapType = mapType || warroomCurrentMapType;
    console.log('Map metadata for', mapType, ':', JSON.stringify(warroomMapMeta[mapType], null, 2));
    return warroomMapMeta[mapType];
};

// Initialize War Room Maps
async function initWarRoomMaps() {
    const canvas = document.getElementById('warroom-map-canvas');
    const loadBtn = document.querySelector('button[onclick="initWarRoomMaps()"]');

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
        console.log('War Room: Loading objectives metadata...');
        warroomObjectivesData = await window.GW2Data.getObjectivesMetadata();

        console.log('War Room: Loading match data...');
        warroomMatchData = await window.GW2Data.getMatchData(1020);

        // Organize objectives by map
        if (warroomMatchData) {
            warroomMapObjectives = {};
            warroomMatchData.maps.forEach(map => {
                warroomMapObjectives[map.type] = map;
            });
            console.log('War Room: Loaded match data for maps:', Object.keys(warroomMapObjectives));
        }

        // Render selector and first map
        renderWarRoomMapSelector();
        await renderWarRoomMap(warroomCurrentMapType);

        // Load capture events
        await refreshCaptureEvents();

        // Load polling config and start auto-refresh
        try {
            const response = await fetch('/api/polling-config');
            const data = await response.json();
            if (data.status === 'success') {
                startWarRoomAutoRefresh(data.config.maps_interval);
            } else {
                startWarRoomAutoRefresh();
            }
        } catch (error) {
            console.error('War Room: Failed to load polling config:', error);
            startWarRoomAutoRefresh();
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
        console.error('War Room: Error initializing maps:', error);
        if (canvas) {
            canvas.innerHTML = `<p style="text-align: center; color: #f44; padding: 50px;">Error loading maps: ${error.message}</p>`;
        }
        if (loadBtn) {
            loadBtn.innerHTML = '❌ Error - Retry';
            loadBtn.disabled = false;
        }
    }
}

// Render War Room map selector tabs
function renderWarRoomMapSelector() {
    const container = document.getElementById('warroom-map-selector');
    if (!container) return;

    let html = '';
    const maps = [
        { type: 'Center', icon: '🏰', name: 'Eternal Battlegrounds' },
        { type: 'RedHome', icon: '🔴', name: 'Red Borderlands' },
        { type: 'GreenHome', icon: '🟢', name: 'Green Borderlands' },
        { type: 'BlueHome', icon: '🔵', name: 'Blue Borderlands' }
    ];

    maps.forEach(map => {
        const active = map.type === warroomCurrentMapType ? 'active' : '';
        html += `<button class="map-tab ${active}" onclick="switchWarRoomMap('${map.type}')">`;
        html += `${map.icon} ${map.name}`;
        html += `</button>`;
    });

    container.innerHTML = html;
}

// Switch War Room map
function switchWarRoomMap(mapType) {
    warroomCurrentMapType = mapType;
    renderWarRoomMapSelector();
    renderWarRoomMap(mapType);
}

// Render War Room map
async function renderWarRoomMap(mapType) {
    const container = document.getElementById('warroom-map-canvas');
    if (!container || !warroomMapObjectives[mapType] || !warroomObjectivesData[mapType]) {
        container.innerHTML = '<p>Loading map data...</p>';
        return;
    }

    const MAP_CONFIG = {
        'Center': { width: 2048, height: 2048, name: 'Eternal Battlegrounds' },
        'RedHome': { width: 2048, height: 2048, name: 'Red Borderlands' },
        'GreenHome': { width: 2048, height: 2048, name: 'Green Borderlands' },
        'BlueHome': { width: 2048, height: 2048, name: 'Blue Borderlands' }
    };

    let config = MAP_CONFIG[mapType];
    const mapData = warroomMapObjectives[mapType];
    const objectives = warroomObjectivesData[mapType];

    // Get map metadata for proper coordinate transformation
    // Objectives use "continent coordinates", we need to transform to map pixel coordinates
    let mapMeta = null;
    let useProperTransform = false;

    try {
        // Get map ID from match data first (current week's actual map), fallback to objectives metadata
        let candidateMapId = mapData && mapData.id;

        if (!candidateMapId) {
            const firstObj = Object.values(objectives).find(o => o && (o.map_id || o.mapId));
            candidateMapId = firstObj ? (firstObj.map_id || firstObj.mapId) : null;
        }

        console.log(`War Room: Attempting to load map metadata for ${mapType}, map ID: ${candidateMapId}`);

        if (candidateMapId) {
            mapMeta = await window.GW2Data.getMapMeta(candidateMapId);
            if (mapMeta && mapMeta.continent_rect && mapMeta.map_rect) {
                useProperTransform = true;
                // Store for debug access
                warroomMapMeta[mapType] = mapMeta;

                // We'll adjust canvas size based on actual background image dimensions below
                console.log(`War Room: Map metadata loaded for ${mapType}`);
                console.log(`War Room: Using coordinate transformation for ${mapType}:`, {
                    mapId: candidateMapId,
                    continent_rect: mapMeta.continent_rect,
                    map_rect: mapMeta.map_rect,
                    continentMin: `[${mapMeta.continent_rect[0][0]}, ${mapMeta.continent_rect[0][1]}]`,
                    continentMax: `[${mapMeta.continent_rect[1][0]}, ${mapMeta.continent_rect[1][1]}]`,
                    mapMin: `[${mapMeta.map_rect[0][0]}, ${mapMeta.map_rect[0][1]}]`,
                    mapMax: `[${mapMeta.map_rect[1][0]}, ${mapMeta.map_rect[1][1]}]`
                });
            }
        }
    } catch (e) {
        console.warn('War Room: Failed to load map metadata, using fallback:', e);
    }

    // Fallback: calculate bounds from objectives if no map metadata
    let minX, minY, maxX, maxY, rangeX, rangeY;

    if (!useProperTransform) {
        const coords = Object.values(objectives)
            .filter(obj => obj && obj.coord && obj.coord.length >= 2)
            .map(obj => ({ x: obj.coord[0], y: obj.coord[1] }));

        if (coords.length === 0) {
            console.error('War Room: No valid objective coordinates found');
            container.innerHTML = '<p style="text-align: center; color: #f44; padding: 50px;">Error: No objective coordinates available</p>';
            return;
        }

        minX = Math.min(...coords.map(c => c.x));
        maxX = Math.max(...coords.map(c => c.x));
        minY = Math.min(...coords.map(c => c.y));
        maxY = Math.max(...coords.map(c => c.y));

        rangeX = maxX - minX;
        rangeY = maxY - minY;

        // Add 10% padding around edges for better visibility
        const paddingX = rangeX * 0.1;
        const paddingY = rangeY * 0.1;
        minX -= paddingX;
        maxX += paddingX;
        minY -= paddingY;
        maxY += paddingY;
        rangeX = maxX - minX;
        rangeY = maxY - minY;

        console.log(`War Room: Fallback coordinate bounds for ${mapType}:`, {
            minX, maxX, minY, maxY, rangeX, rangeY, numCoords: coords.length
        });

        // Protect against division by zero
        if (rangeX === 0) rangeX = 1;
        if (rangeY === 0) rangeY = 1;
    }

    // Check WebP support
    const SUPPORTS_WEBP = (() => {
        try {
            const c = document.createElement('canvas');
            if (!c.getContext) return false;
            return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        } catch (e) { return false; }
    })();

    const bgUrls = {
        'Center': {
            low: SUPPORTS_WEBP ? '/static/maps/eb_512.webp' : '/static/maps/eb_512.jpg',
            high: SUPPORTS_WEBP ? '/static/maps/eb_2048.webp' : '/static/maps/eb_2048.jpg'
        },
        'RedHome': {
            low: SUPPORTS_WEBP ? '/static/maps/red_bl_512.webp' : '/static/maps/red_bl_512.jpg',
            high: SUPPORTS_WEBP ? '/static/maps/red_bl_2048.webp' : '/static/maps/red_bl_2048.jpg'
        },
        'BlueHome': {
            low: SUPPORTS_WEBP ? '/static/maps/blue_bl_512.webp' : '/static/maps/blue_bl_512.jpg',
            high: SUPPORTS_WEBP ? '/static/maps/blue_bl_2048.webp' : '/static/maps/blue_bl_2048.jpg'
        },
        'GreenHome': {
            low: SUPPORTS_WEBP ? '/static/maps/green_bl_512.webp' : '/static/maps/green_bl_512.jpg',
            high: SUPPORTS_WEBP ? '/static/maps/green_bl_2048.webp' : '/static/maps/green_bl_2048.jpg'
        }
    };

    // Size canvas based on map_rect coordinate space for accurate objective positioning
    if (useProperTransform && mapMeta && mapMeta.map_rect) {
        const mapRect = mapMeta.map_rect;
        const mapWidth = mapRect[1][0] - mapRect[0][0];
        const mapHeight = mapRect[1][1] - mapRect[0][1];
        const aspectRatio = mapHeight / mapWidth;

        const targetWidth = 2048;
        config = {
            ...config,
            width: targetWidth,
            height: Math.round(targetWidth * aspectRatio)
        };

        console.log(`War Room: Canvas sized from map_rect for ${mapType}: ${config.width}x${config.height} (map_rect aspect: ${aspectRatio.toFixed(3)}:1)`);
    }

    // Create SVG map
    let html = `<svg class="wvw-map-svg" viewBox="0 0 ${config.width} ${config.height}">`;

    // Background image - use xMidYMid slice to fill canvas, cropping overflow
    if (bgUrls[mapType]) {
        html += `<image id="warroom-map-bg" x="0" y="0" href="${bgUrls[mapType].low}" width="${config.width}" height="${config.height}" preserveAspectRatio="xMidYMid slice" opacity="0.85"/>`;
    } else {
        html += `<rect width="${config.width}" height="${config.height}" fill="#1a1a1a" stroke="#333" stroke-width="2"/>`;
    }

    html += `<rect width="${config.width}" height="${config.height}" fill="#000" opacity="0.06"/>`;

    // Grid
    const showGrid = document.getElementById('warroom-toggle-grid') ? document.getElementById('warroom-toggle-grid').checked : true;
    if (showGrid) {
        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * config.width;
            const y = (i / 10) * config.height;
            html += `<line x1="${x}" y1="0" x2="${x}" y2="${config.height}" stroke="#fff" stroke-width="0.5" opacity="0.08"/>`;
            html += `<line x1="0" y1="${y}" x2="${config.width}" y2="${y}" stroke="#fff" stroke-width="0.5" opacity="0.08"/>`;
        }
    }

    // Render objectives
    let firstObjectiveLogged = false;
    mapData.objectives.forEach(matchObj => {
        const objMeta = objectives[matchObj.id];
        if (!objMeta || !objMeta.coord) {
            console.warn(`War Room: Missing metadata or coord for objective ${matchObj.id}`);
            return;
        }

        let x, y;

        if (useProperTransform) {
            // Transform using map_rect - background images use map coordinate space
            const mapRect = mapMeta.map_rect;
            const continentRect = mapMeta.continent_rect;

            const continentMinX = continentRect[0][0];
            const continentMinY = continentRect[0][1];
            const continentMaxX = continentRect[1][0];
            const continentMaxY = continentRect[1][1];

            const mapMinX = mapRect[0][0];
            const mapMinY = mapRect[0][1];
            const mapMaxX = mapRect[1][0];
            const mapMaxY = mapRect[1][1];

            // Convert continent coords to map coords using the mapping defined by both rects
            const continentNormX = (objMeta.coord[0] - continentMinX) / (continentMaxX - continentMinX);
            const continentNormY = (objMeta.coord[1] - continentMinY) / (continentMaxY - continentMinY);

            const mapX = mapMinX + continentNormX * (mapMaxX - mapMinX);
            const mapY = mapMinY + continentNormY * (mapMaxY - mapMinY);

            // Normalize map coords to 0-1 range for canvas
            const normalizedX = (mapX - mapMinX) / (mapMaxX - mapMinX);
            const normalizedY = (mapY - mapMinY) / (mapMaxY - mapMinY);

            // Scale to canvas size (don't flip Y - map coords already match SVG orientation)
            x = normalizedX * config.width;
            y = normalizedY * config.height;

            // Log first objective transformation for debugging
            if (!firstObjectiveLogged) {
                console.log(`War Room: Sample transformation for ${objMeta.name}:`);
                console.log(`  Continent coord: [${objMeta.coord[0]}, ${objMeta.coord[1]}]`);
                console.log(`  Map coord: [${mapX.toFixed(1)}, ${mapY.toFixed(1)}]`);
                console.log(`  Map bounds: [${mapMinX}, ${mapMinY}] to [${mapMaxX}, ${mapMaxY}]`);
                console.log(`  Normalized: [${normalizedX.toFixed(3)}, ${normalizedY.toFixed(3)}]`);
                console.log(`  Canvas coord: [${x.toFixed(1)}, ${y.toFixed(1)}] (size: ${config.width}x${config.height})`);
                firstObjectiveLogged = true;
            }
        } else {
            // Fallback: use calculated bounds from objectives
            x = ((objMeta.coord[0] - minX) / rangeX) * config.width;
            y = config.height - ((objMeta.coord[1] - minY) / rangeY) * config.height;
        }

        // Validate coordinates
        if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
            console.error(`War Room: Invalid coordinates for ${objMeta.name}:`, { x, y, coord: objMeta.coord });
            return;
        }

        const color = getOwnerColor(matchObj.owner);
        const size = getObjectiveSize(matchObj.type);
        const icon = getObjectiveIcon(matchObj.type);

        // Store original calculated position for debug mode
        const originalX = x;
        const originalY = y;

        // Apply debug adjustments if they exist
        if (warroomDebugAdjustments[matchObj.id]) {
            x = warroomDebugAdjustments[matchObj.id].newX;
            y = warroomDebugAdjustments[matchObj.id].newY;
        }

        const cursorStyle = warroomDebugMode ? 'move' : 'pointer';
        const escapedName = objMeta.name.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const dragHandlers = warroomDebugMode
            ? `onmousedown="startDragObjective(event, '${matchObj.id}', ${x}, ${y}, ${originalX}, ${originalY}, '${escapedName}')"` : '';

        html += `<g class="objective-marker" data-obj-id="${matchObj.id}"
                    data-obj-name="${escapedName}"
                    onmouseover="showWarRoomTooltip(event, '${matchObj.id}')"
                    onmouseout="hideWarRoomTooltip()"
                    ${dragHandlers}
                    style="cursor: ${cursorStyle};">`;

        if (matchObj.claimed_by) {
            html += `<circle cx="${x}" cy="${y}" r="${size + 3}" fill="${color}" opacity="0.3"/>`;
        }

        html += `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" stroke="#000" stroke-width="2"/>`;
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

    // Progressive background swap to high-res
    try {
        if (bgUrls[mapType]) {
            const img = new Image();
            img.onload = () => {
                console.log(`War Room: High-res background loaded for ${mapType}: ${bgUrls[mapType].high}`);
                const bg = container.querySelector('#warroom-map-bg');
                if (bg) {
                    bg.setAttribute('href', bgUrls[mapType].high);
                    console.log(`War Room: Background swapped to high-res, dimensions: ${img.width}x${img.height}`);
                }
            };
            img.onerror = () => {
                console.warn(`War Room: High-res failed for ${mapType}, trying fallback`);
                // Remote wiki fallback if local high-res missing
                const fallback = {
                    'Center': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Eternal_Battlegrounds_map.jpg?width=2048',
                    'RedHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Red_Desert_Borderlands_map.jpg?width=2048',
                    'BlueHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Blue_Alpine_Borderlands_map.jpg?width=2048',
                    'GreenHome': 'https://wiki.guildwars2.com/wiki/Special:FilePath/Green_Alpine_Borderlands_map.jpg?width=2048'
                };
                const bg = container.querySelector('#warroom-map-bg');
                if (bg && fallback[mapType]) {
                    bg.setAttribute('href', fallback[mapType]);
                    console.log(`War Room: Using wiki fallback for ${mapType}`);
                }
            };
            console.log(`War Room: Loading high-res background: ${bgUrls[mapType].high}`);
            img.src = bgUrls[mapType].high;
        }
    } catch (e) {
        console.warn('War Room: High-res swap failed:', e);
    }
}

// Show tooltip on hover
function showWarRoomTooltip(event, objectiveId) {
    const objMeta = warroomObjectivesData[warroomCurrentMapType]?.[objectiveId];
    const matchObj = warroomMapObjectives[warroomCurrentMapType]?.objectives.find(o => o.id === objectiveId);

    if (!objMeta || !matchObj) {
        console.warn(`War Room: Missing data for objective ${objectiveId}`);
        return;
    }

    const tooltip = document.getElementById('warroom-tooltip');
    if (!tooltip) return;

    let html = `<h5 style="color: ${getOwnerColor(matchObj.owner)}">${objMeta.name || 'Unknown'}</h5>`;
    html += `<p><strong>Type:</strong> ${matchObj.type || 'Unknown'}</p>`;
    html += `<p><strong>Owner:</strong> <span style="color: ${getOwnerColor(matchObj.owner)}">${matchObj.owner || 'Unknown'}</span></p>`;
    html += `<p><strong>PPT:</strong> ${matchObj.points_tick || 0}</p>`;

    if (matchObj.claimed_by && matchObj.guild_name) {
        html += `<p><strong>Guild:</strong> [${matchObj.guild_tag || '?'}] ${matchObj.guild_name}</p>`;
    }

    if (matchObj.yaks_delivered !== undefined && matchObj.yaks_delivered > 0) {
        html += `<p><strong>Yaks:</strong> ${matchObj.yaks_delivered}</p>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top = (event.pageY + 15) + 'px';
}

function hideWarRoomTooltip() {
    const tooltip = document.getElementById('warroom-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Refresh capture events
async function refreshCaptureEvents() {
    const feedContainer = document.getElementById('capture-events-feed');
    if (!feedContainer) return;

    try {
        feedContainer.innerHTML = '<p style="text-align: center; padding: 20px;"><span class="loading"></span> Loading capture events...</p>';

        const response = await fetch(`/api/wvw/activity/1020`);
        const data = await response.json();

        if (data.status !== 'success') {
            feedContainer.innerHTML = `<p style="text-align: center; color: #f44;">Failed to load events: ${data.message || 'Unknown error'}</p>`;
            return;
        }

        warroomCaptureEvents = data.recent_events || [];

        if (warroomCaptureEvents.length === 0) {
            feedContainer.innerHTML = '<p style="text-align: center; opacity: 0.6; padding: 40px;">No recent capture events in the last 24 hours.</p>';
            return;
        }

        // Create compact events list for side panel
        let html = '<div class="capture-events-list">';

        warroomCaptureEvents.forEach(event => {
            const timeAgo = formatTimeAgo(event.minutes_ago || 0);
            const mapName = getMapName(event.map) || 'Unknown Map';

            // Look up objective name and type from metadata
            let objName = event.objective_name || 'Unknown Objective';
            let objType = event.objective_type || 'Unknown';

            if (warroomObjectivesData && event.objective_id) {
                // Find the map type from event.map
                const mapType = event.map;
                if (warroomObjectivesData[mapType]) {
                    const objMeta = warroomObjectivesData[mapType][event.objective_id];
                    if (objMeta) {
                        objName = objMeta.name || objName;
                        objType = objMeta.type || objType;
                    }
                }
            }

            // Determine team color from objective owner
            let teamColor = '#888';
            let teamName = 'Unknown';

            if (warroomMatchData && warroomMatchData.maps) {
                for (const map of warroomMatchData.maps) {
                    const obj = map.objectives.find(o => o.id === event.objective_id);
                    if (obj) {
                        teamName = obj.owner || 'Unknown';
                        teamColor = getOwnerColor(obj.owner);
                        break;
                    }
                }
            }

            // Format guild info
            let guildInfo = '';
            if (event.guild_name) {
                guildInfo = `<div style="font-size: 0.85em; opacity: 0.8;">[${event.guild_tag || '?'}] ${event.guild_name}</div>`;
            }

            html += `<div class="capture-event-item">`;
            html += `<div class="event-header">`;
            html += `<span class="event-time">${timeAgo}</span>`;
            html += `<span class="event-team" style="color: ${teamColor}; font-weight: bold;">${teamName}</span>`;
            html += `</div>`;
            html += `<div class="event-objective">${objType}: <strong>${objName}</strong></div>`;
            html += `<div class="event-map">${mapName}</div>`;
            html += guildInfo;
            html += `</div>`;
        });

        html += '</div>';
        feedContainer.innerHTML = html;

    } catch (error) {
        console.error('War Room: Error loading capture events:', error);
        feedContainer.innerHTML = `<p style="text-align: center; color: #f44;">Error loading events: ${error.message}</p>`;
    }
}

// Format time ago
function formatTimeAgo(minutes) {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${Math.floor(minutes)}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m ago`;
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h ago`;
}

// Auto-refresh for War Room
function startWarRoomAutoRefresh(intervalSeconds = 30) {
    if (warroomAutoRefreshInterval) {
        clearInterval(warroomAutoRefreshInterval);
    }

    const intervalMs = intervalSeconds * 1000;

    warroomAutoRefreshInterval = setInterval(async () => {
        try {
            warroomMatchData = await window.GW2Data.getMatchData(1020, true);

            if (warroomMatchData) {
                warroomMapObjectives = {};
                warroomMatchData.maps.forEach(map => {
                    warroomMapObjectives[map.type] = map;
                });
            }

            await renderWarRoomMap(warroomCurrentMapType);
            await refreshCaptureEvents();
            console.log('War Room: Data refreshed');
        } catch (error) {
            console.error('War Room: Auto-refresh error:', error);
        }
    }, intervalMs);

    console.log(`War Room: Auto-refresh started with ${intervalSeconds}s interval`);
}

function stopWarRoomAutoRefresh() {
    if (warroomAutoRefreshInterval) {
        clearInterval(warroomAutoRefreshInterval);
        warroomAutoRefreshInterval = null;
        console.log('War Room: Auto-refresh stopped');
    }
}

// War Room Debug Mode - Drag functionality
let dragState = null;

function startDragObjective(event, objId, currentX, currentY, originalX, originalY, objName) {
    if (!warroomDebugMode) return;

    event.stopPropagation();

    const svg = event.target.closest('svg');
    const svgRect = svg.getBoundingClientRect();

    dragState = {
        objId,
        objName,
        originalX,
        originalY,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startObjX: currentX,
        startObjY: currentY,
        svg,
        svgRect
    };

    console.log(`War Room Debug: Started dragging ${objName}`);

    // Add event listeners
    document.addEventListener('mousemove', dragObjective);
    document.addEventListener('mouseup', stopDragObjective);
}

function dragObjective(event) {
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startMouseX;
    const deltaY = event.clientY - dragState.startMouseY;

    const newX = dragState.startObjX + deltaX;
    const newY = dragState.startObjY + deltaY;

    // Find the objective marker and update its position
    const marker = document.querySelector(`g.objective-marker[data-obj-id="${dragState.objId}"]`);
    if (marker) {
        const circles = marker.querySelectorAll('circle');
        const text = marker.querySelector('text');

        circles.forEach(circle => {
            circle.setAttribute('cx', newX);
            circle.setAttribute('cy', newY);
        });

        if (text) {
            text.setAttribute('x', newX);
            text.setAttribute('y', newY);
        }
    }
}

function stopDragObjective(event) {
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startMouseX;
    const deltaY = event.clientY - dragState.startMouseY;

    const newX = dragState.startObjX + deltaX;
    const newY = dragState.startObjY + deltaY;

    const offsetX = newX - dragState.originalX;
    const offsetY = newY - dragState.originalY;

    // Store the adjustment
    warroomDebugAdjustments[dragState.objId] = {
        name: dragState.objName,
        originalX: dragState.originalX,
        originalY: dragState.originalY,
        newX,
        newY,
        offsetX,
        offsetY
    };

    console.log(`War Room Debug: Adjusted ${dragState.objName} by [${offsetX.toFixed(1)}, ${offsetY.toFixed(1)}]`);

    // Clean up
    document.removeEventListener('mousemove', dragObjective);
    document.removeEventListener('mouseup', stopDragObjective);
    dragState = null;
}

// War Room Debug Mode
function toggleWarRoomDebugMode() {
    const checkbox = document.getElementById('warroom-debug-mode');
    const statsBtn = document.getElementById('show-debug-stats');

    warroomDebugMode = checkbox.checked;

    if (warroomDebugMode) {
        console.log('War Room: Debug mode ENABLED - objectives are draggable');
        statsBtn.style.display = 'inline-block';
        // Reset adjustments when entering debug mode
        warroomDebugAdjustments = {};
    } else {
        console.log('War Room: Debug mode DISABLED');
        statsBtn.style.display = 'none';
    }

    // Re-render map to apply debug mode
    renderWarRoomMap(warroomCurrentMapType);
}

function showDebugStats() {
    if (Object.keys(warroomDebugAdjustments).length === 0) {
        alert('No objectives have been repositioned yet.\n\nEnable Debug Mode and drag objectives to their correct positions on the map.');
        return;
    }

    // Calculate average offset
    let totalOffsetX = 0;
    let totalOffsetY = 0;
    let count = 0;

    let details = 'Objective Position Adjustments:\n\n';

    for (const [objId, adjustment] of Object.entries(warroomDebugAdjustments)) {
        details += `${adjustment.name}:\n`;
        details += `  Offset: X=${adjustment.offsetX.toFixed(1)}px, Y=${adjustment.offsetY.toFixed(1)}px\n`;
        details += `  Original: [${adjustment.originalX.toFixed(1)}, ${adjustment.originalY.toFixed(1)}]\n`;
        details += `  Corrected: [${adjustment.newX.toFixed(1)}, ${adjustment.newY.toFixed(1)}]\n\n`;

        totalOffsetX += adjustment.offsetX;
        totalOffsetY += adjustment.offsetY;
        count++;
    }

    const avgOffsetX = totalOffsetX / count;
    const avgOffsetY = totalOffsetY / count;

    details += `AVERAGE OFFSET:\n`;
    details += `  X: ${avgOffsetX.toFixed(1)}px\n`;
    details += `  Y: ${avgOffsetY.toFixed(1)}px\n\n`;
    details += `Total objectives adjusted: ${count}\n\n`;
    details += `Share these offset values to help fix the coordinate transformation!`;

    alert(details);
    console.log('War Room Debug Adjustments:', warroomDebugAdjustments);
    console.log('Average offset:', { x: avgOffsetX, y: avgOffsetY, count });
}

// ============================================================================
// TRADING POST ECONOMIC ANALYSIS
// ============================================================================

async function loadItemEconomics(itemId) {
    const section = document.getElementById('tp-economic-analysis');
    if (!section) return;

    try {
        // Show loading state
        section.style.display = 'block';
        section.innerHTML = '<p style="text-align: center; padding: 40px;"><span class="loading"></span> Loading market analysis...</p>';

        const response = await fetch(`/api/tp/economics/${itemId}`);
        const data = await response.json();

        if (data.status !== 'success') {
            section.innerHTML = `<p style="text-align: center; color: #f44;">Failed to load analysis: ${data.message || 'Unknown error'}</p>`;
            return;
        }

        const econ = data.data;

        // Rebuild the section structure
        section.innerHTML = `
            <h3>📊 Market Analysis</h3>
            <div class="economic-header">
                <div id="economic-item-info" class="economic-item-info"></div>
                <div id="economic-recommendation" class="economic-recommendation"></div>
            </div>
            <div class="economic-grid">
                <div class="economic-card">
                    <h4>💰 Price Information</h4>
                    <div id="economic-prices"></div>
                </div>
                <div class="economic-card">
                    <h4>📦 Supply & Demand</h4>
                    <div id="economic-supply-demand"></div>
                </div>
            </div>
            <div class="economic-chart-section">
                <h4>📈 Order Book Depth</h4>
                <canvas id="order-book-chart"></canvas>
                <div class="chart-legend" style="margin-top: 10px;">
                    <span class="legend-item"><span class="legend-dot" style="background: #27ae60;"></span> Buy Orders</span>
                    <span class="legend-item"><span class="legend-dot" style="background: #e74c3c;"></span> Sell Listings</span>
                </div>
            </div>
        `;

        // Populate item info
        const itemInfo = document.getElementById('economic-item-info');
        itemInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                ${econ.item.icon ? `<img src="${econ.item.icon}" alt="${econ.item.name}" style="width: 48px; height: 48px;" />` : ''}
                <div>
                    <h4 style="margin: 0; font-size: 1.3em;">${econ.item.name}</h4>
                    <p style="margin: 5px 0 0 0; opacity: 0.8;">${econ.item.rarity}</p>
                </div>
            </div>
        `;

        // Populate recommendation
        const recommendation = document.getElementById('economic-recommendation');
        const rec = econ.recommendation;
        recommendation.innerHTML = `
            <div class="recommendation-badge" style="background: ${rec.color};">
                <div class="recommendation-type">${rec.type}</div>
                <div class="recommendation-reasons">
                    ${rec.reasons.map(r => `<div>• ${r}</div>`).join('')}
                </div>
            </div>
        `;

        // Populate prices
        const prices = document.getElementById('economic-prices');
        prices.innerHTML = `
            <table class="economic-table">
                <tr>
                    <td><strong>Highest Buy Order:</strong></td>
                    <td style="color: #27ae60;">${econ.prices.highest_buy_formatted}</td>
                </tr>
                <tr>
                    <td><strong>Lowest Sell Listing:</strong></td>
                    <td style="color: #e74c3c;">${econ.prices.lowest_sell_formatted}</td>
                </tr>
                <tr>
                    <td><strong>Spread:</strong></td>
                    <td>${econ.prices.spread_formatted} (${econ.prices.spread_percent}%)</td>
                </tr>
            </table>
        `;

        // Populate supply/demand
        const supplyDemand = document.getElementById('economic-supply-demand');
        const ratio = econ.supply_demand.ratio;
        let ratioColor = '#d4af37';
        let ratioText = 'Balanced';
        if (ratio < 0.5) {
            ratioColor = '#27ae60';
            ratioText = 'High Demand';
        } else if (ratio > 2) {
            ratioColor = '#e74c3c';
            ratioText = 'High Supply';
        }

        supplyDemand.innerHTML = `
            <table class="economic-table">
                <tr>
                    <td><strong>Buy Orders:</strong></td>
                    <td>${econ.supply_demand.total_buy_orders.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>Sell Listings:</strong></td>
                    <td>${econ.supply_demand.total_sell_listings.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>S/D Ratio:</strong></td>
                    <td style="color: ${ratioColor};">${ratio} (${ratioText})</td>
                </tr>
                <tr>
                    <td><strong>Market Velocity:</strong></td>
                    <td>${Math.round(econ.supply_demand.velocity).toLocaleString()}</td>
                </tr>
            </table>
        `;

        // Render order book chart
        renderOrderBookChart(econ.order_book, econ.prices);

    } catch (error) {
        console.error('Error loading item economics:', error);
        section.innerHTML = `<p style="text-align: center; color: #f44;">Error loading analysis: ${error.message}</p>`;
    }
}

function renderOrderBookChart(orderBook, prices) {
    const canvas = document.getElementById('order-book-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 400;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const margin = { left: 80, right: 20, top: 40, bottom: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Prepare data
    const buys = orderBook.buys || [];
    const sells = orderBook.sells || [];

    if (buys.length === 0 && sells.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No order book data available', width / 2, height / 2);
        return;
    }

    // Calculate cumulative quantities for depth chart
    let buysCumulative = [];
    let sellsCumulative = [];
    let cumulativeBuy = 0;
    let cumulativeSell = 0;

    buys.forEach(order => {
        cumulativeBuy += order.quantity;
        buysCumulative.push({ price: order.price, quantity: cumulativeBuy });
    });

    sells.forEach(order => {
        cumulativeSell += order.quantity;
        sellsCumulative.push({ price: order.price, quantity: cumulativeSell });
    });

    // Find price range
    const allPrices = [...buys.map(o => o.price), ...sells.map(o => o.price)];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;

    // Find quantity range
    const maxQuantity = Math.max(
        buysCumulative.length > 0 ? buysCumulative[buysCumulative.length - 1].quantity : 0,
        sellsCumulative.length > 0 ? sellsCumulative[sellsCumulative.length - 1].quantity : 0
    );

    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Order Book Depth Chart', width / 2, 20);

    ctx.font = '12px Arial';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Price (copper)', width / 2, height - 10);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Cumulative Quantity', 0, 0);
    ctx.restore();

    // Helper function to convert price to x position
    function priceToX(price) {
        return margin.left + ((price - minPrice) / priceRange) * chartWidth;
    }

    // Helper function to convert quantity to y position
    function quantityToY(quantity) {
        return height - margin.bottom - (quantity / maxQuantity) * chartHeight;
    }

    // Draw buy orders (green, left side)
    if (buysCumulative.length > 0) {
        ctx.strokeStyle = '#27ae60';
        ctx.fillStyle = 'rgba(39, 174, 96, 0.1)';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(margin.left, height - margin.bottom);

        buysCumulative.forEach(point => {
            const x = priceToX(point.price);
            const y = quantityToY(point.quantity);
            ctx.lineTo(x, y);
        });

        ctx.lineTo(priceToX(buysCumulative[buysCumulative.length - 1].price), height - margin.bottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Draw sell orders (red, right side)
    if (sellsCumulative.length > 0) {
        ctx.strokeStyle = '#e74c3c';
        ctx.fillStyle = 'rgba(231, 76, 60, 0.1)';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(priceToX(sellsCumulative[0].price), height - margin.bottom);

        sellsCumulative.forEach(point => {
            const x = priceToX(point.price);
            const y = quantityToY(point.quantity);
            ctx.lineTo(x, y);
        });

        ctx.lineTo(width - margin.right, height - margin.bottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Draw price gridlines and labels
    const numPriceLines = 5;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#888';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    for (let i = 0; i <= numPriceLines; i++) {
        const price = minPrice + (priceRange / numPriceLines) * i;
        const x = priceToX(price);

        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, height - margin.bottom);
        ctx.stroke();

        const gold = Math.floor(price / 10000);
        const silver = Math.floor((price % 10000) / 100);
        const copper = price % 100;
        let label = '';
        if (gold > 0) label = `${gold}g ${silver}s`;
        else if (silver > 0) label = `${silver}s ${copper}c`;
        else label = `${copper}c`;

        ctx.fillText(label, x, height - margin.bottom + 15);
    }

    // Draw quantity gridlines and labels
    const numQuantityLines = 4;
    ctx.textAlign = 'right';

    for (let i = 0; i <= numQuantityLines; i++) {
        const quantity = (maxQuantity / numQuantityLines) * i;
        const y = quantityToY(quantity);

        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();

        ctx.fillStyle = '#888';
        ctx.fillText(Math.round(quantity).toLocaleString(), margin.left - 5, y + 4);
    }

    // Draw spread indicator
    if (prices.highest_buy && prices.lowest_sell) {
        const buyX = priceToX(prices.highest_buy);
        const sellX = priceToX(prices.lowest_sell);

        // Vertical lines
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        ctx.beginPath();
        ctx.moveTo(buyX, margin.top);
        ctx.lineTo(buyX, height - margin.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sellX, margin.top);
        ctx.lineTo(sellX, height - margin.bottom);
        ctx.stroke();

        ctx.setLineDash([]);

        // Spread label
        const midX = (buyX + sellX) / 2;
        ctx.fillStyle = '#d4af37';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Spread: ${prices.spread_percent}%`, midX, margin.top - 10);
    }
}
