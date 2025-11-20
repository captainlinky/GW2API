#!/usr/bin/env python3
"""
Web UI for Guild Wars 2 API Tool
A simple Flask-based interface for interacting with the GW2 API.
"""

import os
import json
import threading
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session, Blueprint
from flask_cors import CORS
from gw2api import GW2API, GW2Viewer
from wvw_tracker import WvWTracker
from dotenv import load_dotenv, set_key, find_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('GW2-WebUI')

# Get APP_PREFIX for path-based routing (used in production with nginx)
APP_PREFIX = os.environ.get('APP_PREFIX', '').rstrip('/')
if APP_PREFIX:
    logger.info(f"Application running with prefix: {APP_PREFIX}")

# Create Flask app
app = Flask(__name__, static_url_path=APP_PREFIX + '/static' if APP_PREFIX else '/static')
app.secret_key = os.urandom(24)
CORS(app)

# Create blueprint for routes when using APP_PREFIX
if APP_PREFIX:
    bp = Blueprint('main', __name__, url_prefix=APP_PREFIX)
    logger.info(f"Using Blueprint with url_prefix: {APP_PREFIX}")
else:
    # Use app directly when no prefix
    bp = app

# Initialize WvW tracker
wvw_tracker = WvWTracker()

# Load alliance names for display
def load_alliance_names():
    """Load alliance name mappings from JSON file."""
    try:
        alliance_file = Path('alliance_names.json')
        if alliance_file.exists():
            with open(alliance_file, 'r') as f:
                data = json.load(f)
                return (
                    data.get('overrides', {}),
                    data.get('team_names', {}),
                    data.get('alliances', {})
                )
    except Exception as e:
        logger.error(f"Error loading alliance names: {e}")
    return {}, {}, {}

ALLIANCE_OVERRIDES, TEAM_NAMES, ALLIANCE_NAMES = load_alliance_names()

def get_alliance_display_name(world_id, world_name):
    """
    Get the display name for a world, preferring WvW team instance names.

    Priority order:
    1. Manual overrides (for custom naming)
    2. Team names (11xxx/12xxx - WvW battlefield instances like "Tombs of Drascir")
    3. Alliance names (1xxx - home servers)
    4. Fallback to API world name

    Args:
        world_id: World ID number (can be team ID 11xxx/12xxx or world ID 1xxx)
        world_name: Default world name from API

    Returns:
        Display name for the world/team
    """
    world_id_str = str(world_id)

    # Check overrides first (manual customization)
    if world_id_str in ALLIANCE_OVERRIDES:
        return ALLIANCE_OVERRIDES[world_id_str]

    # Check team names (WvW battlefield instances - these are the proper WvW team names)
    if world_id_str in TEAM_NAMES:
        return TEAM_NAMES[world_id_str]

    # Check alliance names (home server names)
    if world_id_str in ALLIANCE_NAMES:
        return ALLIANCE_NAMES[world_id_str]

    # Fall back to world name from API
    return world_name


# ============= MULTI-TENANT HELPER FUNCTIONS =============

def get_user_api_key(user_id):
    """
    Get the decrypted API key for a user from database or fallback.

    Args:
        user_id: The user's ID

    Returns:
        The decrypted API key string, or None if not found
    """
    try:
        from crypto_utils import get_user_api_key as db_get_user_api_key
        return db_get_user_api_key(user_id)
    except Exception as e:
        logger.warning(f"Could not retrieve user API key from database: {e}")
        # Fallback to environment variable for single-user mode
        return os.getenv('GW2_API_KEY')


def get_current_api_key():
    """
    Get the current API key from request context or environment.

    This function:
    1. Checks if user_id is in request context (from @require_auth)
    2. Gets the user's API key from database
    3. Falls back to environment variable for single-user mode

    Returns:
        The API key string

    Raises:
        ValueError if no API key is available
    """
    # Check if authenticated user_id is in request context
    user_id = getattr(request, 'user_id', None)

    if user_id:
        api_key = get_user_api_key(user_id)
        if api_key:
            return api_key

    # Fallback to environment variable
    api_key = os.getenv('GW2_API_KEY')
    if api_key:
        return api_key

    raise ValueError("No API key available. Please configure an API key.")


def require_auth(f):
    """
    Decorator to require JWT authentication on a route.

    Validates the JWT token from the Authorization header and injects
    user_id into request context for use in route handlers.

    Usage:
        @bp.route('/api/protected')
        @require_auth
        def protected_route():
            user_id = request.user_id  # Available after decorator
            return jsonify({'user_id': user_id})
    """
    from functools import wraps
    from auth import verify_token

    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'status': 'error', 'message': 'Missing or invalid authorization header'}), 401

        token = auth_header[7:]  # Remove 'Bearer ' prefix

        try:
            payload = verify_token(token)
            request.user_id = payload['user_id']
            return f(*args, **kwargs)
        except ValueError as e:
            return jsonify({'status': 'error', 'message': str(e)}), 401
        except Exception as e:
            logger.error(f"Authentication error: {e}", exc_info=True)
            return jsonify({'status': 'error', 'message': 'Authentication failed'}), 401

    return decorated


# ============= END MULTI-TENANT HELPERS =============

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
        logger.error(f"Error loading K/D history: {e}")
    return {}

def save_kdr_history(history):
    """Save K/D history to file."""
    try:
        with open(KDR_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving K/D history: {e}")

def load_activity_history():
    """Load activity history from file."""
    try:
        if os.path.exists(ACTIVITY_HISTORY_FILE):
            with open(ACTIVITY_HISTORY_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading activity history: {e}")
    return {}

def save_activity_history(history):
    """Save activity history to file."""
    try:
        with open(ACTIVITY_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving activity history: {e}")

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
            logger.info(f"Recorded activity snapshot for match {match_id}: R={team_objectives['red']} G={team_objectives['green']} B={team_objectives['blue']} objectives")

    except Exception as e:
        logger.error(f"Error recording activity snapshot: {e}")

def normalize_team_data(data_dict):
    """
    Normalize team data to handle both lowercase and capitalized keys from API.

    Args:
        data_dict: Dictionary with team keys (may be 'red'/'Red', etc.)

    Returns:
        Dictionary with normalized lowercase keys
    """
    return {
        'red': data_dict.get('red', data_dict.get('Red', 0)),
        'green': data_dict.get('green', data_dict.get('Green', 0)),
        'blue': data_dict.get('blue', data_dict.get('Blue', 0))
    }


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

        # Get kills and deaths (normalized to handle API inconsistencies)
        team_kills = normalize_team_data(match.get('kills', {}))
        team_deaths = normalize_team_data(match.get('deaths', {}))

        # Ensure deaths are at least 1 to avoid division by zero
        team_deaths = {k: max(v, 1) for k, v in team_deaths.items()}

        # Calculate K/D ratios
        team_kdr = {
            color: round(team_kills[color] / team_deaths[color], 2)
            for color in ['red', 'green', 'blue']
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
            logger.info(f"Recorded K/D snapshot for match {match_id}: R={team_kdr['red']} G={team_kdr['green']} B={team_kdr['blue']}")

    except Exception as e:
        logger.error(f"Error recording K/D snapshot: {e}")

def extract_team_id_from_worlds(world_ids):
    """
    Extract team ID from all_worlds array.
    Team IDs are 11xxx (NA) or 12xxx (EU).

    Args:
        world_ids: List of world/team IDs

    Returns:
        Team ID (11xxx/12xxx) if found, otherwise None
    """
    for wid in world_ids:
        if 11000 <= wid <= 12999:  # Team ID range
            return wid
    return None

def get_player_team_info(client, match, player_world_id):
    """
    Get the player's team ID and color from the account/wvw endpoint.

    Args:
        client: GW2API client instance
        match: Match data
        player_world_id: Player's world ID

    Returns:
        Tuple of (team_id, color) or (None, None) if not found
    """
    try:
        account_wvw = client.get_account_wvw()
        team_id = account_wvw.get('team')

        # Find which color the player is on
        for color in ['red', 'green', 'blue']:
            if color in match.get('all_worlds', {}):
                world_ids = match['all_worlds'][color]
                if player_world_id in world_ids:
                    return team_id, color

        return None, None
    except Exception as e:
        logger.warning(f"Could not fetch player team info: {e}")
        return None, None

def get_all_team_ids(match):
    """
    Extract team IDs for all three colors from match data.

    Args:
        match: Match data

    Returns:
        Dict mapping color to team_id {'red': 11001, 'green': 11004, 'blue': 11005}
    """
    team_ids = {}
    for color in ['red', 'green', 'blue']:
        if color in match.get('all_worlds', {}):
            world_ids = match['all_worlds'][color]
            team_id = extract_team_id_from_worlds(world_ids)
            if team_id:
                team_ids[color] = team_id
    return team_ids

def build_enriched_match(match, world_map, guild_map, player_team_id=None, player_color=None):
    """
    Build enriched match data with world names and guild information.

    Args:
        match: Raw match data from API
        world_map: Dictionary mapping world IDs to names
        guild_map: Dictionary mapping guild IDs to guild info
        player_team_id: Optional team ID for the player's team (11xxx/12xxx) - DEPRECATED, use team IDs from all_worlds
        player_color: Optional color ('red', 'green', 'blue') for the player's team - DEPRECATED

    Returns:
        Enriched match data dictionary
    """
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

    # Get team IDs for all teams from all_worlds arrays
    all_team_ids = get_all_team_ids(match)

    # Process teams
    for color in ['red', 'blue', 'green']:
        if color in match.get('all_worlds', {}):
            world_ids = match['all_worlds'][color]
            main_world = match['worlds'][color]

            world_name = world_map.get(main_world, f'World {main_world}')

            # Use team ID if available (from all_worlds array), otherwise use main_world
            team_id = all_team_ids.get(color)
            if team_id:
                display_name = get_alliance_display_name(team_id, world_name)
            else:
                display_name = get_alliance_display_name(main_world, world_name)

            enriched['worlds'][color] = {
                'main_world_id': main_world,
                'main_world_name': world_name,
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

    return enriched


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
        logger.info(f"Updated guild tracking for match {match.get('id')}")
    except Exception as e:
        logger.error(f"Error updating guild tracking: {e}")

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
    logger.info("Starting WvW tracking background thread (K/D + Activity + Guilds)")

    # Get tracked world from environment or use default
    tracked_world = int(os.getenv('GW2_TRACKED_WORLD', '1020'))
    logger.info(f"Tracking world ID: {tracked_world}")

    while True:
        try:
            client = GW2API()

            # Fetch base match data
            match = client.get_wvw_match_by_world(tracked_world)

            if match and 'id' in match:
                match_id = match['id']

                # Record K/D and activity snapshots
                record_kdr_snapshot(match_id, tracked_world)
                record_activity_snapshot(match_id, tracked_world)

                # Enrich match data with guild info for tracking
                try:
                    # Get world names for enrichment
                    worlds = client.get_worlds()
                    world_map = {w['id']: w['name'] for w in worlds}

                    # Collect guild IDs from this match
                    guild_ids = set()
                    for map_data in match.get('maps', []):
                        for obj in map_data.get('objectives', []):
                            if obj.get('claimed_by'):
                                guild_ids.add(obj['claimed_by'])

                    # Fetch guild information in parallel
                    guild_map = {}
                    if guild_ids:
                        limited_guild_ids = list(guild_ids)[:30]
                        try:
                            guilds = client.get_guilds(limited_guild_ids, public_only=True, max_workers=10)
                            guild_map = {g['id']: g for g in guilds}
                        except Exception as e:
                            logger.warning(f"Could not fetch guilds in tracking loop: {e}")

                    # Get player's team info for proper team name display
                    player_team_id, player_color = get_player_team_info(client, match, tracked_world)

                    # Build enriched match data structure
                    enriched = build_enriched_match(match, world_map, guild_map, player_team_id, player_color)

                    # Update guild tracking with enriched data
                    update_guild_tracking(enriched, tracked_world)

                except Exception as e:
                    logger.error(f"Error enriching match data: {e}")

        except Exception as e:
            logger.error(f"Tracking loop error: {e}")

        # Wait 5 minutes before next snapshot
        time.sleep(5 * 60)


# Add cache control headers to prevent browser caching during development
@app.after_request
def add_header(response):
    """Add headers to prevent caching."""
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response


# Helper functions
def validate_world_id(world_id):
    """
    Validate world ID parameter.

    Args:
        world_id: World ID string from request

    Returns:
        Tuple of (is_valid, error_message, parsed_id)
    """
    try:
        parsed_id = int(world_id)
        if parsed_id <= 0:
            return False, "World ID must be positive", None
        if parsed_id > 99999:  # Reasonable upper bound
            return False, "Invalid world ID", None
        return True, None, parsed_id
    except (ValueError, TypeError):
        return False, "World ID must be a valid integer", None


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


def get_polling_config():
    """Get the current polling configuration from environment."""
    return {
        'dashboard_interval': int(os.getenv('POLLING_DASHBOARD_INTERVAL', '30')),
        'maps_interval': int(os.getenv('POLLING_MAPS_INTERVAL', '15'))
    }


def save_polling_config(dashboard_interval, maps_interval):
    """Save polling configuration to .env file."""
    env_file = find_dotenv()
    if not env_file:
        env_file = os.path.join(os.path.dirname(__file__), '.env')

    set_key(env_file, 'POLLING_DASHBOARD_INTERVAL', str(dashboard_interval))
    set_key(env_file, 'POLLING_MAPS_INTERVAL', str(maps_interval))
    os.environ['POLLING_DASHBOARD_INTERVAL'] = str(dashboard_interval)
    os.environ['POLLING_MAPS_INTERVAL'] = str(maps_interval)


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

# ============= AUTHENTICATION ROUTES (Multi-Tenant) =============

@bp.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user account."""
    try:
        from auth import create_user

        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        api_key = data.get('api_key', '').strip()

        if not email or not password:
            return jsonify({'status': 'error', 'message': 'Email and password required'}), 400

        if len(password) < 8:
            return jsonify({'status': 'error', 'message': 'Password must be at least 8 characters'}), 400

        if not api_key:
            return jsonify({'status': 'error', 'message': 'API key is required'}), 400

        # Validate API key by testing it against GW2 API
        try:
            client = GW2API(api_key)
            account = client.get_account()
            account_name = account.get('name')
        except Exception as e:
            logger.warning(f"Invalid API key during registration: {e}")
            return jsonify({'status': 'error', 'message': f'Invalid API key: {str(e)}'}), 400

        result = create_user(email, password, api_key)

        return jsonify({
            'status': 'success',
            'data': {
                'token': result['token'],
                'user_id': result['user_id'],
                'email': result['email'],
                'account_name': account_name
            }
        })

    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Registration failed'}), 500


@bp.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    try:
        from auth import authenticate_user

        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'status': 'error', 'message': 'Email and password required'}), 400

        result = authenticate_user(email, password)

        return jsonify({
            'status': 'success',
            'data': {
                'token': result['token'],
                'user_id': result['user_id'],
                'email': result['email']
            }
        })

    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Login failed'}), 500


@bp.route('/api/user/api-key', methods=['POST'])
def add_user_api_key():
    """Add or update user's GW2 API key."""
    try:
        from auth import require_auth
        from crypto_utils import encrypt_api_key
        from database import query_one, execute

        # Check authentication manually first
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'status': 'error', 'message': 'No authentication token provided'}), 401

        # For now, extract user_id from request if multi-tenant is enabled
        # In production, you'd use @require_auth decorator
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            # Fallback: support single-user mode
            user_id = 1  # Default single user

        data = request.get_json()
        api_key = data.get('api_key')
        key_name = data.get('name', 'Default Key')

        if not api_key:
            return jsonify({'status': 'error', 'message': 'API key required'}), 400

        # Validate API key by testing it
        test_client = GW2API(api_key=api_key)
        try:
            account = test_client.get_account()
        except Exception as e:
            return jsonify({'status': 'error', 'message': 'Invalid API key'}), 400

        # Try to encrypt and store if database is configured
        try:
            encrypted_key = encrypt_api_key(api_key)

            # Check if user already has a key
            existing = query_one(
                "SELECT id FROM user_api_keys WHERE user_id = %s",
                (user_id,)
            )

            if existing:
                # Update existing
                execute(
                    "UPDATE user_api_keys SET api_key_encrypted = %s, api_key_name = %s, last_used = NOW() WHERE user_id = %s",
                    (encrypted_key, key_name, user_id)
                )
            else:
                # Insert new
                execute(
                    "INSERT INTO user_api_keys (user_id, api_key_encrypted, api_key_name) VALUES (%s, %s, %s)",
                    (user_id, encrypted_key, key_name)
                )
        except Exception as e:
            logger.warning(f"Could not store API key in database: {e}")
            # Fallback to environment variable in single-user mode
            if not os.environ.get('GW2_API_KEY'):
                set_key(find_dotenv(), 'GW2_API_KEY', api_key)

        return jsonify({
            'status': 'success',
            'data': {
                'account_name': account.get('name'),
                'key_name': key_name
            }
        })

    except Exception as e:
        logger.error(f"Error adding API key: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Failed to add API key'}), 500


# ============= END AUTHENTICATION ROUTES =============


@bp.route('/')
def index():
    """Main dashboard."""
    return render_template('index.html', app_prefix=APP_PREFIX)


@bp.route('/static/manifest.json')
def serve_manifest():
    """Serve manifest.json with dynamic paths based on APP_PREFIX."""
    manifest = {
        "name": "GW2 WvW Command Center",
        "short_name": "GW2 WvW",
        "description": "Guild Wars 2 World vs World Dashboard and Analytics",
        "start_url": f"{APP_PREFIX}/" if APP_PREFIX else "/",
        "display": "standalone",
        "background_color": "#1a1a1a",
        "theme_color": "#d4af37",
        "orientation": "any",
        "icons": [
            {
                "src": f"{APP_PREFIX}/static/icon-192.png" if APP_PREFIX else "/static/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": f"{APP_PREFIX}/static/icon-512.png" if APP_PREFIX else "/static/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ],
        "categories": ["games", "utilities"],
        "shortcuts": [
            {
                "name": "Dashboard",
                "short_name": "Dashboard",
                "description": "View WvW Command Center",
                "url": f"{APP_PREFIX}/" if APP_PREFIX else "/",
                "icons": [
                    {
                        "src": f"{APP_PREFIX}/static/icon-192.png" if APP_PREFIX else "/static/icon-192.png",
                        "sizes": "192x192"
                    }
                ]
            }
        ]
    }
    return jsonify(manifest)


@bp.route('/api/status')
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


@bp.route('/api/key', methods=['GET', 'POST', 'DELETE'])
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


@bp.route('/api/polling-config', methods=['GET', 'POST'])
def polling_config_management():
    """Manage polling configuration."""
    if request.method == 'GET':
        config = get_polling_config()
        return jsonify({
            'status': 'success',
            'config': config
        })

    elif request.method == 'POST':
        data = request.get_json()
        dashboard_interval = data.get('dashboard_interval')
        maps_interval = data.get('maps_interval')

        # Validate intervals
        if dashboard_interval is None or maps_interval is None:
            return jsonify({
                'status': 'error',
                'message': 'Both dashboard_interval and maps_interval are required'
            }), 400

        try:
            dashboard_interval = int(dashboard_interval)
            maps_interval = int(maps_interval)
        except ValueError:
            return jsonify({
                'status': 'error',
                'message': 'Intervals must be valid integers'
            }), 400

        # Validate ranges (minimum 5 seconds, maximum 300 seconds / 5 minutes)
        if not (5 <= dashboard_interval <= 300):
            return jsonify({
                'status': 'error',
                'message': 'Dashboard interval must be between 5 and 300 seconds'
            }), 400

        if not (5 <= maps_interval <= 300):
            return jsonify({
                'status': 'error',
                'message': 'Maps interval must be between 5 and 300 seconds'
            }), 400

        # Save configuration
        save_polling_config(dashboard_interval, maps_interval)

        return jsonify({
            'status': 'success',
            'message': 'Polling configuration saved successfully',
            'config': get_polling_config()
        })


@bp.route('/api/account')
@require_auth
def get_account():
    """Get account information (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
        account = client.get_account()

        # Enrich with additional calculations
        account['age_hours'] = account['age'] // 3600
        account['age_days'] = account['age'] // 86400

        return jsonify({
            'status': 'success',
            'data': account
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching account: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/characters')
@require_auth
def get_characters():
    """Get characters list (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
        characters = client.get_characters()
        return jsonify({
            'status': 'success',
            'data': characters
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching characters: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/character/<name>')
@require_auth
def get_character(name):
    """Get detailed character information (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
        character = client.get_character(name)

        # Add calculated fields
        character['age_hours'] = character['age'] // 3600

        return jsonify({
            'status': 'success',
            'data': character
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching character {name}: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/wallet')
@require_auth
def get_wallet():
    """Get account wallet (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
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
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching wallet: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/bank')
@require_auth
def get_bank():
    """Get bank contents (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
        bank = client.get_account_bank()

        # Filter out empty slots
        items = [item for item in bank if item is not None]

        return jsonify({
            'status': 'success',
            'data': items,
            'total_slots': len(bank),
            'filled_slots': len(items)
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching bank: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/materials')
@require_auth
def get_materials():
    """Get material storage (requires authentication)."""
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)
        materials = client.get_account_materials()

        # Filter and sort
        non_zero = [m for m in materials if m.get('count', 0) > 0]
        non_zero.sort(key=lambda x: x['count'], reverse=True)

        return jsonify({
            'status': 'success',
            'data': non_zero,
            'total_types': len(non_zero)
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching materials: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/tp/prices')
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

        # Try to get prices, but handle items that don't have TP listings
        try:
            prices = client.get_tp_prices(ids)
        except Exception as price_error:
            # If price lookup fails (e.g., account-bound items), return empty result
            logger.warning(f"Price lookup failed for items {ids}: {price_error}")
            return jsonify({
                'status': 'success',
                'data': []
            })

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


@bp.route('/api/tp/transactions/<transaction_type>')
@require_auth
def get_tp_transactions(transaction_type):
    """
    Get trading post transactions (requires authentication).

    Args:
        transaction_type: One of 'current-buys', 'current-sells', 'history-buys', 'history-sells'
    """
    try:
        api_key = get_current_api_key()
        client = GW2API(api_key=api_key)

        # Get the appropriate transaction data
        if transaction_type == 'current-buys':
            transactions = client.get_tp_transactions_current_buys()
        elif transaction_type == 'current-sells':
            transactions = client.get_tp_transactions_current_sells()
        elif transaction_type == 'history-buys':
            transactions = client.get_tp_transactions_history_buys()
        elif transaction_type == 'history-sells':
            transactions = client.get_tp_transactions_history_sells()
        else:
            return jsonify({
                'status': 'error',
                'message': f'Invalid transaction type: {transaction_type}'
            }), 400

        # Collect unique item IDs
        item_ids = list(set(t['item_id'] for t in transactions))

        # Get item details
        item_map = {}
        if item_ids:
            # Fetch in batches of 200 (API limit)
            for i in range(0, len(item_ids), 200):
                batch = item_ids[i:i+200]
                items = client.get_items(batch)
                for item in items:
                    item_map[item['id']] = item

        # Enrich transaction data
        enriched = []
        for transaction in transactions:
            item_id = transaction['item_id']
            item_info = item_map.get(item_id, {})

            enriched_transaction = {
                'id': transaction.get('id'),
                'item_id': item_id,
                'item_name': item_info.get('name', f'Item {item_id}'),
                'icon': item_info.get('icon', ''),
                'rarity': item_info.get('rarity', 'Unknown'),
                'price': transaction.get('price'),
                'price_formatted': format_currency(transaction.get('price', 0)),
                'quantity': transaction.get('quantity'),
                'created': transaction.get('created'),
                'purchased': transaction.get('purchased'),  # Only in history
            }

            enriched.append(enriched_transaction)

        return jsonify({
            'status': 'success',
            'data': enriched,
            'count': len(enriched)
        })
    except ValueError as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 401
    except Exception as e:
        logger.error(f"Error fetching TP transactions: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/tp/economics/<int:item_id>')
def get_tp_economics(item_id):
    """
    Get economic analysis for a Trading Post item.

    Provides supply/demand analysis, price trends, and buy/sell recommendations.
    """
    try:
        client = GW2API()

        # Get detailed listings with error handling
        try:
            listings_data = client.get_tp_listings([item_id])
        except Exception as e:
            logger.warning(f"[TP] Failed to get listings for item {item_id}: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Failed to fetch listing data: {str(e)}'
            }), 503

        if not listings_data:
            return jsonify({
                'status': 'error',
                'message': f'No listings found for item {item_id}'
            }), 404

        listing = listings_data[0]

        # Get item info with error handling
        try:
            item_info = client.get_items([item_id])[0]
        except Exception as e:
            logger.warning(f"[TP] Failed to get item info for {item_id}: {e}")
            item_info = {'name': f'Item {item_id}', 'icon': '', 'rarity': 'Unknown'}

        # Get basic prices with error handling
        try:
            prices_data = client.get_tp_prices([item_id])
            price_info = prices_data[0] if prices_data else {}
        except Exception as e:
            logger.warning(f"[TP] Failed to get prices for item {item_id}: {e}")
            price_info = {}

        # Extract buy and sell orders
        buy_orders = listing.get('buys', [])
        sell_orders = listing.get('sells', [])

        # Calculate economic metrics
        total_buy_quantity = sum(order['quantity'] for order in buy_orders)
        total_sell_quantity = sum(order['quantity'] for order in sell_orders)

        # Get top prices
        highest_buy = buy_orders[0]['unit_price'] if buy_orders else 0
        lowest_sell = sell_orders[0]['unit_price'] if sell_orders else 0

        # Calculate spread
        spread = lowest_sell - highest_buy if (highest_buy and lowest_sell) else 0
        spread_percent = (spread / lowest_sell * 100) if lowest_sell > 0 else 0

        # Supply/Demand ratio
        supply_demand_ratio = total_sell_quantity / total_buy_quantity if total_buy_quantity > 0 else float('inf')

        # Market velocity (how many orders in top 10% of price range)
        if buy_orders and sell_orders:
            # Top buy orders (within 10% of highest buy)
            buy_threshold = highest_buy * 0.9
            active_buyers = sum(order['quantity'] for order in buy_orders if order['unit_price'] >= buy_threshold)

            # Low sell orders (within 10% above lowest sell)
            sell_threshold = lowest_sell * 1.1
            active_sellers = sum(order['quantity'] for order in sell_orders if order['unit_price'] <= sell_threshold)

            velocity = (active_buyers + active_sellers) / 2
        else:
            velocity = 0

        # Calculate recommendation
        recommendation = calculate_tp_recommendation(
            spread_percent,
            supply_demand_ratio,
            velocity,
            total_buy_quantity,
            total_sell_quantity
        )

        # Prepare order book data for charts (top 20 of each)
        buy_orders_chart = [
            {
                'price': order['unit_price'],
                'quantity': order['quantity'],
                'listings': order['listings']
            }
            for order in buy_orders[:20]
        ]

        sell_orders_chart = [
            {
                'price': order['unit_price'],
                'quantity': order['quantity'],
                'listings': order['listings']
            }
            for order in sell_orders[:20]
        ]

        return jsonify({
            'status': 'success',
            'data': {
                'item': {
                    'id': item_id,
                    'name': item_info.get('name', 'Unknown'),
                    'icon': item_info.get('icon', ''),
                    'rarity': item_info.get('rarity', 'Unknown')
                },
                'prices': {
                    'highest_buy': highest_buy,
                    'lowest_sell': lowest_sell,
                    'spread': spread,
                    'spread_percent': round(spread_percent, 2),
                    'highest_buy_formatted': format_currency(highest_buy),
                    'lowest_sell_formatted': format_currency(lowest_sell),
                    'spread_formatted': format_currency(spread)
                },
                'supply_demand': {
                    'total_buy_orders': total_buy_quantity,
                    'total_sell_listings': total_sell_quantity,
                    'ratio': round(supply_demand_ratio, 2),
                    'velocity': round(velocity, 0)
                },
                'recommendation': recommendation,
                'order_book': {
                    'buys': buy_orders_chart,
                    'sells': sell_orders_chart
                }
            }
        })
    except Exception as e:
        logger.error(f"Error getting TP economics for item {item_id}: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


def calculate_tp_recommendation(spread_percent, supply_demand_ratio, velocity, buy_qty, sell_qty):
    """
    Calculate buy/sell recommendation based on market conditions.

    Returns a dict with recommendation type and reasoning.
    """
    reasons = []
    score = 0  # Positive = buy opportunity, Negative = sell opportunity

    # Analyze spread
    if spread_percent < 5:
        reasons.append("Very tight spread (< 5%) - competitive market")
        score += 1  # Slightly favors buying (liquid market)
    elif spread_percent > 15:
        reasons.append(f"Wide spread ({spread_percent:.1f}%) - potential flip opportunity")
        score -= 1  # Could flip

    # Analyze supply/demand ratio
    if supply_demand_ratio < 0.5:
        reasons.append("Low supply vs demand - prices may rise")
        score += 2  # Strong buy signal
    elif supply_demand_ratio > 2:
        reasons.append("High supply vs demand - prices may fall")
        score -= 2  # Strong sell signal
    elif 0.8 <= supply_demand_ratio <= 1.2:
        reasons.append("Balanced supply and demand")

    # Analyze velocity (market activity)
    if velocity > 1000:
        reasons.append("High market activity - very liquid")
        score += 1
    elif velocity < 100:
        reasons.append("Low market activity - illiquid")
        score -= 1

    # Analyze absolute quantities
    if buy_qty > 10000:
        reasons.append("Strong buyer interest")
        score += 1
    if sell_qty > 10000:
        reasons.append("Heavy selling pressure")
        score -= 1

    # Determine recommendation
    if score >= 2:
        recommendation_type = "STRONG BUY"
        color = "#27ae60"
    elif score == 1:
        recommendation_type = "BUY"
        color = "#6bff6b"
    elif score == -1:
        recommendation_type = "SELL"
        color = "#ff9800"
    elif score <= -2:
        recommendation_type = "STRONG SELL"
        color = "#e74c3c"
    else:
        recommendation_type = "HOLD"
        color = "#d4af37"

    return {
        'type': recommendation_type,
        'color': color,
        'score': score,
        'reasons': reasons
    }


@bp.route('/api/items')
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


# Item search cache (refresh every 6 hours)
item_search_cache = None
item_search_cache_time = None
item_search_lock = threading.Lock()

def preload_item_search_cache():
    """Pre-load items into PostgreSQL database (background thread)."""
    try:
        logger.info("[SEARCH] Populating items database...")
        from database import get_db_connection

        with item_search_lock:
            client = GW2API()
            all_ids = client.get_items()
            logger.info(f"[SEARCH] Found {len(all_ids)} total items to load")

            batch_size = 200
            total_loaded = 0

            for i in range(0, len(all_ids), batch_size):
                batch = all_ids[i:i + batch_size]
                try:
                    items = client.get_items(batch)

                    # Insert items into database
                    with get_db_connection() as conn:
                        cur = conn.cursor()
                        for item in items:
                            flags = item.get('flags', [])
                            # Only insert tradeable items
                            if 'AccountBound' not in flags and 'SoulbindOnAcquire' not in flags:
                                try:
                                    cur.execute("""
                                        INSERT INTO items (id, name, icon, rarity, level, type, last_updated)
                                        VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                                        ON CONFLICT (id) DO UPDATE SET
                                            name = EXCLUDED.name,
                                            icon = EXCLUDED.icon,
                                            rarity = EXCLUDED.rarity,
                                            level = EXCLUDED.level,
                                            type = EXCLUDED.type,
                                            last_updated = CURRENT_TIMESTAMP
                                    """, (
                                        item['id'],
                                        item['name'],
                                        item.get('icon', ''),
                                        item.get('rarity', ''),
                                        item.get('level', 0),
                                        item.get('type', '')
                                    ))
                                    total_loaded += 1
                                except Exception as e:
                                    logger.warning(f"[SEARCH] Failed to insert item {item.get('id')}: {e}")
                        conn.commit()

                    batch_num = i // batch_size + 1
                    total_batches = (len(all_ids) + batch_size - 1) // batch_size
                    logger.info(f"[SEARCH] Loaded batch {batch_num}/{total_batches}: {total_loaded} tradeable items in DB")

                except Exception as e:
                    logger.warning(f"[SEARCH] Failed to fetch batch {i//batch_size + 1}: {e}")
                    continue

            logger.info(f"[SEARCH] Completed: {total_loaded} tradeable items in database")
    except Exception as e:
        logger.error(f"[SEARCH] Failed to populate items database: {e}", exc_info=True)

@bp.route('/api/items/search')
def search_items():
    """Search for items by name from PostgreSQL database."""
    from database import get_db_connection

    query = request.args.get('q', '').strip().lower()

    if not query or len(query) < 2:
        return jsonify({
            'status': 'error',
            'message': 'Query must be at least 2 characters'
        }), 400

    try:
        # Check if database has any items
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM items")
            item_count = cur.fetchone()[0]

        # If no items in database, populate it in background
        if item_count == 0:
            logger.info("[SEARCH] No items in database, populating...")
            if not item_search_lock.locked():
                cache_load_thread = threading.Thread(target=preload_item_search_cache, daemon=True)
                cache_load_thread.start()

            return jsonify({
                'status': 'loading',
                'message': 'Item database is being populated. This happens on first search. Please try again in 2-3 minutes.',
                'data': []
            }), 202  # 202 Accepted

        # Query database for matching items
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, name, icon, rarity, level, type
                FROM items
                WHERE LOWER(name) LIKE %s
                ORDER BY name ASC
                LIMIT 20
            """, (f'%{query}%',))

            rows = cur.fetchall()

        matches = [
            {
                'id': row[0],
                'name': row[1],
                'icon': row[2],
                'rarity': row[3],
                'level': row[4],
                'type': row[5]
            }
            for row in rows
        ]

        return jsonify({
            'status': 'success',
            'data': matches,
            'count': len(matches)
        })

    except Exception as e:
        logger.error(f"[SEARCH] Error: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@bp.route('/api/proxy/maps/<int:map_id>')
def get_map_proxy(map_id):
    """
    Proxy endpoint for GW2 maps API.

    Returns map metadata including map_rect and continent_rect coordinates.
    """
    try:
        client = GW2API()
        maps = client.get_maps([map_id])

        if not maps:
            return jsonify({
                'status': 'error',
                'message': f'Map {map_id} not found'
            }), 404

        return jsonify({
            'status': 'success',
            'data': maps[0]
        })
    except Exception as e:
        logger.error(f"Error fetching map {map_id}: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@bp.route('/api/query', methods=['POST'])
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


@bp.route('/api/wvw/matches')
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

                    # Use alliance name if available, otherwise world name
                    world_name = world_map.get(main_world, f'World {main_world}')
                    display_name = get_alliance_display_name(main_world, world_name)

                    enriched_match['worlds'][color] = {
                        'main_world_id': main_world,
                        'main_world_name': world_name,
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


@bp.route('/api/wvw/stats/<world_id>')
def get_wvw_stats(world_id):
    """Get enhanced WvW statistics including PPT, territory control, and skirmish info."""
    is_valid, error_msg, parsed_world_id = validate_world_id(world_id)
    if not is_valid:
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 400

    try:
        client = GW2API()
        match = client.get_wvw_match_by_world(parsed_world_id)

        if not match:
            return jsonify({
                'status': 'error',
                'message': 'Match not found'
            }), 404

        # Calculate PPT (Points Per Tick) for each team
        ppt = {'red': 0, 'green': 0, 'blue': 0}
        objectives_count = {'red': 0, 'green': 0, 'blue': 0}
        objective_types = {
            'red': {'Camp': 0, 'Tower': 0, 'Keep': 0, 'Castle': 0},
            'green': {'Camp': 0, 'Tower': 0, 'Keep': 0, 'Castle': 0},
            'blue': {'Camp': 0, 'Tower': 0, 'Keep': 0, 'Castle': 0}
        }

        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                owner = obj.get('owner', '').lower()
                if owner in ['red', 'green', 'blue']:
                    points = obj.get('points_tick', 0)
                    ppt[owner] += points
                    objectives_count[owner] += 1

                    # Track objective types
                    obj_type = obj.get('type', 'Unknown')
                    if obj_type in objective_types[owner]:
                        objective_types[owner][obj_type] += 1

        # Calculate territory control percentage
        total_objectives = sum(objectives_count.values())
        territory_control = {
            'red': round((objectives_count['red'] / total_objectives * 100) if total_objectives > 0 else 0, 1),
            'green': round((objectives_count['green'] / total_objectives * 100) if total_objectives > 0 else 0, 1),
            'blue': round((objectives_count['blue'] / total_objectives * 100) if total_objectives > 0 else 0, 1)
        }

        # Get current scores and calculate momentum
        scores = match.get('scores', {})
        current_scores = normalize_team_data(scores)

        # Calculate score momentum (score per hour based on PPT)
        # PPT happens every 5 minutes = 12 ticks per hour
        projected_score_per_hour = {
            color: ppt[color] * 12 for color in ['red', 'green', 'blue']
        }

        # Get skirmish information
        skirmishes = match.get('skirmishes', [])
        current_skirmish = None
        next_skirmish_time = None

        if skirmishes:
            # Get the most recent skirmish
            current_skirmish = skirmishes[-1]

            # Calculate time until next skirmish (skirmishes are 2 hours)
            match_start = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
            match_start_naive = match_start.replace(tzinfo=None)
            now = datetime.utcnow()
            elapsed = (now - match_start_naive).total_seconds()

            # Skirmishes are 2 hours (7200 seconds)
            skirmish_duration = 7200
            current_skirmish_number = int(elapsed // skirmish_duration) + 1
            next_skirmish_time = match_start_naive + timedelta(seconds=current_skirmish_number * skirmish_duration)
            seconds_to_next = (next_skirmish_time - now).total_seconds()

            if seconds_to_next < 0:
                seconds_to_next = 0

        # Get victory points
        victory_points = normalize_team_data(match.get('victory_points', {}))

        # Get world names
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}

        # Get team IDs for all teams from all_worlds arrays
        all_team_ids = get_all_team_ids(match)

        team_names = {}
        for color in ['red', 'green', 'blue']:
            if color in match.get('worlds', {}):
                main_world = match['worlds'][color]
                world_name = world_map.get(main_world, f'World {main_world}')

                # Use team ID if available, otherwise use world ID
                team_id = all_team_ids.get(color)
                if team_id:
                    team_names[color] = get_alliance_display_name(team_id, world_name)
                else:
                    team_names[color] = get_alliance_display_name(main_world, world_name)

        # Extract tier from match ID (format: "region-tier", e.g., "1-2" = NA Tier 2)
        match_id_str = match['id']
        tier_info = {'tier': None, 'region': None}
        try:
            parts = match_id_str.split('-')
            if len(parts) == 2:
                region_id = int(parts[0])
                tier_num = int(parts[1])
                tier_info['tier'] = tier_num
                tier_info['region'] = 'NA' if region_id == 1 else 'EU' if region_id == 2 else f'Region {region_id}'
        except (ValueError, IndexError):
            pass

        return jsonify({
            'status': 'success',
            'match_id': match['id'],
            'tier_info': tier_info,
            'team_names': team_names,
            'ppt': ppt,
            'territory_control': territory_control,
            'objectives_count': objectives_count,
            'objective_types': objective_types,
            'current_scores': current_scores,
            'victory_points': victory_points,
            'projected_score_per_hour': projected_score_per_hour,
            'skirmish': {
                'current': current_skirmish_number if 'current_skirmish_number' in locals() else None,
                'total': len(skirmishes),
                'seconds_to_next': int(seconds_to_next) if 'seconds_to_next' in locals() else None,
                'next_time': next_skirmish_time.isoformat() + 'Z' if next_skirmish_time else None
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/wvw/match/<world_id>')
def get_wvw_match_for_world(world_id):
    """Get WvW match information for a specific world."""
    import time
    start_time = time.time()

    # Validate world ID
    is_valid, error_msg, parsed_world_id = validate_world_id(world_id)
    if not is_valid:
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 400

    try:
        logger.debug(f"Starting /api/wvw/match/{world_id}")
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
        
        # Get team IDs for all teams from all_worlds arrays
        all_team_ids = get_all_team_ids(match)

        # Process teams
        for color in ['red', 'blue', 'green']:
            if color in match.get('all_worlds', {}):
                world_ids = match['all_worlds'][color]
                main_world = match['worlds'][color]

                world_name = world_map.get(main_world, f'World {main_world}')

                # Use team ID if available (from all_worlds array), otherwise use main_world
                team_id = all_team_ids.get(color)
                if team_id:
                    display_name = get_alliance_display_name(team_id, world_name)
                else:
                    display_name = get_alliance_display_name(main_world, world_name)

                enriched['worlds'][color] = {
                    'main_world_id': main_world,
                    'main_world_name': world_name,
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


@bp.route('/api/wvw/objectives')
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


@bp.route('/api/wvw/tracked-guilds/<match_id>')
def get_tracked_guilds(match_id):
    """Get all tracked guilds for a match, organized by team."""
    try:
        guilds_by_team = wvw_tracker.get_all_guilds_sorted(match_id)
        match_summary = wvw_tracker.get_match_summary(match_id)

        # Check if this match has ended
        is_expired = False
        if match_summary and match_summary.get('end_time'):
            try:
                end_time = datetime.fromisoformat(match_summary['end_time'].replace('Z', '+00:00'))
                end_time_naive = end_time.replace(tzinfo=None)
                is_expired = datetime.utcnow() >= end_time_naive
            except (ValueError, AttributeError):
                pass

        # If match has expired, try to get fresh team names from current match API
        # and mark old guild data for cleanup
        if is_expired:
            logger.info(f"Match {match_id} has expired. Fetching current match data...")
            try:
                # Clean up this expired match
                removed = wvw_tracker.cleanup_old_matches(days=0)  # Clean up immediately
                if removed > 0:
                    logger.info(f"Cleaned up {removed} expired match(es)")
                    # Return empty data since match is expired
                    return jsonify({
                        'status': 'error',
                        'message': f'Match {match_id} has ended. Please reload match data to see current matchup.',
                        'is_expired': True
                    }), 410  # 410 Gone - resource no longer available
            except Exception as cleanup_err:
                logger.error(f"Error cleaning up expired match: {cleanup_err}")

        return jsonify({
            'status': 'success',
            'match_info': {
                'match_id': match_id,
                'start_time': match_summary.get('start_time'),
                'end_time': match_summary.get('end_time'),
                'first_seen': match_summary.get('first_seen'),
                'last_updated': match_summary.get('last_updated'),
                'is_expired': is_expired,
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


@bp.route('/api/wvw/active-matches')
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


@bp.route('/api/wvw/activity/<world_id>')
def get_wvw_activity(world_id):
    """Get WvW activity timeline for a specific world's match."""
    # Validate world ID
    is_valid, error_msg, parsed_world_id = validate_world_id(world_id)
    if not is_valid:
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 400

    # Get time window parameter (6h, 24h, or 7d)
    time_window = request.args.get('window', '6h')

    # Calculate bucket parameters based on window
    if time_window == '6h':
        bucket_size = 15  # 15 minutes
        num_buckets = 24  # 6 hours
    elif time_window == '24h':
        bucket_size = 60  # 1 hour
        num_buckets = 24  # 24 hours
    elif time_window == '7d':
        bucket_size = 6 * 60  # 6 hours
        num_buckets = 28  # 7 days
    else:
        # Default to 6h if invalid
        bucket_size = 15
        num_buckets = 24

    try:
        # Get match data directly instead of internal HTTP request
        client = GW2API()
        match = client.get_wvw_match_by_world(parsed_world_id)

        if not match:
            return jsonify({
                'status': 'error',
                'message': 'Failed to get match data'
            }), 404

        # Enrich match data with world names and guild info
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}

        # Collect guild IDs
        guild_ids = set()
        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                if obj.get('claimed_by'):
                    guild_ids.add(obj['claimed_by'])

        # Fetch guild information
        guild_map = {}
        if guild_ids:
            limited_guild_ids = list(guild_ids)[:30]
            try:
                guilds = client.get_guilds(limited_guild_ids, public_only=True, max_workers=10)
                guild_map = {g['id']: g for g in guilds}
            except Exception as e:
                print(f"[ACTIVITY] Could not fetch guilds: {e}")

        # Get player's team info for proper team name display
        player_team_id, player_color = get_player_team_info(client, match, parsed_world_id)

        # Build enriched match
        match = build_enriched_match(match, world_map, guild_map, player_team_id, player_color)
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

        # Generate timeline buckets using historical data (bucket_size and num_buckets set above)
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
                    'timestamp': bucket_end_time.isoformat() + 'Z',
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
                    'timestamp': bucket_end_time.isoformat() + 'Z',
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


@bp.route('/api/wvw/ppt/<world_id>')
def get_wvw_ppt(world_id):
    """Get WvW PPT (Points Per Tick) trends for coverage analysis."""
    # Validate world ID
    is_valid, error_msg, parsed_world_id = validate_world_id(world_id)
    if not is_valid:
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 400

    # Get time window parameter (6h, 24h, or 7d)
    time_window = request.args.get('window', '6h')

    # Calculate bucket parameters based on window
    if time_window == '6h':
        bucket_size = 15  # 15 minutes
        num_buckets = 24  # 6 hours
    elif time_window == '24h':
        bucket_size = 60  # 1 hour
        num_buckets = 24  # 24 hours
    elif time_window == '7d':
        bucket_size = 6 * 60  # 6 hours
        num_buckets = 28  # 7 days
    else:
        # Default to 6h if invalid
        bucket_size = 15
        num_buckets = 24

    try:
        # Get current PPT stats
        client = GW2API()
        match = client.get_wvw_match_by_world(parsed_world_id)

        if not match:
            return jsonify({
                'status': 'error',
                'message': 'Match not found'
            }), 404

        # Calculate current PPT for each team
        current_ppt = {'red': 0, 'green': 0, 'blue': 0}
        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                owner = obj.get('owner', '').lower()
                if owner in ['red', 'green', 'blue']:
                    points = obj.get('points_tick', 0)
                    current_ppt[owner] += points

        # Get enriched match for team names
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}

        # Collect guild IDs
        guild_ids = set()
        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                if obj.get('claimed_by'):
                    guild_ids.add(obj['claimed_by'])

        # Fetch guild information
        guild_map = {}
        if guild_ids:
            limited_guild_ids = list(guild_ids)[:30]
            try:
                guilds = client.get_guilds(limited_guild_ids, public_only=True, max_workers=10)
                guild_map = {g['id']: g for g in guilds}
            except Exception as e:
                print(f"[PPT] Could not fetch guilds: {e}")

        # Get player's team info for proper team name display
        player_team_id, player_color = get_player_team_info(client, match, parsed_world_id)

        # Build enriched match
        match = build_enriched_match(match, world_map, guild_map, player_team_id, player_color)
        match_id = match.get('id')

        # Load historical activity data to calculate PPT over time
        with activity_history_lock:
            history = load_activity_history()
            historical_snapshots = history.get(match_id, [])

        # Generate timeline buckets using historical data
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

            # Calculate PPT based on objective counts (estimate 5 points per objective on average)
            if bucket_snapshots:
                # Use the latest snapshot in this bucket
                latest_snapshot = max(bucket_snapshots, key=lambda s: s['timestamp'])

                # Estimate PPT based on objective types
                def calc_ppt_from_types(types):
                    return (types.get('Camp', 0) * 2 +
                           types.get('Tower', 0) * 4 +
                           types.get('Keep', 0) * 8 +
                           types.get('Castle', 0) * 12)

                bucket_data = {
                    'timestamp': latest_snapshot['timestamp'],
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red_ppt': calc_ppt_from_types(latest_snapshot.get('red_types', {})),
                    'green_ppt': calc_ppt_from_types(latest_snapshot.get('green_types', {})),
                    'blue_ppt': calc_ppt_from_types(latest_snapshot.get('blue_types', {}))
                }
            else:
                # No historical data for this bucket, use current PPT
                bucket_data = {
                    'timestamp': bucket_end_time.isoformat() + 'Z',
                    'minutes_ago': int((now - bucket_end_time).total_seconds() / 60),
                    'red_ppt': current_ppt['red'],
                    'green_ppt': current_ppt['green'],
                    'blue_ppt': current_ppt['blue']
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
            'current_ppt': current_ppt,
            'snapshots_available': len(historical_snapshots)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/wvw/update-alliance-names', methods=['POST'])
def update_alliance_names():
    """Update alliance names from current matchup data."""
    try:
        client = GW2API()
        matches = client.get_wvw_matches()
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}

        # Load current alliance names
        alliance_file = Path('alliance_names.json')
        with open(alliance_file, 'r') as f:
            data = json.load(f)

        # Update alliance names from all matches
        updated_count = 0
        for match in matches:
            for color in ['red', 'green', 'blue']:
                if color in match.get('worlds', {}):
                    main_world = match['worlds'][color]
                    world_name = world_map.get(main_world, f'World {main_world}')
                    world_id_str = str(main_world)

                    # Only update if not in overrides
                    if world_id_str not in data.get('overrides', {}):
                        # Update the alliance name
                        if world_id_str not in data['alliances'] or data['alliances'][world_id_str] != world_name:
                            data['alliances'][world_id_str] = world_name
                            updated_count += 1

        # Update timestamp
        data['_last_updated'] = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')

        # Save updated data
        with open(alliance_file, 'w') as f:
            json.dump(data, f, indent=2)

        # Reload alliance names in memory
        global ALLIANCE_OVERRIDES, TEAM_NAMES, ALLIANCE_NAMES
        ALLIANCE_OVERRIDES, TEAM_NAMES, ALLIANCE_NAMES = load_alliance_names()

        return jsonify({
            'status': 'success',
            'message': f'Updated {updated_count} alliance names',
            'updated_count': updated_count
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400


@bp.route('/api/wvw/kdr/<world_id>')
def get_wvw_kdr(world_id):
    """Get WvW K/D ratio trends for a specific world's match."""
    # Validate world ID
    is_valid, error_msg, parsed_world_id = validate_world_id(world_id)
    if not is_valid:
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 400

    # Get time window parameter (6h, 24h, or 7d)
    time_window = request.args.get('window', '6h')

    # Calculate bucket parameters based on window
    if time_window == '6h':
        bucket_size = 15  # 15 minutes
        num_buckets = 24  # 6 hours
    elif time_window == '24h':
        bucket_size = 60  # 1 hour
        num_buckets = 24  # 24 hours
    elif time_window == '7d':
        bucket_size = 6 * 60  # 6 hours
        num_buckets = 28  # 7 days
    else:
        # Default to 6h if invalid
        bucket_size = 15
        num_buckets = 24

    try:
        # Get match data directly instead of internal HTTP request
        client = GW2API()
        match = client.get_wvw_match_by_world(parsed_world_id)

        if not match:
            return jsonify({
                'status': 'error',
                'message': 'Failed to get match data'
            }), 404

        # Enrich match data with world names
        worlds = client.get_worlds()
        world_map = {w['id']: w['name'] for w in worlds}

        # Collect guild IDs
        guild_ids = set()
        for map_data in match.get('maps', []):
            for obj in map_data.get('objectives', []):
                if obj.get('claimed_by'):
                    guild_ids.add(obj['claimed_by'])

        # Fetch guild information
        guild_map = {}
        if guild_ids:
            limited_guild_ids = list(guild_ids)[:30]
            try:
                guilds = client.get_guilds(limited_guild_ids, public_only=True, max_workers=10)
                guild_map = {g['id']: g for g in guilds}
            except Exception as e:
                print(f"[KDR] Could not fetch guilds: {e}")

        # Get player's team info for proper team name display
        player_team_id, player_color = get_player_team_info(client, match, parsed_world_id)

        # Build enriched match
        match = build_enriched_match(match, world_map, guild_map, player_team_id, player_color)
        match_id = match.get('id')
        
        # Get current K/D for each team (normalized)
        current_kills = normalize_team_data(match.get('kills', {}))
        current_deaths = normalize_team_data(match.get('deaths', {}))

        # Ensure deaths are at least 1 to avoid division by zero
        current_deaths = {k: max(v, 1) for k, v in current_deaths.items()}

        # Calculate K/D ratios
        current_kdr = {
            color: round(current_kills[color] / current_deaths[color], 2)
            for color in ['red', 'green', 'blue']
        }
        
        # Load historical data
        with kdr_history_lock:
            history = load_kdr_history()
            historical_snapshots = history.get(match_id, [])

        # Generate timeline buckets (bucket_size and num_buckets set above)
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


# Register blueprint if using APP_PREFIX
if APP_PREFIX and isinstance(bp, Blueprint):
    app.register_blueprint(bp)
    logger.info(f"Blueprint registered at: {APP_PREFIX}")


if __name__ == '__main__':
    print("=" * 60)
    print("  Guild Wars 2 API - Web UI")
    print("=" * 60)
    if APP_PREFIX:
        print(f"\n  Starting server at http://localhost:5555{APP_PREFIX}/")
        print(f"  Mode: Production (with prefix: {APP_PREFIX})")
    else:
        print("\n  Starting server at http://localhost:5555")
        print("  Mode: Development (no prefix)")
    print("  Press Ctrl+C to stop\n")
    print("=" * 60)

    # NOTE: Item search cache pre-loading disabled - it causes GW2 API timeouts on startup
    # The cache is loaded on-demand when first search is performed

    # Start tracking thread after Flask initialization
    kdr_thread = threading.Thread(target=kdr_tracking_loop, daemon=True)
    kdr_thread.start()

    app.run(debug=True, host='0.0.0.0', port=5555)
