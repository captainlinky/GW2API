#!/usr/bin/env python3
"""
Web UI for Guild Wars 2 API Tool
A simple Flask-based interface for interacting with the GW2 API.
"""

import os
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from gw2api import GW2API, GW2Viewer
from wvw_tracker import WvWTracker
from dotenv import load_dotenv, set_key, find_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)
CORS(app)

# Initialize WvW tracker
wvw_tracker = WvWTracker()

# K/D History tracking
KDR_HISTORY_FILE = 'kdr_history.json'
kdr_history_lock = threading.Lock()

# Activity History tracking
ACTIVITY_HISTORY_FILE = 'activity_history.json'
activity_history_lock = threading.Lock()

def load_kdr_history():
    """Load K/D history from file."""
    try:
        if os.path.exists(KDR_HISTORY_FILE):
            with open(KDR_HISTORY_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading K/D history: {e}")
    return {}

def save_kdr_history(history):
    """Save K/D history to file."""
    try:
        with open(KDR_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving K/D history: {e}")

def load_activity_history():
    """Load activity history from file."""
    try:
        if os.path.exists(ACTIVITY_HISTORY_FILE):
            with open(ACTIVITY_HISTORY_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading activity history: {e}")
    return {}

def save_activity_history(history):
    """Save activity history to file."""
    try:
        with open(ACTIVITY_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving activity history: {e}")

def record_activity_snapshot(match_id, world_id):
    """
    Record an activity snapshot for the current match.
    
    Captures objective ownership counts and types for all three teams.
    Stores historical data with 7-day retention for trend analysis.
    
    Args:
        match_id: WvW match identifier (e.g., '1-2')
        world_id: World/server ID to track
        
    Stores:
        - Timestamp
        - Total objectives owned per team
        - Breakdown by type (Keep, Tower, Camp, Castle) per team
    """
    try:
        client = GW2API()
        match = client.get_wvw_match_by_world(int(world_id))
        
        if not match:
            return
        
        # Count objectives owned by each team
        team_objectives = {'red': 0, 'green': 0, 'blue': 0}
        team_types = {
            'red': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0},
            'green': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0},
            'blue': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0}
        }
        
        for map_data in match.get('maps', []):
            for objective in map_data.get('objectives', []):
                owner = objective.get('owner', '').lower()
                obj_type = objective.get('type', 'Unknown')
                
                if owner in team_objectives:
                    team_objectives[owner] += 1
                    if obj_type in team_types[owner]:
                        team_types[owner][obj_type] += 1
        
        snapshot = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'red_objectives': team_objectives['red'],
            'green_objectives': team_objectives['green'],
            'blue_objectives': team_objectives['blue'],
            'red_types': team_types['red'],
            'green_types': team_types['green'],
            'blue_types': team_types['blue']
        }
        
        with activity_history_lock:
            history = load_activity_history()
            
            if match_id not in history:
                history[match_id] = []
            
            # Add new snapshot
            history[match_id].append(snapshot)
            
            # Keep only last 7 days of data (full WvW matchup duration)
            cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat() + 'Z'
            history[match_id] = [s for s in history[match_id] if s['timestamp'] > cutoff]
            
            save_activity_history(history)
            print(f"[ACTIVITY] Recorded snapshot for match {match_id}: R={team_objectives['red']} G={team_objectives['green']} B={team_objectives['blue']} objectives")
    
    except Exception as e:
        print(f"[ACTIVITY] Error recording snapshot: {e}")

def record_kdr_snapshot(match_id, world_id):
    """
    Record a K/D ratio snapshot for the current match.
    
    Captures kill and death counts for all three teams and calculates ratios.
    Stores historical data with 7-day retention for trend analysis.
    
    Args:
        match_id: WvW match identifier (e.g., '1-2')
        world_id: World/server ID to track
        
    Stores:
        - Timestamp
        - Kills per team
        - Deaths per team
        - K/D ratios per team
    """
    try:
        client = GW2API()
        match = client.get_wvw_match_by_world(int(world_id))
        
        if not match:
            return
        
        # Get kills and deaths
        kills = match.get('kills', {})
        deaths = match.get('deaths', {})
        
        # Extract team data (handle both lowercase and capitalized keys)
        team_kills = {
            'red': kills.get('red', kills.get('Red', 0)),
            'green': kills.get('green', kills.get('Green', 0)),
            'blue': kills.get('blue', kills.get('Blue', 0))
        }
        
        team_deaths = {
            'red': max(deaths.get('red', deaths.get('Red', 1)), 1),
            'green': max(deaths.get('green', deaths.get('Green', 1)), 1),
            'blue': max(deaths.get('blue', deaths.get('Blue', 1)), 1)
        }
        
        # Calculate K/D ratios
        team_kdr = {
            'red': round(team_kills['red'] / team_deaths['red'], 2),
            'green': round(team_kills['green'] / team_deaths['green'], 2),
            'blue': round(team_kills['blue'] / team_deaths['blue'], 2)
        }
        
        snapshot = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'red_kdr': team_kdr['red'],
            'green_kdr': team_kdr['green'],
            'blue_kdr': team_kdr['blue'],
            'red_kills': team_kills['red'],
            'green_kills': team_kills['green'],
            'blue_kills': team_kills['blue'],
            'red_deaths': team_deaths['red'],
            'green_deaths': team_deaths['green'],
            'blue_deaths': team_deaths['blue']
        }
        
        with kdr_history_lock:
            history = load_kdr_history()
            
            if match_id not in history:
                history[match_id] = []
            
            # Add new snapshot
            history[match_id].append(snapshot)
            
            # Keep only last 7 days of data (full WvW matchup duration)
            cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat() + 'Z'
            history[match_id] = [s for s in history[match_id] if s['timestamp'] > cutoff]
            
            save_kdr_history(history)
            print(f"[KDR] Recorded snapshot for match {match_id}: R={team_kdr['red']} G={team_kdr['green']} B={team_kdr['blue']}")
    
    except Exception as e:
        print(f"[KDR] Error recording snapshot: {e}")

def update_guild_tracking(match, world_id):
    """
    Update guild tracking with current match data.
    
    Extracts guild claims from objectives and persists them.
    Uses WvWTracker for file-safe storage with locking.
    
    Args:
        match: Match data dictionary from API (enriched with guild info)
        world_id: World/server ID being tracked
    """
    try:
        # The wvw_tracker will handle guild extraction and updates
        wvw_tracker.update_match(match, world_id)
        print(f"[GUILDS] Updated guild tracking for match {match.get('id')}")
    except Exception as e:
        print(f"[GUILDS] Error updating guild tracking: {e}")

def kdr_tracking_loop():
    """
    Background thread that records WvW tracking data every 15 minutes.
    
    Collects three types of data:
    1. K/D ratios for trend analysis
    2. Objective ownership for capture activity
    3. Guild claims for guild tracking
    
    Runs continuously in the background with 15-minute intervals.
    Data is stored with 7-day retention matching matchup duration.
    """
    print("[TRACKING] Starting WvW tracking background thread (K/D + Activity + Guilds)")
    
    while True:
        try:
            # Track for world 1020 (Anvil Rock)
            # You can expand this to track multiple worlds
            client = GW2API()
            match = client.get_wvw_match_by_world(1020)
            
            if match and 'id' in match:
                match_id = match['id']
                
                # Record K/D and activity snapshots
                record_kdr_snapshot(match_id, 1020)
                record_activity_snapshot(match_id, 1020)
                
                # Update guild tracking (this will fetch enriched match data with guild info)
                # We need to get the enriched version, so make an internal request
                try:
                    import requests
                    enriched_response = requests.get('http://localhost:5555/api/wvw/match/1020', timeout=30)
                    if enriched_response.status_code == 200:
                        enriched_data = enriched_response.json()
                        if enriched_data.get('status') == 'success':
                            update_guild_tracking(enriched_data['data'], 1020)
                except Exception as e:
                    print(f"[TRACKING] Error fetching enriched match for guild tracking: {e}")
        
        except Exception as e:
            print(f"[TRACKING] Loop error: {e}")
        
        # Wait 15 minutes before next snapshot
        time.sleep(15 * 60)

# Start tracking thread
kdr_thread = threading.Thread(target=kdr_tracking_loop, daemon=True)
kdr_thread.start()


# Add cache control headers to prevent browser caching during development
@app.after_request
def add_header(response):
    """Add headers to prevent caching."""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response


# Helper functions
def get_current_api_key():
    """Get the current API key from environment."""
    return os.getenv('GW2_API_KEY', '')


def save_api_key(api_key):
    """Save API key to .env file."""
    env_file = find_dotenv()
    if not env_file:
        env_file = os.path.join(os.path.dirname(__file__), '.env')
    
    set_key(env_file, 'GW2_API_KEY', api_key)
    os.environ['GW2_API_KEY'] = api_key


def format_response(data, format_type='json'):
    """Format data according to specified type."""
    if format_type == 'json':
        return json.dumps(data, indent=2, ensure_ascii=False)
    elif format_type == 'table':
        return GW2Viewer.format_table(data)
    elif format_type == 'summary':
        return GW2Viewer.format_summary(data)
    elif format_type == 'compact':
        return GW2Viewer.format_compact(data)
    else:
        return str(data)


# Routes
@app.route('/')
def index():
    """Main dashboard."""
    return render_template('index.html')


@app.route('/api/status')
def api_status():
    """Check API status and key validity."""
    api_key = get_current_api_key()
    
    if not api_key:
        return jsonify({
            'status': 'error',
            'message': 'No API key configured',
            'has_key': False
        })
    
    try:
        client = GW2API(api_key)
        account = client.get_account()
        return jsonify({
            'status': 'success',
            'has_key': True,
            'account_name': account.get('name'),
            'world': account.get('world'),
            'access': account.get('access', [])
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'has_key': True
        })


@app.route('/api/key', methods=['GET', 'POST', 'DELETE'])
def api_key_management():
    """Manage API key."""
    if request.method == 'GET':
        api_key = get_current_api_key()
        # Return masked key for security
        masked = api_key[:8] + '...' + api_key[-8:] if len(api_key) > 16 else '***'
        return jsonify({
            'has_key': bool(api_key),
            'masked_key': masked if api_key else None
        })
    
    elif request.method == 'POST':
        data = request.get_json()
        new_key = data.get('api_key', '').strip()
        
        if not new_key:
            return jsonify({
                'status': 'error',
                'message': 'API key cannot be empty'
            }), 400
        
        # Test the key
        try:
            client = GW2API(new_key)
            account = client.get_account()
            
            # Key is valid, save it
            save_api_key(new_key)
            
            return jsonify({
                'status': 'success',
                'message': 'API key saved successfully',
                'account_name': account.get('name')
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': f'Invalid API key: {str(e)}'
            }), 400
    
    elif request.method == 'DELETE':
        # Delete the API key from .env
        env_file = find_dotenv()
        if env_file and os.path.exists(env_file):
            # Read the file and remove the API key line
            with open(env_file, 'r') as f:
                lines = f.readlines()
            
            with open(env_file, 'w') as f:
                for line in lines:
                    if not line.startswith('GW2_API_KEY='):
                        f.write(line)
            
            # Clear from environment
            os.environ.pop('GW2_API_KEY', None)
            
            return jsonify({
                'status': 'success',
                'message': 'API key deleted successfully'
            })
        else:
            return jsonify({
                'status': 'success',
                'message': 'No API key found to delete'
            })


@app.route('/api/account')
def get_account():
    """Get account information."""
    try:
        client = GW2API()
        account = client.get_account()
        
        # Enrich with additional calculations
        account['age_hours'] = account['age'] // 3600
        account['age_days'] = account['age'] // 86400
        
        return jsonify({
            'status': 'success',
            'data': account
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/characters')
def get_characters():
    """Get characters list."""
    try:
        client = GW2API()
        characters = client.get_characters()
        return jsonify({
            'status': 'success',
            'data': characters
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/character/<name>')
def get_character(name):
    """Get detailed character information."""
    try:
        client = GW2API()
        character = client.get_character(name)
        
        # Add calculated fields
        character['age_hours'] = character['age'] // 3600
        
        return jsonify({
            'status': 'success',
            'data': character
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wallet')
def get_wallet():
    """Get account wallet."""
    try:
        client = GW2API()
        wallet = client.get_account_wallet()
        currencies = client.get_currencies()
        
        # Create currency map
        currency_map = {c['id']: c for c in currencies}
        
        # Enrich wallet data
        enriched = []
        for item in wallet:
            curr_info = currency_map.get(item['id'], {})
            enriched_item = {
                'id': item['id'],
                'value': item['value'],
                'name': curr_info.get('name', f'Unknown ({item["id"]})'),
                'description': curr_info.get('description', ''),
                'icon': curr_info.get('icon', '')
            }
            
            # Format gold specially
            if item['id'] == 1:
                gold = item['value'] // 10000
                silver = (item['value'] % 10000) // 100
                copper = item['value'] % 100
                enriched_item['formatted'] = f"{gold:,}g {silver}s {copper}c"
            else:
                enriched_item['formatted'] = f"{item['value']:,}"
            
            enriched.append(enriched_item)
        
        return jsonify({
            'status': 'success',
            'data': enriched
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/bank')
def get_bank():
    """Get bank contents."""
    try:
        client = GW2API()
        bank = client.get_account_bank()
        
        # Filter out empty slots
        items = [item for item in bank if item is not None]
        
        return jsonify({
            'status': 'success',
            'data': items,
            'total_slots': len(bank),
            'filled_slots': len(items)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/materials')
def get_materials():
    """Get material storage."""
    try:
        client = GW2API()
        materials = client.get_account_materials()
        
        # Filter and sort
        non_zero = [m for m in materials if m.get('count', 0) > 0]
        non_zero.sort(key=lambda x: x['count'], reverse=True)
        
        return jsonify({
            'status': 'success',
            'data': non_zero,
            'total_types': len(non_zero)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/tp/prices')
def get_tp_prices():
    """Get trading post prices."""
    item_ids = request.args.get('ids', '')
    
    if not item_ids:
        return jsonify({
            'status': 'error',
            'message': 'No item IDs provided'
        }), 400
    
    try:
        ids = [int(x.strip()) for x in item_ids.split(',')]
        client = GW2API()
        
        prices = client.get_tp_prices(ids)
        items = client.get_items(ids)
        
        # Create item name map
        item_map = {item['id']: item for item in items}
        
        # Enrich price data
        enriched = []
        for price in prices:
            item_id = price['id']
            item_info = item_map.get(item_id, {})
            
            buy_price = price['buys']['unit_price']
            sell_price = price['sells']['unit_price']
            
            enriched.append({
                'id': item_id,
                'name': item_info.get('name', f'Item {item_id}'),
                'icon': item_info.get('icon', ''),
                'rarity': item_info.get('rarity', 'Unknown'),
                'buy_price': buy_price,
                'sell_price': sell_price,
                'buy_quantity': price['buys']['quantity'],
                'sell_quantity': price['sells']['quantity'],
                'spread': sell_price - buy_price,
                'buy_formatted': format_currency(buy_price),
                'sell_formatted': format_currency(sell_price)
            })
        
        return jsonify({
            'status': 'success',
            'data': enriched
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/items')
def get_items():
    """Get item information."""
    item_ids = request.args.get('ids', '')
    
    if not item_ids:
        return jsonify({
            'status': 'error',
            'message': 'No item IDs provided'
        }), 400
    
    try:
        ids = [int(x.strip()) for x in item_ids.split(',')]
        client = GW2API()
        items = client.get_items(ids)
        
        return jsonify({
            'status': 'success',
            'data': items
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/query', methods=['POST'])
def custom_query():
    """Execute a custom API query."""
    data = request.get_json()
    endpoint = data.get('endpoint', '')
    params = data.get('params', {})
    
    if not endpoint:
        return jsonify({
            'status': 'error',
            'message': 'No endpoint provided'
        }), 400
    
    try:
        client = GW2API()
        result = client.get(endpoint, params if params else None)
        
        return jsonify({
            'status': 'success',
            'data': result
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/matches')
def get_wvw_matches():
    """Get all current WvW matches with detailed information."""
    try:
        client = GW2API()
        
        # Get all matches
        matches = client.get_wvw_matches()
        
        # Get all worlds for name lookup
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}
        
        # Collect all guild IDs from all matches
        guild_ids = set()
        for match in matches:
            for map_data in match.get('maps', []):
                for obj in map_data.get('objectives', []):
                    if obj.get('claimed_by'):
                        guild_ids.add(obj['claimed_by'])
        
        # Fetch guild information for all guilds (limit to prevent too many requests)
        guild_map = {}
        if guild_ids:
            # Limit to first 50 guilds to avoid excessive API calls
            limited_guild_ids = list(guild_ids)[:50]
            try:
                print(f"Fetching {len(limited_guild_ids)} guilds (public info)...")
                guilds = client.get_guilds(limited_guild_ids, public_only=True)
                guild_map = {g['id']: g for g in guilds}
                print(f"Successfully fetched {len(guild_map)} guilds")
            except Exception as e:
                print(f"Warning: Could not fetch guild data: {e}")
        
        # Enrich match data
        enriched_matches = []
        for match in matches:
            enriched_match = {
                'id': match['id'],
                'start_time': match.get('start_time'),
                'end_time': match.get('end_time'),
                'worlds': {},
                'all_worlds': match.get('all_worlds', {}),
                'deaths': match.get('deaths', {}),
                'kills': match.get('kills', {}),
                'victory_points': match.get('victory_points', {}),
                'skirmishes': match.get('skirmishes', []),
                'maps': []
            }
            
            # Process each team (red, blue, green)
            for color in ['red', 'blue', 'green']:
                if color in match.get('all_worlds', {}):
                    world_ids = match['all_worlds'][color]
                    main_world = match['worlds'][color]
                    
                    # Use the main world name as display name
                    # The relink IDs (11xxx) don't have stable mappings in the API
                    display_name = world_map.get(main_world, f'World {main_world}')
                    
                    enriched_match['worlds'][color] = {
                        'main_world_id': main_world,
                        'main_world_name': world_map.get(main_world, f'World {main_world}'),
                        'display_name': display_name,
                        'display_world_id': main_world,
                        'linked_worlds': [
                            {
                                'id': wid,
                                'name': world_map.get(wid, f'World {wid}')
                            }
                            for wid in world_ids if wid != main_world
                        ],
                        'all_world_ids': world_ids
                    }
            
            # Process maps
            for map_data in match.get('maps', []):
                map_info = {
                    'id': map_data['id'],
                    'type': map_data['type'],
                    'scores': map_data.get('scores', {}),
                    'bonuses': map_data.get('bonuses', []),
                    'objectives': []
                }
                
                # Get objectives for this map
                for obj in map_data.get('objectives', []):
                    obj_info = {
                        'id': obj['id'],
                        'type': obj.get('type', 'Unknown'),
                        'owner': obj.get('owner', 'Neutral'),
                        'claimed_by': obj.get('claimed_by'),
                        'claimed_at': obj.get('claimed_at'),
                        'points_tick': obj.get('points_tick', 0),
                        'points_capture': obj.get('points_capture', 0),
                        'yaks_delivered': obj.get('yaks_delivered', 0)
                    }
                    
                    # Add guild information if available
                    if obj.get('claimed_by') and obj['claimed_by'] in guild_map:
                        guild = guild_map[obj['claimed_by']]
                        obj_info['guild_name'] = guild.get('name', 'Unknown Guild')
                        obj_info['guild_tag'] = guild.get('tag', '')
                    
                    map_info['objectives'].append(obj_info)
                
                enriched_match['maps'].append(map_info)
            
            enriched_matches.append(enriched_match)
        
        # Track guilds for each match
        for enriched_match in enriched_matches:
            wvw_tracker.update_match(enriched_match)
        
        return jsonify({
            'status': 'success',
            'data': enriched_matches
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/match/<world_id>')
def get_wvw_match_for_world(world_id):
    """Get WvW match information for a specific world."""
    import time
    start_time = time.time()
    
    try:
        print(f"\n[PERF] Starting /api/wvw/match/{world_id}")
        client = GW2API()
        
        # Fetch match
        match_start = time.time()
        try:
            match = client.get_wvw_match_by_world(int(world_id))
        except Exception as primary_err:
            # Fallback: fetch all matches and find the one containing this world id
            try:
                all_matches = client.get_wvw_matches()
                match = None
                for m in all_matches:
                    for color in ['red','green','blue']:
                        if color in m.get('all_worlds', {}):
                            if int(world_id) in m['all_worlds'][color]:
                                match = m
                                break
                    if match:
                        break
                if not match:
                    raise primary_err
            except Exception:
                # Re-raise the original error if fallback also fails
                raise primary_err
        match_elapsed = time.time() - match_start
        print(f"[PERF] Match fetch: {match_elapsed:.2f}s")
        
        # Get world names (cached)
        worlds_start = time.time()
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}
        worlds_elapsed = time.time() - worlds_start
        print(f"[PERF] Worlds fetch: {worlds_elapsed:.2f}s")
        
        # Collect guild IDs from this match
        guild_ids = set()
        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                if obj.get('claimed_by'):
                    guild_ids.add(obj['claimed_by'])
        
        # Fetch guild information in parallel (limit to prevent excessive requests)
        guild_map = {}
        if guild_ids:
            limited_guild_ids = list(guild_ids)[:30]  # Limit for single match
            guilds_start = time.time()
            try:
                print(f"Fetching {len(limited_guild_ids)} guilds for world {world_id} (public info)...")
                guilds = client.get_guilds(limited_guild_ids, public_only=True, max_workers=10)
                guild_map = {g['id']: g for g in guilds}
                guilds_elapsed = time.time() - guilds_start
                print(f"[PERF] Guilds fetch: {guilds_elapsed:.2f}s (fetched {len(guild_map)})")
            except Exception as e:
                guilds_elapsed = time.time() - guilds_start
                print(f"[PERF] Guilds ERROR after {guilds_elapsed:.2f}s: {e}")
        
        # Enrich the match data
        enriched = {
            'id': match['id'],
            'start_time': match.get('start_time'),
            'end_time': match.get('end_time'),
            'worlds': {},
            'scores': match.get('scores', {}),
            'deaths': match.get('deaths', {}),
            'kills': match.get('kills', {}),
            'victory_points': match.get('victory_points', {}),
            'maps': []
        }
        
        # Process teams
        for color in ['red', 'blue', 'green']:
            if color in match.get('all_worlds', {}):
                world_ids = match['all_worlds'][color]
                main_world = match['worlds'][color]
                
                # Use the main world name as display name
                display_name = world_map.get(main_world, f'World {main_world}')
                
                enriched['worlds'][color] = {
                    'main_world_id': main_world,
                    'main_world_name': world_map.get(main_world, f'World {main_world}'),
                    'display_name': display_name,
                    'display_world_id': main_world,
                    'linked_worlds': [
                        {
                            'id': wid,
                            'name': world_map.get(wid, f'World {wid}')
                        }
                        for wid in world_ids if wid != main_world
                    ],
                    'all_world_ids': world_ids
                }
        
        # Process maps with guild information
        for map_data in match.get('maps', []):
            map_info = {
                'id': map_data['id'],
                'type': map_data['type'],
                'scores': map_data.get('scores', {}),
                'bonuses': map_data.get('bonuses', []),
                'objectives': []
            }
            
            for obj in map_data.get('objectives', []):
                obj_info = {
                    'id': obj['id'],
                    'type': obj.get('type', 'Unknown'),
                    'owner': obj.get('owner', 'Neutral'),
                    'claimed_by': obj.get('claimed_by'),
                    'claimed_at': obj.get('claimed_at'),
                    'points_tick': obj.get('points_tick', 0),
                    'points_capture': obj.get('points_capture', 0),
                    'yaks_delivered': obj.get('yaks_delivered', 0)
                }
                
                # Add guild information if available
                if obj.get('claimed_by') and obj['claimed_by'] in guild_map:
                    guild = guild_map[obj['claimed_by']]
                    obj_info['guild_name'] = guild.get('name', 'Unknown Guild')
                    obj_info['guild_tag'] = guild.get('tag', '')
                
                map_info['objectives'].append(obj_info)
            
            enriched['maps'].append(map_info)
        
        # Track this match
        wvw_tracker.update_match(enriched, world_id=int(world_id))
        
        total_elapsed = time.time() - start_time
        print(f"[PERF] TOTAL /api/wvw/match/{world_id}: {total_elapsed:.2f}s\n")
        
        return jsonify({
            'status': 'success',
            'data': enriched
        })
    except Exception as e:
        total_elapsed = time.time() - start_time
        print(f"[PERF] ERROR /api/wvw/match/{world_id} after {total_elapsed:.2f}s: {e}\n")
        return jsonify({
            'status': 'error',
            'message': f"Failed to load WvW match for world {world_id}: {e}"
        }), 400


@app.route('/api/wvw/objectives')
def get_wvw_objectives_info():
    """Get information about WvW objectives."""
    try:
        client = GW2API()
        objectives = client.get_wvw_objectives()
        
        return jsonify({
            'status': 'success',
            'data': objectives
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/tracked-guilds/<match_id>')
def get_tracked_guilds(match_id):
    """Get all tracked guilds for a match, organized by team."""
    try:
        guilds_by_team = wvw_tracker.get_all_guilds_sorted(match_id)
        match_summary = wvw_tracker.get_match_summary(match_id)
        
        return jsonify({
            'status': 'success',
            'match_info': {
                'match_id': match_id,
                'start_time': match_summary.get('start_time'),
                'end_time': match_summary.get('end_time'),
                'first_seen': match_summary.get('first_seen'),
                'last_updated': match_summary.get('last_updated'),
                'teams': {
                    color: {
                        'main_world': match_summary['teams'][color].get('main_world'),
                        'main_world_id': match_summary['teams'][color].get('main_world_id'),
                        'display_name': match_summary['teams'][color].get('display_name'),
                        'linked_worlds': match_summary['teams'][color].get('linked_worlds', [])
                    }
                    for color in ['red', 'green', 'blue']
                }
            },
            'guilds': guilds_by_team
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] tracked-guilds endpoint failed for match {match_id}: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/active-matches')
def get_active_tracked_matches():
    """Get list of currently tracked matches with current status."""
    try:
        matches = wvw_tracker.get_active_matches()
        current_match_id = wvw_tracker.get_current_match_id()
        
        summaries = {}
        for match_id in matches:
            summary = wvw_tracker.get_match_summary(match_id)
            summary['is_current'] = (match_id == current_match_id)
            summaries[match_id] = summary
        
        return jsonify({
            'status': 'success',
            'matches': summaries,
            'current_match_id': current_match_id
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/activity/<world_id>')
def get_wvw_activity(world_id):
    """Get WvW activity timeline for a specific world's match."""
    try:
        # Get enriched match data from our own endpoint
        import requests
        match_response = requests.get(f'http://localhost:5555/api/wvw/match/{world_id}', timeout=10)
        match_result = match_response.json()
        
        if match_result['status'] != 'success':
            return jsonify({
                'status': 'error',
                'message': 'Failed to get match data'
            }), 404
        
        match = match_result['data']
        match_id = match.get('id')
        
        # Get current objective counts for fallback
        current_objectives = {'red': 0, 'green': 0, 'blue': 0}
        current_types = {
            'red': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0},
            'green': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0},
            'blue': {'Keep': 0, 'Tower': 0, 'Camp': 0, 'Castle': 0}
        }
        
        for map_data in match.get('maps', []):
            for objective in map_data.get('objectives', []):
                owner = objective.get('owner', '').lower()
                obj_type = objective.get('type', 'Unknown')
                
                if owner in current_objectives:
                    current_objectives[owner] += 1
                    if obj_type in current_types[owner]:
                        current_types[owner][obj_type] += 1
        
        # Collect all capture events from objectives (for recent_events)
        events = []
        current_time = datetime.utcnow()
        
        for map_data in match.get('maps', []):
            map_type = map_data.get('type', 'Unknown')
            
            for obj in map_data.get('objectives', []):
                owner = obj.get('owner', 'Neutral')
                claimed_at = obj.get('claimed_at')
                obj_type = obj.get('type', 'Unknown')
                obj_id = obj.get('id', 'unknown')
                
                if claimed_at and owner != 'Neutral':
                    # Parse the claimed_at timestamp
                    try:
                        claimed_time = datetime.fromisoformat(claimed_at.replace('Z', '+00:00'))
                        if claimed_time.tzinfo:
                            claimed_time = claimed_time.replace(tzinfo=None)
                        
                        # Calculate how long ago this was captured
                        time_since_capture = (current_time - claimed_time).total_seconds() / 60  # minutes
                        
                        events.append({
                            'timestamp': claimed_at,
                            'team': owner,
                            'map': map_type,
                            'objective_type': obj_type,
                            'objective_id': obj_id,
                            'minutes_ago': round(time_since_capture, 1),
                            'current_owner': True
                        })
                    except (ValueError, AttributeError) as e:
                        print(f"Error parsing timestamp {claimed_at}: {e}")
                        continue
        
        # Sort events by timestamp (most recent first)
        events.sort(key=lambda x: x['timestamp'], reverse=True)
        
        # Limit to recent events (last 24 hours or 100 events)
        recent_events = [e for e in events if e['minutes_ago'] <= 1440][:100]
        
        # Load historical activity data
        with activity_history_lock:
            history = load_activity_history()
            historical_snapshots = history.get(match_id, [])
        
        # Generate timeline buckets using historical data
        bucket_size = 15  # minutes
        num_buckets = 24  # 6 hours
        now = datetime.utcnow()
        
        timeline_buckets = []
        
        for i in range(num_buckets):
            bucket_index = num_buckets - i - 1
            bucket_start_time = now - timedelta(minutes=bucket_index * bucket_size)
            bucket_end_time = now - timedelta(minutes=(bucket_index - 1) * bucket_size if bucket_index > 0 else 0)
            
            # Find snapshots that fall within this bucket
            bucket_snapshots = []
            for snapshot in historical_snapshots:
                snapshot_time = datetime.fromisoformat(snapshot['timestamp'].replace('Z', ''))
                if bucket_start_time <= snapshot_time < bucket_end_time:
                    bucket_snapshots.append(snapshot)
            
            # Use the most recent snapshot in the bucket, or current data if none exists
            if bucket_snapshots:
                # Use the latest snapshot in this bucket
                latest_snapshot = max(bucket_snapshots, key=lambda s: s['timestamp'])
                bucket_data = {
                    'time_label': f"{bucket_index * bucket_size // 60}h {bucket_index * bucket_size % 60}m ago",
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red': latest_snapshot['red_objectives'],
                    'green': latest_snapshot['green_objectives'],
                    'blue': latest_snapshot['blue_objectives'],
                    'red_types': latest_snapshot['red_types'],
                    'green_types': latest_snapshot['green_types'],
                    'blue_types': latest_snapshot['blue_types'],
                    'total': latest_snapshot['red_objectives'] + latest_snapshot['green_objectives'] + latest_snapshot['blue_objectives']
                }
            else:
                # No historical data for this bucket, use current snapshot
                bucket_data = {
                    'time_label': f"{bucket_index * bucket_size // 60}h {bucket_index * bucket_size % 60}m ago",
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red': current_objectives['red'],
                    'green': current_objectives['green'],
                    'blue': current_objectives['blue'],
                    'red_types': current_types['red'],
                    'green_types': current_types['green'],
                    'blue_types': current_types['blue'],
                    'total': current_objectives['red'] + current_objectives['green'] + current_objectives['blue']
                }
            
            timeline_buckets.append(bucket_data)
        
        # Get team names from enriched match data
        team_names = {
            'red': 'Red Team',
            'green': 'Green Team', 
            'blue': 'Blue Team'
        }
        
        # Extract team display names from match worlds
        if 'worlds' in match:
            for color in ['red', 'green', 'blue']:
                if color in match['worlds']:
                    world_data = match['worlds'][color]
                    if isinstance(world_data, dict):
                        team_names[color] = world_data.get('display_name') or world_data.get('main_world_name') or team_names[color]
        
        return jsonify({
            'status': 'success',
            'match_id': match_id,
            'recent_events': recent_events,
            'timeline': timeline_buckets,
            'team_names': team_names,
            'total_captures': len(events),
            'snapshots_available': len(historical_snapshots)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@app.route('/api/wvw/kdr/<world_id>')
def get_wvw_kdr(world_id):
    """Get WvW K/D ratio trends for a specific world's match."""
    try:
        # Get enriched match data from our own endpoint
        import requests
        match_response = requests.get(f'http://localhost:5555/api/wvw/match/{world_id}', timeout=10)
        match_result = match_response.json()
        
        if match_result['status'] != 'success':
            return jsonify({
                'status': 'error',
                'message': 'Failed to get match data'
            }), 404
        
        match = match_result['data']
        match_id = match.get('id')
        
        # Get current K/D for each team
        kills_data = match.get('kills', {})
        deaths_data = match.get('deaths', {})
        
        current_kills = {
            'red': kills_data.get('red', kills_data.get('Red', 0)),
            'green': kills_data.get('green', kills_data.get('Green', 0)),
            'blue': kills_data.get('blue', kills_data.get('Blue', 0))
        }
        
        current_deaths = {
            'red': max(deaths_data.get('red', deaths_data.get('Red', 1)), 1),  # Avoid division by zero
            'green': max(deaths_data.get('green', deaths_data.get('Green', 1)), 1),
            'blue': max(deaths_data.get('blue', deaths_data.get('Blue', 1)), 1)
        }
        
        # Calculate K/D ratios
        current_kdr = {
            'red': round(current_kills['red'] / max(current_deaths['red'], 1), 2),
            'green': round(current_kills['green'] / max(current_deaths['green'], 1), 2),
            'blue': round(current_kills['blue'] / max(current_deaths['blue'], 1), 2)
        }
        
        # Load historical data
        with kdr_history_lock:
            history = load_kdr_history()
            historical_snapshots = history.get(match_id, [])
        
        # Generate timeline buckets
        bucket_size = 15  # minutes
        num_buckets = 24  # 6 hours
        now = datetime.utcnow()
        
        timeline_buckets = []
        
        for i in range(num_buckets):
            bucket_index = num_buckets - i - 1
            bucket_start_time = now - timedelta(minutes=bucket_index * bucket_size)
            bucket_end_time = now - timedelta(minutes=(bucket_index - 1) * bucket_size if bucket_index > 0 else 0)
            
            # Find snapshots that fall within this bucket
            bucket_snapshots = []
            for snapshot in historical_snapshots:
                snapshot_time = datetime.fromisoformat(snapshot['timestamp'].replace('Z', ''))
                if bucket_start_time <= snapshot_time < bucket_end_time:
                    bucket_snapshots.append(snapshot)
            
            # Use the most recent snapshot in the bucket, or current data if none exists
            if bucket_snapshots:
                # Use the latest snapshot in this bucket
                latest_snapshot = max(bucket_snapshots, key=lambda s: s['timestamp'])
                bucket_data = {
                    'timestamp': latest_snapshot['timestamp'],
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red_kdr': latest_snapshot['red_kdr'],
                    'green_kdr': latest_snapshot['green_kdr'],
                    'blue_kdr': latest_snapshot['blue_kdr'],
                    'red_kills': latest_snapshot['red_kills'],
                    'green_kills': latest_snapshot['green_kills'],
                    'blue_kills': latest_snapshot['blue_kills'],
                    'red_deaths': latest_snapshot['red_deaths'],
                    'green_deaths': latest_snapshot['green_deaths'],
                    'blue_deaths': latest_snapshot['blue_deaths']
                }
            else:
                # No historical data for this bucket, use current snapshot
                bucket_data = {
                    'timestamp': bucket_end_time.isoformat() + 'Z',
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red_kdr': current_kdr['red'],
                    'green_kdr': current_kdr['green'],
                    'blue_kdr': current_kdr['blue'],
                    'red_kills': current_kills['red'],
                    'green_kills': current_kills['green'],
                    'blue_kills': current_kills['blue'],
                    'red_deaths': current_deaths['red'],
                    'green_deaths': current_deaths['green'],
                    'blue_deaths': current_deaths['blue']
                }
            
            timeline_buckets.append(bucket_data)
        
        # Get team names from enriched match data
        team_names = {
            'red': 'Red Team',
            'green': 'Green Team', 
            'blue': 'Blue Team'
        }
        
        if 'worlds' in match:
            for color in ['red', 'green', 'blue']:
                if color in match['worlds']:
                    world_data = match['worlds'][color]
                    if isinstance(world_data, dict):
                        team_names[color] = world_data.get('display_name') or world_data.get('main_world_name') or team_names[color]
        
        return jsonify({
            'status': 'success',
            'match_id': match_id,
            'timeline': timeline_buckets,
            'team_names': team_names,
            'current_kdr': current_kdr,
            'current_kills': current_kills,
            'current_deaths': current_deaths,
            'snapshots_available': len(historical_snapshots)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


def format_currency(copper):
    """Format copper value as gold/silver/copper."""
    gold = copper // 10000
    silver = (copper % 10000) // 100
    copper_remaining = copper % 100
    return f"{gold:,}g {silver}s {copper_remaining}c"


if __name__ == '__main__':
    print("=" * 60)
    print("  Guild Wars 2 API - Web UI")
    print("=" * 60)
    print("\n  Starting server at http://localhost:5555")
    print("  Press Ctrl+C to stop\n")
    print("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5555)
