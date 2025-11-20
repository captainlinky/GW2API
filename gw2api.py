#!/usr/bin/env python3
"""
Guild Wars 2 API Client
A comprehensive tool to query the GW2 API with multiple viewing options.
"""

import os
import json
import requests
import time
import logging
from typing import Any, Dict, List, Optional, Union
from tabulate import tabulate
from colorama import Fore, Style, init
from dotenv import load_dotenv
from functools import lru_cache
from datetime import datetime, timedelta

# Initialize colorama for cross-platform colored output
init(autoreset=True)

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger('GW2API')

# Simple in-memory cache with TTL
class SimpleCache:
    def __init__(self, ttl_seconds=300):
        self.cache = {}
        self.ttl = ttl_seconds
    
    def get(self, key):
        if key in self.cache:
            value, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return value
            else:
                del self.cache[key]
        return None
    
    def set(self, key, value):
        self.cache[key] = (value, time.time())
    
    def clear(self):
        self.cache.clear()

# Global cache instances
_api_cache = SimpleCache(ttl_seconds=300)  # 5 minute cache


class GW2API:
    """Main client for interacting with the Guild Wars 2 API."""

    BASE_URL = "https://api.guildwars2.com/v2"

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the GW2 API client.

        Args:
            api_key: Your GW2 API key. If not provided, will try to load from .env file.
        """
        self.api_key = api_key or os.getenv('GW2_API_KEY')
        self.session = requests.Session()
        if self.api_key:
            self.session.headers.update({'Authorization': f'Bearer {self.api_key}'})

        # Create a hash of the API key for cache key isolation
        # This ensures different API keys don't share cached data
        if self.api_key:
            import hashlib
            self.api_key_hash = hashlib.md5(self.api_key.encode()).hexdigest()[:8]
        else:
            self.api_key_hash = "anonymous"
    
    def _request(self, endpoint: str, params: Optional[Dict] = None, use_cache: bool = True, timeout: int = 15, retries: int = 2) -> Union[Dict, List]:
        """
        Make a request to the GW2 API with retry logic.

        Args:
            endpoint: API endpoint (e.g., 'account', 'characters')
            params: Optional query parameters
            use_cache: Whether to use cached response if available
            timeout: Request timeout in seconds (default 15)
            retries: Number of retries on timeout (default 2)

        Returns:
            JSON response from the API

        Raises:
            requests.exceptions.RequestException: If the request fails after retries
        """
        # Build cache key with API key hash to isolate data between users
        cache_key = f"{self.api_key_hash}:{endpoint}:{json.dumps(params, sort_keys=True) if params else ''}"

        # Check cache first
        if use_cache:
            cached = _api_cache.get(cache_key)
            if cached is not None:
                return cached

        # Make request with retry logic
        url = f"{self.BASE_URL}/{endpoint}"
        last_error = None

        for attempt in range(retries + 1):
            start = time.time()
            try:
                response = self.session.get(url, params=params, timeout=timeout)
                elapsed = time.time() - start
                logger.debug(f"{endpoint} took {elapsed:.2f}s")
                response.raise_for_status()
                data = response.json()

                # Cache successful responses
                if use_cache:
                    _api_cache.set(cache_key, data)

                return data
            except requests.Timeout:
                elapsed = time.time() - start
                last_error = f"TIMEOUT after {elapsed:.2f}s"
                if attempt < retries:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    logger.warning(f"{endpoint} {last_error}, retry {attempt + 1}/{retries} in {wait_time}s")
                    time.sleep(wait_time)
                else:
                    logger.warning(f"{endpoint} {last_error} (failed after {retries + 1} attempts)")
                    raise
            except Exception as e:
                elapsed = time.time() - start
                logger.error(f"{endpoint} ERROR after {elapsed:.2f}s: {e}")
                raise
    
    # Account Endpoints
    def get_account(self) -> Dict:
        """Get basic account information."""
        return self._request('account')

    def get_account_wvw(self) -> Dict:
        """Get account WvW information including team_id."""
        return self._request('account/wvw')

    def get_account_achievements(self) -> List[Dict]:
        """Get account achievement progress."""
        return self._request('account/achievements')
    
    def get_account_bank(self) -> List[Dict]:
        """Get account bank contents."""
        return self._request('account/bank')
    
    def get_account_materials(self) -> List[Dict]:
        """Get account material storage."""
        return self._request('account/materials')
    
    def get_account_wallet(self) -> List[Dict]:
        """Get account wallet (currencies)."""
        return self._request('account/wallet')
    
    def get_characters(self) -> List[str]:
        """Get list of character names."""
        return self._request('characters')
    
    def get_character(self, name: str) -> Dict:
        """Get detailed character information."""
        return self._request(f'characters/{name}')
    
    # Game Data Endpoints
    def get_items(self, item_ids: Optional[List[int]] = None) -> Union[List[int], List[Dict]]:
        """
        Get item information.
        
        Args:
            item_ids: List of item IDs. If None, returns list of all available IDs.
        """
        if item_ids:
            return self._request('items', params={'ids': ','.join(map(str, item_ids))})
        return self._request('items')
    
    def get_recipes(self, recipe_ids: Optional[List[int]] = None) -> Union[List[int], List[Dict]]:
        """Get recipe information."""
        if recipe_ids:
            return self._request('recipes', params={'ids': ','.join(map(str, recipe_ids))})
        return self._request('recipes')
    
    def get_achievements(self, achievement_ids: Optional[List[int]] = None) -> Union[List[int], List[Dict]]:
        """Get achievement information."""
        if achievement_ids:
            return self._request('achievements', params={'ids': ','.join(map(str, achievement_ids))})
        return self._request('achievements')
    
    def get_skins(self, skin_ids: Optional[List[int]] = None) -> Union[List[int], List[Dict]]:
        """Get skin information."""
        if skin_ids:
            return self._request('skins', params={'ids': ','.join(map(str, skin_ids))})
        return self._request('skins')
    
    def get_worlds(self) -> List[Dict]:
        """Get all world (server) information."""
        worlds = self._request('worlds', params={'ids': 'all'})

        # Add WvW team names from alliance_names.json
        # These 11xxx/12xxx IDs are WvW battlefield identifiers that don't exist in the API
        try:
            # Get the directory where this script is located
            script_dir = os.path.dirname(os.path.abspath(__file__))
            alliance_file = os.path.join(script_dir, 'alliance_names.json')

            with open(alliance_file, 'r') as f:
                alliance_data = json.load(f)

            # Build team worlds list from team_names in JSON
            team_worlds = []
            for team_id, team_name in alliance_data.get('team_names', {}).items():
                team_worlds.append({
                    'id': int(team_id),
                    'name': team_name,
                    'population': 'Full'
                })

            if isinstance(worlds, list):
                worlds.extend(team_worlds)
        except Exception as e:
            logger.warning(f"Could not load team names from alliance_names.json: {e}")

        return worlds
    
    def get_currencies(self) -> List[Dict]:
        """Get all currency information."""
        return self._request('currencies', params={'ids': 'all'})

    def get_maps(self, map_ids: Optional[List[int]] = None) -> Union[List[int], List[Dict]]:
        """
        Get map information including coordinates and boundaries.

        Args:
            map_ids: List of map IDs. If None, returns list of all available IDs.

        Returns:
            List of map data including map_rect and continent_rect coordinates
        """
        if map_ids:
            return self._request('maps', params={'ids': ','.join(map(str, map_ids))})
        return self._request('maps')

    # Trading Post Endpoints
    def get_tp_prices(self, item_ids: Optional[List[int]] = None) -> Union[List[Dict], Dict]:
        """Get Trading Post prices."""
        if item_ids:
            return self._request('commerce/prices', params={'ids': ','.join(map(str, item_ids))}, timeout=20, retries=3)
        return self._request('commerce/prices', timeout=20, retries=3)
    
    def get_tp_listings(self, item_ids: List[int]) -> List[Dict]:
        """Get Trading Post listings (buy/sell orders)."""
        return self._request('commerce/listings', params={'ids': ','.join(map(str, item_ids))}, timeout=20, retries=3)

    def get_tp_transactions_current_buys(self) -> List[Dict]:
        """Get current buy orders on Trading Post."""
        return self._request('commerce/transactions/current/buys')

    def get_tp_transactions_current_sells(self) -> List[Dict]:
        """Get current sell listings on Trading Post."""
        return self._request('commerce/transactions/current/sells')

    def get_tp_transactions_history_buys(self) -> List[Dict]:
        """Get buy transaction history (past 90 days)."""
        return self._request('commerce/transactions/history/buys')

    def get_tp_transactions_history_sells(self) -> List[Dict]:
        """Get sell transaction history (past 90 days)."""
        return self._request('commerce/transactions/history/sells')
    
    # PvP Endpoints
    def get_pvp_stats(self) -> Dict:
        """Get PvP statistics."""
        return self._request('pvp/stats')
    
    def get_pvp_games(self) -> List[Dict]:
        """Get recent PvP games."""
        return self._request('pvp/games')
    
    # WvW Endpoints
    def get_wvw_matches(self) -> List[Dict]:
        """Get current WvW matches."""
        return self._request('wvw/matches', params={'ids': 'all'})
    
    def get_wvw_match_by_world(self, world_id: int) -> Dict:
        """Get WvW match for a specific world."""
        return self._request('wvw/matches', params={'world': world_id})
    
    def get_wvw_objectives(self) -> List[Dict]:
        """Get WvW objectives information."""
        return self._request('wvw/objectives', params={'ids': 'all'})
    
    def get_wvw_ranks(self) -> List[Dict]:
        """Get WvW rank information."""
        return self._request('wvw/ranks', params={'ids': 'all'})
    
    def get_wvw_abilities(self) -> List[Dict]:
        """Get WvW abilities information."""
        return self._request('wvw/abilities', params={'ids': 'all'})
    
    def get_wvw_upgrades(self) -> List[Dict]:
        """Get WvW upgrade information."""
        return self._request('wvw/upgrades', params={'ids': 'all'})
    
    # Guild Endpoints
    def get_guild(self, guild_id: str, public_only: bool = False, timeout: int = 3) -> Dict:
        """
        Get guild information by ID.

        Args:
            guild_id: The guild's UUID
            public_only: If True, fetch without auth to get public info only (name, tag, emblem)
            timeout: Request timeout in seconds (shorter for guilds to fail fast)
        """
        # Check cache first
        cache_key = f"{self.api_key_hash}:guild:{guild_id}"
        cached = _api_cache.get(cache_key)
        if cached is not None:
            return cached
        
        if public_only:
            # Fetch without authorization to get public guild info
            url = f"{self.BASE_URL}/guild/{guild_id}"
            start = time.time()
            try:
                response = requests.get(url, timeout=timeout)
                elapsed = time.time() - start
                response.raise_for_status()
                data = response.json()
                _api_cache.set(cache_key, data)
                logger.debug(f"guild/{guild_id[:8]} took {elapsed:.2f}s")
                return data
            except requests.Timeout:
                elapsed = time.time() - start
                logger.warning(f"guild/{guild_id[:8]} TIMEOUT after {elapsed:.2f}s")
                raise
            except Exception as e:
                elapsed = time.time() - start
                logger.debug(f"guild/{guild_id[:8]} ERROR after {elapsed:.2f}s: {e}")
                raise
        else:
            return self._request(f'guild/{guild_id}', timeout=timeout)
    
    def get_guilds(self, guild_ids: List[str], public_only: bool = True, max_workers: int = 10) -> List[Dict]:
        """
        Get multiple guilds information in parallel.
        Note: Guild endpoint doesn't support bulk queries, so we fetch individually with threading.
        
        Args:
            guild_ids: List of guild UUIDs
            public_only: If True, fetch without auth to get public info (name, tag, emblem).
                        If False, use auth and only get guilds you're a member of.
            max_workers: Number of parallel threads to use
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        guilds = []
        start_total = time.time()
        
        def fetch_one(guild_id):
            try:
                return self.get_guild(guild_id, public_only=public_only, timeout=3)
            except Exception as e:
                # Skip guilds that can't be fetched
                if '404' not in str(e):  # Only warn for non-404 errors
                    logger.warning(f"Could not fetch guild {guild_id[:8]}: {e}")
                return None

        # Fetch in parallel
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_id = {executor.submit(fetch_one, gid): gid for gid in guild_ids}
            for future in as_completed(future_to_id):
                result = future.result()
                if result:
                    guilds.append(result)

        elapsed = time.time() - start_total
        logger.debug(f"Fetched {len(guilds)}/{len(guild_ids)} guilds in {elapsed:.2f}s (parallel)")
        return guilds
    
    # Generic endpoint access
    def get(self, endpoint: str, params: Optional[Dict] = None) -> Union[Dict, List]:
        """
        Make a generic API request.
        
        Args:
            endpoint: API endpoint path
            params: Optional query parameters
            
        Returns:
            JSON response from the API
        """
        return self._request(endpoint, params)


class GW2Viewer:
    """Utility class for displaying GW2 API data in different formats."""
    
    @staticmethod
    def format_json(data: Any, indent: int = 2) -> str:
        """Format data as pretty JSON."""
        return json.dumps(data, indent=indent, ensure_ascii=False)
    
    @staticmethod
    def format_table(data: Union[List[Dict], Dict], headers: Optional[List[str]] = None) -> str:
        """
        Format data as a table.
        
        Args:
            data: Data to format (list of dicts or single dict)
            headers: Optional custom headers
            
        Returns:
            Formatted table string
        """
        if isinstance(data, dict):
            data = [data]
        
        if not data:
            return "No data to display"
        
        # Auto-detect headers if not provided
        if headers is None and data:
            headers = list(data[0].keys())
        
        # Extract values for each row
        rows = []
        for item in data:
            row = []
            for header in headers:
                value = item.get(header, 'N/A')
                # Handle nested structures
                if isinstance(value, (dict, list)):
                    value = json.dumps(value)
                row.append(value)
            rows.append(row)
        
        return tabulate(rows, headers=headers, tablefmt='grid')
    
    @staticmethod
    def format_summary(data: Dict, title: Optional[str] = None) -> str:
        """
        Format data as a key-value summary.
        
        Args:
            data: Dictionary to format
            title: Optional title for the summary
            
        Returns:
            Formatted summary string
        """
        lines = []
        
        if title:
            lines.append(f"{Fore.CYAN}{Style.BRIGHT}{title}{Style.RESET_ALL}")
            lines.append("=" * len(title))
        
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                value_str = json.dumps(value, indent=2)
            else:
                value_str = str(value)
            
            lines.append(f"{Fore.GREEN}{key}:{Style.RESET_ALL} {value_str}")
        
        return "\n".join(lines)
    
    @staticmethod
    def format_compact(data: Union[List, Dict]) -> str:
        """Format data in a compact, readable format."""
        if isinstance(data, list):
            items = []
            for i, item in enumerate(data, 1):
                if isinstance(item, dict):
                    # Show first few key fields
                    summary = ", ".join(f"{k}: {v}" for k, v in list(item.items())[:3])
                    items.append(f"{i}. {summary}")
                else:
                    items.append(f"{i}. {item}")
            return "\n".join(items)
        elif isinstance(data, dict):
            return GW2Viewer.format_summary(data)
        else:
            return str(data)
    
    @staticmethod
    def print_colored(text: str, color: str = Fore.WHITE, bright: bool = False):
        """Print colored text."""
        style = Style.BRIGHT if bright else ""
        print(f"{color}{style}{text}{Style.RESET_ALL}")
    
    @staticmethod
    def display(data: Any, format: str = 'json', **kwargs):
        """
        Display data in the specified format.
        
        Args:
            data: Data to display
            format: Display format ('json', 'table', 'summary', 'compact')
            **kwargs: Additional arguments for formatting
        """
        if format == 'json':
            print(GW2Viewer.format_json(data, kwargs.get('indent', 2)))
        elif format == 'table':
            print(GW2Viewer.format_table(data, kwargs.get('headers')))
        elif format == 'summary':
            print(GW2Viewer.format_summary(data, kwargs.get('title')))
        elif format == 'compact':
            print(GW2Viewer.format_compact(data))
        else:
            print(f"Unknown format: {format}")
            print(data)


# Convenience functions
def create_client(api_key: Optional[str] = None) -> GW2API:
    """Create a new GW2API client instance."""
    return GW2API(api_key)


def quick_view(endpoint: str, format: str = 'json', api_key: Optional[str] = None):
    """
    Quick view of an API endpoint.
    
    Args:
        endpoint: API endpoint to query
        format: Display format ('json', 'table', 'summary', 'compact')
        api_key: Optional API key
    """
    client = create_client(api_key)
    data = client.get(endpoint)
    GW2Viewer.display(data, format)


if __name__ == "__main__":
    # Example usage
    print(f"{Fore.CYAN}{Style.BRIGHT}Guild Wars 2 API Client{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}Import this module to use the API client{Style.RESET_ALL}")
    print(f"\nExample:")
    print(f"  from gw2api import GW2API, GW2Viewer")
    print(f"  client = GW2API()")
    print(f"  data = client.get_account()")
    print(f"  GW2Viewer.display(data, 'summary')")
