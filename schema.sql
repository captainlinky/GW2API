-- GW2API Multi-Tenant Database Schema
-- PostgreSQL database schema for multi-tenant WvW tracking system

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- User API Keys (encrypted GW2 API keys)
CREATE TABLE IF NOT EXISTS user_api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    api_key_encrypted TEXT NOT NULL,
    api_key_name VARCHAR(100) DEFAULT 'Default Key',
    permissions JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tracked Worlds (which worlds user wants to monitor)
CREATE TABLE IF NOT EXISTS user_tracked_worlds (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL,
    world_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, world_id)
);

-- K/D History Snapshots
CREATE TABLE IF NOT EXISTS kdr_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    red_kdr DECIMAL(10,2),
    green_kdr DECIMAL(10,2),
    blue_kdr DECIMAL(10,2),
    red_kills INTEGER,
    green_kills INTEGER,
    blue_kills INTEGER,
    red_deaths INTEGER,
    green_deaths INTEGER,
    blue_deaths INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kdr_user_match ON kdr_snapshots(user_id, match_id);
CREATE INDEX IF NOT EXISTS idx_kdr_timestamp ON kdr_snapshots(timestamp);

-- Activity History Snapshots
CREATE TABLE IF NOT EXISTS activity_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    red_objectives INTEGER,
    green_objectives INTEGER,
    blue_objectives INTEGER,
    red_types JSONB,
    green_types JSONB,
    blue_types JSONB
);

CREATE INDEX IF NOT EXISTS idx_activity_user_match ON activity_snapshots(user_id, match_id);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_snapshots(timestamp);

-- Guild Tracking Data
CREATE TABLE IF NOT EXISTS guild_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(100) NOT NULL,
    guild_name VARCHAR(100),
    guild_tag VARCHAR(10),
    team_color VARCHAR(10),
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    objective_types JSONB,
    maps_seen JSONB,
    UNIQUE(user_id, match_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_user_match ON guild_tracking(user_id, match_id);

-- User Settings (for custom alliance names, preferences, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    alliance_overrides JSONB DEFAULT '{}',
    team_names JSONB DEFAULT '{}',
    polling_config JSONB DEFAULT '{"dashboard": 60, "maps": 30}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Items table for Trading Post search (shared across all users)
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon TEXT,
    rarity VARCHAR(50),
    level INTEGER,
    type VARCHAR(100),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_worlds_user ON user_tracked_worlds(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_tracking_match ON guild_tracking(match_id);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_items_name_lower ON items(LOWER(name));
