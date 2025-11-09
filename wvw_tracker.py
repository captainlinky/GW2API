#!/usr/bin/env python3
"""
WvW Guild Tracker
Tracks guilds claiming objectives across the matchup week.
"""

import json
import os
import fcntl
from datetime import datetime, timedelta
from typing import Dict, List, Set
from pathlib import Path


class WvWTracker:
    """Track WvW guild claims across matchup weeks."""
    
    def __init__(self, data_dir: str = 'wvw_data'):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.current_match_file = self.data_dir / 'current_match.json'
    
    def _get_match_key(self, match_id: str) -> str:
        """Generate a unique key for a match."""
        return match_id
    
    def _load_match_data(self) -> Dict:
        """
        Load current match tracking data with file locking.
        
        Uses shared lock (LOCK_SH) to allow concurrent reads.
        Handles corrupted JSON files gracefully with error recovery.
        
        Returns:
            Dict: Match tracking data or empty dict if file missing/corrupted
        """
        if self.current_match_file.exists():
            try:
                with open(self.current_match_file, 'r') as f:
                    # Acquire shared lock for reading
                    fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                    try:
                        data = json.load(f)
                        return data
                    finally:
                        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            except (json.JSONDecodeError, IOError) as e:
                print(f"[WVW_TRACKER] Error loading match data: {e}")
                print(f"[WVW_TRACKER] Resetting corrupted match data file")
                return {}
        return {}
    
    def _save_match_data(self, data: Dict):
        """
        Save match tracking data with file locking.
        
        Uses exclusive lock (LOCK_EX) to prevent concurrent writes.
        Opens in r+ mode to avoid truncation before lock acquisition.
        Performs fsync for data integrity.
        
        Args:
            data: Match tracking dictionary to persist
        """
        try:
            # Open in r+ mode (or create if doesn't exist) to avoid truncation before lock
            mode = 'r+' if self.current_match_file.exists() else 'w'
            with open(self.current_match_file, mode) as f:
                # Acquire exclusive lock for writing
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.seek(0)
                    f.truncate()
                    json.dump(data, f, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except IOError as e:
            print(f"[WVW_TRACKER] Error saving match data: {e}")
    
    def update_match(self, match_data: Dict, world_id: int = None):
        """
        Update tracked data with new match information.
        
        Args:
            match_data: Match data from API (already enriched with guild info)
            world_id: Optional world ID if tracking specific world
        """
        match_id = match_data['id']
        current_time = datetime.utcnow().isoformat()
        
        # Load existing data
        tracked = self._load_match_data()
        
        # Cleanup old matches (older than 7 days to match matchup duration) periodically
        # Only cleanup if we have more than 2 tracked matches
        if len(tracked) > 2:
            self.cleanup_old_matches(days=7)
            tracked = self._load_match_data()  # Reload after cleanup
        
        # Check if this is a new match or continuation
        if match_id not in tracked:
            tracked[match_id] = {
                'match_id': match_id,
                'start_time': match_data.get('start_time'),
                'end_time': match_data.get('end_time'),
                'first_seen': current_time,
                'last_updated': current_time,
                'world_id': world_id,
                'teams': {
                    'red': {'main_world': None, 'linked_worlds': [], 'guilds': {}},
                    'green': {'main_world': None, 'linked_worlds': [], 'guilds': {}},
                    'blue': {'main_world': None, 'linked_worlds': [], 'guilds': {}}
                }
            }
        
        match_track = tracked[match_id]
        match_track['last_updated'] = current_time
        
        # Update team information
        for color in ['red', 'green', 'blue']:
            if color in match_data.get('worlds', {}):
                team_info = match_data['worlds'][color]
                match_track['teams'][color]['main_world'] = team_info.get('main_world_name')
                match_track['teams'][color]['main_world_id'] = team_info.get('main_world_id')
                match_track['teams'][color]['display_name'] = team_info.get('display_name', team_info.get('main_world_name'))
                match_track['teams'][color]['linked_worlds'] = [
                    {'id': w['id'], 'name': w['name']} 
                    for w in team_info.get('linked_worlds', [])
                ]
        
        # Track guild claims - track all unique guilds that have claimed objectives
        # This builds a comprehensive list without incrementing counters
        for map_data in match_data.get('maps', []):
            map_type = map_data['type']
            
            for obj in map_data.get('objectives', []):
                if obj.get('claimed_by') and obj.get('guild_name'):
                    guild_id = obj['claimed_by']
                    owner = obj['owner'].lower()
                    
                    if owner in ['red', 'green', 'blue']:
                        guilds = match_track['teams'][owner]['guilds']
                        
                        if guild_id not in guilds:
                            # New guild discovered - add to tracking
                            guilds[guild_id] = {
                                'id': guild_id,
                                'name': obj['guild_name'],
                                'tag': obj.get('guild_tag', ''),
                                'first_seen': current_time,
                                'last_seen': current_time,
                                'objective_types': [],
                                'maps_seen': []
                            }
                        
                        guild = guilds[guild_id]
                        guild['last_seen'] = current_time
                        
                        # Add to lists if not already present
                        obj_type = obj.get('type', 'Unknown')
                        if obj_type not in guild['objective_types']:
                            guild['objective_types'].append(obj_type)
                        
                        if map_type not in guild['maps_seen']:
                            guild['maps_seen'].append(map_type)
        
        # Save updated data
        self._save_match_data(tracked)
        
        return match_track
    
    def get_match_summary(self, match_id: str) -> Dict:
        """Get summary of tracked data for a match."""
        tracked = self._load_match_data()
        return tracked.get(match_id, {})
    
    def get_guilds_by_team(self, match_id: str, team: str) -> List[Dict]:
        """
        Get all guilds for a specific team, sorted by claim count.
        
        Args:
            match_id: Match ID
            team: 'red', 'green', or 'blue'
        """
        match_data = self.get_match_summary(match_id)
        if not match_data or team not in match_data.get('teams', {}):
            return []
        
        guilds = list(match_data['teams'][team]['guilds'].values())
        # Sort by name alphabetically
        guilds.sort(key=lambda g: g.get('name', '').lower())
        return guilds
    
    def get_all_guilds_sorted(self, match_id: str) -> Dict[str, List[Dict]]:
        """Get all guilds organized by team."""
        return {
            'red': self.get_guilds_by_team(match_id, 'red'),
            'green': self.get_guilds_by_team(match_id, 'green'),
            'blue': self.get_guilds_by_team(match_id, 'blue')
        }
    
    def cleanup_old_matches(self, days: int = 7):
        """Remove match data older than specified days (default 7 for matchup duration)."""
        tracked = self._load_match_data()
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        to_remove = []
        for match_id, match_data in tracked.items():
            if match_data.get('end_time'):
                try:
                    end_time = datetime.fromisoformat(match_data['end_time'].replace('Z', '+00:00'))
                    # Make both timezone-naive for comparison
                    end_time_naive = end_time.replace(tzinfo=None)
                    if end_time_naive < cutoff:
                        to_remove.append(match_id)
                except (ValueError, AttributeError):
                    # Skip invalid dates
                    pass
        
        for match_id in to_remove:
            del tracked[match_id]
        
        self._save_match_data(tracked)
        return len(to_remove)
    
    def get_active_matches(self) -> List[str]:
        """Get list of currently tracked match IDs."""
        tracked = self._load_match_data()
        return list(tracked.keys())
    
    def is_match_current(self, match_id: str) -> bool:
        """Check if a match is currently active (not expired)."""
        match_data = self.get_match_summary(match_id)
        if not match_data or not match_data.get('end_time'):
            return False
        
        try:
            end_time = datetime.fromisoformat(match_data['end_time'].replace('Z', '+00:00'))
            # Make both timezone-naive for comparison
            end_time_naive = end_time.replace(tzinfo=None)
            return datetime.utcnow() < end_time_naive
        except (ValueError, AttributeError):
            return False
    
    def get_current_match_id(self) -> str:
        """Get the match ID that is currently active (not expired)."""
        tracked = self._load_match_data()
        for match_id, match_data in tracked.items():
            if match_data.get('end_time'):
                try:
                    end_time = datetime.fromisoformat(match_data['end_time'].replace('Z', '+00:00'))
                    # Make both timezone-naive for comparison
                    end_time_naive = end_time.replace(tzinfo=None)
                    if datetime.utcnow() < end_time_naive:
                        return match_id
                except (ValueError, AttributeError):
                    pass
        return None
