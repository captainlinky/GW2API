// GW2 API Tool - JavaScript

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
            const data = await resp.json();
            // Expecting { maps: [{id, map_rect, continent_rect}] } or pass-through array
            const map = Array.isArray(data) ? data[0] : (data.maps ? data.maps[0] : data);
            if (map && map.map_rect) {
                this.mapsMeta[mapId] = { map_rect: map.map_rect, continent_rect: map.continent_rect };
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupTabs();
    checkApiStatus();
    // Initialize dashboard stats and auto-load match data (this will cache it)
    updateDashboardStats();
    updateTeamBars();
    updateActivityTimeline();
    updateKDRTimeline();
    // Refresh stats every 60 seconds
    setInterval(() => {
        updateDashboardStats();
        updateTeamBars();
        updateActivityTimeline();
        updateKDRTimeline();
    }, 60000);
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

async function updateActivityTimeline() {
    try {
        const response = await fetch('/api/wvw/activity/1020');
        const data = await response.json();
        
        if (data.status === 'success' && data.timeline) {
            console.log('Activity data received:', data.timeline.length, 'buckets');
            activityChartData = data; // Store for tooltip
            
            // Update legend with team names
            if (data.team_names) {
                document.getElementById('legend-red-team').textContent = data.team_names.red || 'Red Team';
                document.getElementById('legend-green-team').textContent = data.team_names.green || 'Green Team';
                document.getElementById('legend-blue-team').textContent = data.team_names.blue || 'Blue Team';
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
    
    timeline.forEach((bucket, index) => {
        // Show time label every hour
        if (timeLabels[index].minute === 0) {
            const x = padding.left + index * xStep;
            ctx.fillText(timeLabels[index].label, x, padding.top + chartHeight + 20);
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
    const time = new Date(now.getTime() - bucket.minutes_ago * 60000);
    const timeLabel = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    
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

async function updateKDRTimeline() {
    try {
        const response = await fetch('/api/wvw/kdr/1020');
        const data = await response.json();
        
        if (data.status === 'success' && data.timeline) {
            console.log('K/D data received:', data.timeline.length, 'buckets');
            kdrChartData = data;
            
            // Update legend with team names
            if (data.team_names) {
                document.getElementById('kdr-legend-red-team').textContent = data.team_names.red || 'Red Team';
                document.getElementById('kdr-legend-green-team').textContent = data.team_names.green || 'Green Team';
                document.getElementById('kdr-legend-blue-team').textContent = data.team_names.blue || 'Blue Team';
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
        
        // Draw points (circles) - only show first and last to keep it clean
        [points[0], points[points.length - 1]].forEach(point => {
            if (point && point.kdr > 0) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
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
    
    timeline.forEach((bucket, index) => {
        if (timeLabels[index].minute === 0) {
            const x = padding.left + index * xStep;
            ctx.fillText(timeLabels[index].label, x, padding.top + chartHeight + 20);
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
    const time = new Date(now.getTime() - bucket.minutes_ago * 60000);
    const timeLabel = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    
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
            badge.innerHTML = `✓ ${data.account_name}`;
            badge.style.background = 'rgba(76, 175, 80, 0.2)';
            badge.style.color = '#4caf50';
        } else {
            badge.innerHTML = '⚠ No API Key';
            badge.style.background = 'rgba(255, 152, 0, 0.2)';
            badge.style.color = '#ff9800';
        }
        
        updateKeyStatus();
    } catch (error) {
        console.error('Error checking API status:', error);
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
            html += '<table class="data-table"><thead><tr><th>Item</th><th>Buy Price</th><th>Sell Price</th><th>Spread</th><th>Supply</th><th>Demand</th></tr></thead><tbody>';
            
            data.data.forEach(item => {
                html += `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.buy_formatted}</td>
                        <td>${item.sell_formatted}</td>
                        <td>${item.spread.toLocaleString()}c</td>
                        <td>${item.sell_quantity.toLocaleString()}</td>
                        <td>${item.buy_quantity.toLocaleString()}</td>
                    </tr>
                `;
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

function quickQuery(ids) {
    switchTab('trading');
    setItemIds(ids);
    loadTradingPost();
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
