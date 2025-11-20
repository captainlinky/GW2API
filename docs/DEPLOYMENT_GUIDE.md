# GW2API Multi-Tenant Deployment Guide

**Purpose**: Transform the single-user GW2API Flask application into a multi-tenant cloud service with authentication, encrypted API key storage, and PostgreSQL database backend.

**Target Environment**: Ubuntu VPS (AWS, DigitalOcean, Linode, etc.)

**Current State**: 
- Flask app with single API key in `.env`
- JSON file-based persistence (`kdr_history.json`, `activity_history.json`, `wvw_data/current_match.json`)
- No authentication or user management
- Single background tracking thread

**Goal State**:
- Multi-user system with JWT authentication
- PostgreSQL database with user-scoped data
- Encrypted GW2 API key storage per user
- Git-based deployment workflow
- HTTPS with reverse proxy (nginx)
- Systemd service management

---

## Phase 1: Database Setup and Migration

### Task 1.1: Install PostgreSQL

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo -u postgres psql --version
```

### Task 1.2: Create Database and User

```bash
# Switch to postgres user and create database
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE DATABASE gw2api;
CREATE USER gw2api_user WITH PASSWORD 'GENERATE_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE gw2api TO gw2api_user;
\q
```

**Important**: Generate a strong password and save it for the `.env.production` file.

### Task 1.3: Create Database Schema

Create a new file `/opt/gw2api/app/schema.sql`:

```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- User API Keys (encrypted GW2 API keys)
CREATE TABLE user_api_keys (
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
CREATE TABLE user_tracked_worlds (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    world_id INTEGER NOT NULL,
    world_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, world_id)
);

-- K/D History Snapshots
CREATE TABLE kdr_snapshots (
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

CREATE INDEX idx_kdr_user_match ON kdr_snapshots(user_id, match_id);
CREATE INDEX idx_kdr_timestamp ON kdr_snapshots(timestamp);

-- Activity History Snapshots
CREATE TABLE activity_snapshots (
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

CREATE INDEX idx_activity_user_match ON activity_snapshots(user_id, match_id);
CREATE INDEX idx_activity_timestamp ON activity_snapshots(timestamp);

-- Guild Tracking Data
CREATE TABLE guild_tracking (
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

CREATE INDEX idx_guild_user_match ON guild_tracking(user_id, match_id);

-- User Settings (for custom alliance names, preferences, etc.)
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    alliance_overrides JSONB DEFAULT '{}',
    team_names JSONB DEFAULT '{}',
    polling_config JSONB DEFAULT '{"dashboard": 60, "maps": 30}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

Apply the schema:
```bash
sudo -u postgres psql gw2api < /opt/gw2api/app/schema.sql
```

### Task 1.4: Update requirements.txt

Add these dependencies to `requirements.txt`:

```
requests>=2.31.0
tabulate>=0.9.0
colorama>=0.4.6
python-dotenv>=1.0.0
flask>=3.0.0
flask-cors>=4.0.0

# New dependencies for multi-tenant
psycopg2-binary>=2.9.9
SQLAlchemy>=2.0.23
Flask-Login>=0.6.3
PyJWT>=2.8.0
bcrypt>=4.1.2
cryptography>=41.0.0
Flask-Limiter>=3.5.0
```

---

## Phase 2: Authentication and Security Layer

### Task 2.1: Create Database Connection Module

Create file `database.py`:

```python
"""Database connection and query utilities."""
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL')

@contextmanager
def get_db_connection():
    """Context manager for database connections."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def query_one(sql, params=None):
    """Execute query and return single result."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()

def query_all(sql, params=None):
    """Execute query and return all results."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()

def execute(sql, params=None):
    """Execute query without returning results."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.rowcount
```

### Task 2.2: Create Encryption Utilities

Create file `crypto_utils.py`:

```python
"""Encryption utilities for API key storage."""
import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

# Get encryption key from environment
ENCRYPTION_KEY = os.environ.get('API_KEY_ENCRYPTION_KEY')
if not ENCRYPTION_KEY:
    raise ValueError("API_KEY_ENCRYPTION_KEY not set in environment")

cipher = Fernet(ENCRYPTION_KEY.encode())

def encrypt_api_key(api_key: str) -> str:
    """
    Encrypt a GW2 API key for secure storage.
    
    Args:
        api_key: Plain text GW2 API key
        
    Returns:
        Encrypted API key as string
    """
    return cipher.encrypt(api_key.encode()).decode()

def decrypt_api_key(encrypted_key: str) -> str:
    """
    Decrypt a stored GW2 API key.
    
    Args:
        encrypted_key: Encrypted API key from database
        
    Returns:
        Plain text GW2 API key
    """
    return cipher.decrypt(encrypted_key.encode()).decode()

def get_user_api_key(user_id: int) -> str:
    """
    Get and decrypt user's primary API key.
    
    Args:
        user_id: User ID
        
    Returns:
        Decrypted GW2 API key or None if not found
    """
    from database import query_one
    
    result = query_one(
        "SELECT api_key_encrypted FROM user_api_keys WHERE user_id = %s AND is_active = TRUE LIMIT 1",
        (user_id,)
    )
    
    if result:
        return decrypt_api_key(result['api_key_encrypted'])
    return None
```

**Generate encryption key**:
```python
# Run this once to generate the key, save output to .env
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

### Task 2.3: Create Authentication Module

Create file `auth.py`:

```python
"""Authentication and authorization utilities."""
import os
import jwt
import bcrypt
from functools import wraps
from datetime import datetime, timedelta
from flask import request, jsonify
from database import query_one, execute
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY not set in environment")

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def generate_token(user_id: int, expiry_days: int = 7) -> str:
    """
    Generate a JWT token for a user.
    
    Args:
        user_id: User ID
        expiry_days: Token validity period in days
        
    Returns:
        JWT token string
    """
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=expiry_days),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        Decoded token payload
        
    Raises:
        jwt.ExpiredSignatureError: Token has expired
        jwt.InvalidTokenError: Token is invalid
    """
    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])

def require_auth(f):
    """
    Decorator to require authentication on routes.
    
    Extracts JWT token from Authorization header, validates it,
    and injects user_id into request object.
    
    Usage:
        @app.route('/api/protected')
        @require_auth
        def protected_route():
            user_id = request.user_id
            # ... handle request
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'status': 'error', 'message': 'No authentication token provided'}), 401
        
        try:
            # Remove 'Bearer ' prefix if present
            if token.startswith('Bearer '):
                token = token[7:]
            
            # Decode and validate token
            payload = decode_token(token)
            request.user_id = payload['user_id']
            
            # Update last_login timestamp
            execute(
                "UPDATE users SET last_login = NOW() WHERE id = %s",
                (request.user_id,)
            )
            
        except jwt.ExpiredSignatureError:
            return jsonify({'status': 'error', 'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'status': 'error', 'message': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    
    return decorated

def create_user(email: str, password: str) -> dict:
    """
    Create a new user account.
    
    Args:
        email: User email
        password: Plain text password
        
    Returns:
        Dictionary with user_id and token
        
    Raises:
        ValueError: If email already exists
    """
    # Check if email already exists
    existing = query_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        raise ValueError("Email already registered")
    
    # Hash password and create user
    password_hash = hash_password(password)
    
    user = query_one(
        "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
        (email, password_hash)
    )
    
    user_id = user['id']
    
    # Create default settings
    execute(
        "INSERT INTO user_settings (user_id) VALUES (%s)",
        (user_id,)
    )
    
    # Generate token
    token = generate_token(user_id)
    
    return {
        'user_id': user_id,
        'token': token,
        'email': email
    }

def authenticate_user(email: str, password: str) -> dict:
    """
    Authenticate a user with email and password.
    
    Args:
        email: User email
        password: Plain text password
        
    Returns:
        Dictionary with user_id and token
        
    Raises:
        ValueError: If credentials are invalid
    """
    user = query_one(
        "SELECT id, password_hash, is_active FROM users WHERE email = %s",
        (email,)
    )
    
    if not user:
        raise ValueError("Invalid email or password")
    
    if not user['is_active']:
        raise ValueError("Account is disabled")
    
    if not verify_password(password, user['password_hash']):
        raise ValueError("Invalid email or password")
    
    # Generate token
    token = generate_token(user['id'])
    
    return {
        'user_id': user['id'],
        'token': token,
        'email': email
    }
```

### Task 2.4: Add Authentication Routes to app.py

Add these routes to `app.py`:

```python
from auth import require_auth, create_user, authenticate_user
from crypto_utils import encrypt_api_key, get_user_api_key
from database import query_one, query_all, execute

# Registration endpoint
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user account."""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'status': 'error', 'message': 'Email and password required'}), 400
        
        if len(password) < 8:
            return jsonify({'status': 'error', 'message': 'Password must be at least 8 characters'}), 400
        
        result = create_user(email, password)
        
        return jsonify({
            'status': 'success',
            'data': {
                'token': result['token'],
                'user_id': result['user_id'],
                'email': result['email']
            }
        })
        
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Registration failed'}), 500

# Login endpoint
@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    try:
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

# Add/update GW2 API key for user
@app.route('/api/user/api-key', methods=['POST'])
@require_auth
def add_user_api_key():
    """Add or update user's GW2 API key."""
    try:
        user_id = request.user_id
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
        
        # Encrypt and store
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
```

---

## Phase 3: Update Existing Routes for Multi-Tenancy

### Task 3.1: Modify Existing Routes

Update all existing routes that access data to:
1. Add `@require_auth` decorator
2. Use `request.user_id` to scope data queries
3. Use `get_user_api_key(user_id)` instead of environment variable

**Example - Update account route**:

```python
# OLD VERSION:
@app.route('/api/account')
def get_account():
    """Get account information."""
    api_key = get_current_api_key()
    if not api_key:
        return jsonify({'status': 'error', 'message': 'API key required'}), 401
    
    try:
        client = GW2API(api_key=api_key)
        account = client.get_account()
        return jsonify({'status': 'success', 'data': account})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# NEW VERSION:
@app.route('/api/account')
@require_auth
def get_account():
    """Get account information."""
    user_id = request.user_id
    api_key = get_user_api_key(user_id)
    
    if not api_key:
        return jsonify({'status': 'error', 'message': 'No API key configured'}), 400
    
    try:
        client = GW2API(api_key=api_key)
        account = client.get_account()
        return jsonify({'status': 'success', 'data': account})
    except Exception as e:
        logger.error(f"Error fetching account for user {user_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

### Task 3.2: Update K/D Tracking Routes

Replace JSON file operations with database queries:

```python
@app.route('/api/wvw/kdr/<world_id>')
@require_auth
def get_wvw_kdr_history(world_id):
    """Get K/D ratio history for a world - user-scoped."""
    user_id = request.user_id
    
    try:
        api_key = get_user_api_key(user_id)
        if not api_key:
            return jsonify({'status': 'error', 'message': 'No API key configured'}), 400
        
        client = GW2API(api_key=api_key)
        match = client.get_wvw_match_by_world(int(world_id))
        
        if not match:
            return jsonify({'status': 'error', 'message': 'World not found in active matches'}), 404
        
        match_id = match['id']
        
        # Fetch user's K/D history from database
        snapshots = query_all(
            """
            SELECT timestamp, red_kdr, green_kdr, blue_kdr,
                   red_kills, green_kills, blue_kills,
                   red_deaths, green_deaths, blue_deaths
            FROM kdr_snapshots
            WHERE user_id = %s AND match_id = %s
            ORDER BY timestamp ASC
            """,
            (user_id, match_id)
        )
        
        # Convert to expected format
        timeline = [{
            'timestamp': s['timestamp'].isoformat() + 'Z',
            'red_kdr': float(s['red_kdr']) if s['red_kdr'] else 0,
            'green_kdr': float(s['green_kdr']) if s['green_kdr'] else 0,
            'blue_kdr': float(s['blue_kdr']) if s['blue_kdr'] else 0,
            'red_kills': s['red_kills'],
            'green_kills': s['green_kills'],
            'blue_kills': s['blue_kills'],
            'red_deaths': s['red_deaths'],
            'green_deaths': s['green_deaths'],
            'blue_deaths': s['blue_deaths']
        } for s in snapshots]
        
        # Get current K/D
        current_kdr = {
            'red': match['kills']['red'] / max(match['deaths']['red'], 1),
            'green': match['kills']['green'] / max(match['deaths']['green'], 1),
            'blue': match['kills']['blue'] / max(match['deaths']['blue'], 1)
        }
        
        return jsonify({
            'status': 'success',
            'data': {
                'match_id': match_id,
                'current_kdr': current_kdr,
                'timeline': timeline
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching K/D history: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
```

### Task 3.3: Update Background Tracking Thread

Modify `kdr_tracking_loop()` to track all active users:

```python
def global_tracking_loop():
    """
    Background thread that tracks WvW data for all active users.
    
    Runs every 15 minutes and updates K/D and activity snapshots
    for users who have tracked worlds.
    """
    logger.info("[TRACKING] Starting global tracking thread")
    
    while True:
        try:
            # Get all users with tracked worlds that were active in last 24 hours
            active_tracking = query_all("""
                SELECT DISTINCT 
                    u.id as user_id,
                    utw.world_id,
                    utw.world_name
                FROM users u
                JOIN user_tracked_worlds utw ON u.id = utw.user_id
                WHERE u.is_active = TRUE 
                  AND utw.is_active = TRUE
                  AND u.last_login > NOW() - INTERVAL '24 hours'
            """)
            
            logger.info(f"[TRACKING] Processing {len(active_tracking)} user-world pairs")
            
            for tracking in active_tracking:
                user_id = tracking['user_id']
                world_id = tracking['world_id']
                
                try:
                    # Get user's API key
                    api_key = get_user_api_key(user_id)
                    if not api_key:
                        logger.warning(f"[TRACKING] User {user_id} has no API key")
                        continue
                    
                    client = GW2API(api_key=api_key)
                    match = client.get_wvw_match_by_world(world_id)
                    
                    if not match:
                        logger.warning(f"[TRACKING] No match found for world {world_id}")
                        continue
                    
                    match_id = match['id']
                    
                    # Record K/D snapshot
                    record_kdr_snapshot_db(user_id, match_id, match)
                    
                    # Record activity snapshot
                    record_activity_snapshot_db(user_id, match_id, match)
                    
                    # Update guild tracking
                    update_guild_tracking_db(user_id, match_id, match, client)
                    
                    logger.info(f"[TRACKING] Updated data for user {user_id}, world {world_id}")
                    
                except Exception as e:
                    logger.error(f"[TRACKING] Error processing user {user_id}: {e}", exc_info=True)
                    continue
            
            logger.info("[TRACKING] Cycle complete, sleeping 15 minutes")
            time.sleep(900)  # 15 minutes
            
        except Exception as e:
            logger.error(f"[TRACKING] Error in tracking loop: {e}", exc_info=True)
            time.sleep(900)

def record_kdr_snapshot_db(user_id, match_id, match):
    """Record K/D snapshot to database."""
    try:
        red_kdr = match['kills']['red'] / max(match['deaths']['red'], 1)
        green_kdr = match['kills']['green'] / max(match['deaths']['green'], 1)
        blue_kdr = match['kills']['blue'] / max(match['deaths']['blue'], 1)
        
        execute(
            """
            INSERT INTO kdr_snapshots 
            (user_id, match_id, timestamp, red_kdr, green_kdr, blue_kdr,
             red_kills, green_kills, blue_kills, red_deaths, green_deaths, blue_deaths)
            VALUES (%s, %s, NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id, match_id,
                red_kdr, green_kdr, blue_kdr,
                match['kills']['red'], match['kills']['green'], match['kills']['blue'],
                match['deaths']['red'], match['deaths']['green'], match['deaths']['blue']
            )
        )
        
        # Clean up old data (older than 7 days)
        execute(
            """
            DELETE FROM kdr_snapshots 
            WHERE user_id = %s AND timestamp < NOW() - INTERVAL '7 days'
            """,
            (user_id,)
        )
        
        logger.info(f"[KDR] Recorded snapshot for user {user_id}, match {match_id}")
        
    except Exception as e:
        logger.error(f"[KDR] Error recording snapshot: {e}", exc_info=True)

def record_activity_snapshot_db(user_id, match_id, match):
    """Record activity snapshot to database."""
    try:
        # Count objectives by team
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
        
        execute(
            """
            INSERT INTO activity_snapshots
            (user_id, match_id, timestamp, red_objectives, green_objectives, blue_objectives,
             red_types, green_types, blue_types)
            VALUES (%s, %s, NOW(), %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            """,
            (
                user_id, match_id,
                team_objectives['red'], team_objectives['green'], team_objectives['blue'],
                json.dumps(team_types['red']), json.dumps(team_types['green']), json.dumps(team_types['blue'])
            )
        )
        
        # Clean up old data
        execute(
            """
            DELETE FROM activity_snapshots
            WHERE user_id = %s AND timestamp < NOW() - INTERVAL '7 days'
            """,
            (user_id,)
        )
        
        logger.info(f"[ACTIVITY] Recorded snapshot for user {user_id}, match {match_id}")
        
    except Exception as e:
        logger.error(f"[ACTIVITY] Error recording snapshot: {e}", exc_info=True)
```

---

## Phase 4: Frontend Updates

### Task 4.1: Update static/app.js for Authentication

Add token management to the frontend:

```javascript
// Add at top of app.js

// Token management
const AuthManager = {
    getToken: () => localStorage.getItem('auth_token'),
    setToken: (token) => localStorage.setItem('auth_token', token),
    clearToken: () => localStorage.removeItem('auth_token'),
    isAuthenticated: () => !!AuthManager.getToken()
};

// Add authentication header to all API requests
async function authenticatedFetch(url, options = {}) {
    const token = AuthManager.getToken();
    
    if (!token) {
        throw new Error('Not authenticated');
    }
    
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    
    const response = await fetch(url, { ...options, headers });
    
    // Handle 401 - token expired
    if (response.status === 401) {
        AuthManager.clearToken();
        showLoginForm();
        throw new Error('Session expired, please login again');
    }
    
    return response;
}

// Replace all fetch() calls with authenticatedFetch()
// Example:
async function loadAccountData() {
    try {
        const response = await authenticatedFetch('/api/account');
        const data = await response.json();
        // ... handle response
    } catch (error) {
        console.error('Error loading account:', error);
    }
}
```

### Task 4.2: Add Login/Register UI

Add to `templates/index.html` before the main content:

```html
<!-- Login/Register Modal -->
<div id="auth-modal" class="modal" style="display: none;">
    <div class="modal-content">
        <h2 id="auth-title">Login</h2>
        
        <div id="login-form" class="auth-form">
            <input type="email" id="login-email" placeholder="Email" />
            <input type="password" id="login-password" placeholder="Password" />
            <button onclick="handleLogin()">Login</button>
            <p>Don't have an account? <a href="#" onclick="showRegisterForm()">Register</a></p>
        </div>
        
        <div id="register-form" class="auth-form" style="display: none;">
            <input type="email" id="register-email" placeholder="Email" />
            <input type="password" id="register-password" placeholder="Password (min 8 characters)" />
            <input type="password" id="register-confirm" placeholder="Confirm Password" />
            <button onclick="handleRegister()">Register</button>
            <p>Already have an account? <a href="#" onclick="showLoginForm()">Login</a></p>
        </div>
        
        <div id="auth-error" class="error-message" style="display: none;"></div>
    </div>
</div>

<!-- Add to app.js -->
<script>
function showLoginForm() {
    document.getElementById('auth-modal').style.display = 'block';
    document.getElementById('auth-title').textContent = 'Login';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('auth-title').textContent = 'Register';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            AuthManager.setToken(data.data.token);
            document.getElementById('auth-modal').style.display = 'none';
            // Reload app
            location.reload();
        } else {
            showAuthError(data.message);
        }
    } catch (error) {
        showAuthError('Login failed: ' + error.message);
    }
}

async function handleRegister() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    
    if (password !== confirm) {
        showAuthError('Passwords do not match');
        return;
    }
    
    if (password.length < 8) {
        showAuthError('Password must be at least 8 characters');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            AuthManager.setToken(data.data.token);
            document.getElementById('auth-modal').style.display = 'none';
            // Reload app
            location.reload();
        } else {
            showAuthError(data.message);
        }
    } catch (error) {
        showAuthError('Registration failed: ' + error.message);
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Check authentication on page load
window.addEventListener('DOMContentLoaded', () => {
    if (!AuthManager.isAuthenticated()) {
        showLoginForm();
    }
});
</script>
```

---

## Phase 5: VPS Deployment Setup

### Task 5.1: System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx git

# Create application user
sudo useradd -m -s /bin/bash gw2api
sudo usermod -aG sudo gw2api

# Create application directory
sudo mkdir -p /opt/gw2api
sudo chown gw2api:gw2api /opt/gw2api
```

### Task 5.2: Clone Repository

```bash
# Switch to gw2api user
sudo su - gw2api

# Clone repository
cd /opt/gw2api
git clone YOUR_REPO_URL app
cd app

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Task 5.3: Create Production Environment File

Create `/opt/gw2api/app/.env.production`:

```bash
# Database
DATABASE_URL=postgresql://gw2api_user:YOUR_PASSWORD@localhost/gw2api

# Security (generate these with secure random values)
JWT_SECRET_KEY=<generate-with-secrets-token-hex-32>
API_KEY_ENCRYPTION_KEY=<generate-with-fernet-generate-key>
SECRET_KEY=<generate-with-secrets-token-hex-32>

# Flask
FLASK_ENV=production
FLASK_DEBUG=False

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60

# Server
HOST=0.0.0.0
PORT=5555
```

**Generate secure keys**:
```python
import secrets
from cryptography.fernet import Fernet

print("JWT_SECRET_KEY:", secrets.token_hex(32))
print("SECRET_KEY:", secrets.token_hex(32))
print("API_KEY_ENCRYPTION_KEY:", Fernet.generate_key().decode())
```

### Task 5.4: Create Systemd Service

Create `/etc/systemd/system/gw2api.service`:

```ini
[Unit]
Description=GW2API Multi-Tenant Service
After=network.target postgresql.service

[Service]
Type=simple
User=gw2api
Group=gw2api
WorkingDirectory=/opt/gw2api/app
Environment="PATH=/opt/gw2api/app/venv/bin"
EnvironmentFile=/opt/gw2api/app/.env.production
ExecStart=/opt/gw2api/app/venv/bin/python3 /opt/gw2api/app/app.py
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/gw2api/logs/app.log
StandardError=append:/opt/gw2api/logs/error.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo mkdir -p /opt/gw2api/logs
sudo chown gw2api:gw2api /opt/gw2api/logs

sudo systemctl daemon-reload
sudo systemctl enable gw2api
sudo systemctl start gw2api
sudo systemctl status gw2api
```

### Task 5.5: Configure Nginx Reverse Proxy (Modular Multi-Service Setup)

**Overview**: This configuration supports multiple services on different paths (e.g., `/gw2`, `/api2`, etc.) on the same domain, making it easy to add more services later.

#### Option A: Path-Based Routing (Recommended for Multiple Services)

This approach serves your GW2API at `your-domain.com/gw2/` and leaves the root and other paths available for future services.

Create `/etc/nginx/sites-available/your-domain`:

```nginx
# Main server block - serves multiple applications on different paths
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;  # Replace with your domain
    
    # This will be automatically updated by certbot to redirect to HTTPS
    # After SSL setup, HTTP requests will redirect to HTTPS
    
    # Root location - you can serve a landing page or redirect
    location = / {
        # Option 1: Redirect to main service
        return 301 /gw2/;
        
        # Option 2: Serve a landing page (uncomment and create /var/www/landing)
        # root /var/www/landing;
        # index index.html;
    }
    
    # GW2API Service - served at /gw2
    location /gw2/ {
        # Remove /gw2 prefix before passing to backend
        rewrite ^/gw2/(.*) /$1 break;
        
        proxy_pass http://127.0.0.1:5555;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /gw2;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files for GW2API (if served separately)
    location /gw2/static/ {
        alias /opt/gw2api/app/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # === FUTURE SERVICES - Add them here ===
    # 
    # Example: Another service on port 5556
    # location /service2/ {
    #     rewrite ^/service2/(.*) /$1 break;
    #     proxy_pass http://127.0.0.1:5556;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    #     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #     proxy_set_header X-Forwarded-Proto $scheme;
    #     proxy_set_header X-Forwarded-Prefix /service2;
    # }
    #
    # Example: API service on port 8000
    # location /api/ {
    #     rewrite ^/api/(.*) /$1 break;
    #     proxy_pass http://127.0.0.1:8000;
    #     proxy_set_header Host $host;
    #     proxy_set_header X-Real-IP $remote_addr;
    # }
}
```

**Update Flask app.py to handle path prefix**:

Add this near the top of `app.py` after Flask initialization:

```python
# Support for reverse proxy path prefix
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Get the application prefix from environment or default to empty
APP_PREFIX = os.environ.get('APP_PREFIX', '').rstrip('/')
if APP_PREFIX:
    logger.info(f"Application running with prefix: {APP_PREFIX}")
    
# Update any absolute URLs in your templates/responses to include prefix
# For example, in index.html, update links:
# <a href="/api/account"> becomes <a href="{{ prefix }}/api/account">
```

Add to `.env.production`:
```bash
APP_PREFIX=/gw2
```

#### Option B: Subdomain Routing (Alternative Approach)

If you prefer subdomains (e.g., `gw2.your-domain.com`, `service2.your-domain.com`):

Create `/etc/nginx/sites-available/your-domain-services`:

```nginx
# GW2API on subdomain
server {
    listen 80;
    server_name gw2.your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:5555;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Future service on another subdomain
# server {
#     listen 80;
#     server_name service2.your-domain.com;
#     
#     location / {
#         proxy_pass http://127.0.0.1:5556;
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#     }
# }
```

With subdomains, you don't need the `APP_PREFIX` configuration.

#### Enable the Configuration

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/your-domain /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# If test passes, restart nginx
sudo systemctl restart nginx
```

### Task 5.6: Set Up SSL with Let's Encrypt

#### For Path-Based Routing (Option A):

```bash
# Obtain SSL certificate for main domain
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot will automatically:
# - Obtain certificate
# - Update nginx config to use HTTPS
# - Set up HTTP -> HTTPS redirect
# - Configure auto-renewal

# Test auto-renewal
sudo certbot renew --dry-run
```

#### For Subdomain Routing (Option B):

```bash
# Obtain certificates for each subdomain
sudo certbot --nginx -d gw2.your-domain.com

# Later, add more subdomains:
# sudo certbot --nginx -d service2.your-domain.com

# Or get wildcard certificate (requires DNS validation):
# sudo certbot certonly --manual --preferred-challenges dns \
#   -d your-domain.com -d *.your-domain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Task 5.7: Nginx Configuration Management

Create a helper script `/opt/gw2api/scripts/nginx-add-service.sh` for adding new services:

```bash
#!/bin/bash
# Helper script to add a new service to nginx configuration

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <service-name> <port> <path-prefix>"
    echo "Example: $0 myapi 5556 /api2"
    exit 1
fi

SERVICE_NAME=$1
PORT=$2
PATH_PREFIX=$3

echo "Adding service '$SERVICE_NAME' on port $PORT at path $PATH_PREFIX"

# Backup current config
sudo cp /etc/nginx/sites-available/your-domain /etc/nginx/sites-available/your-domain.backup

# Add new location block (you'll need to edit this manually or use sed)
echo ""
echo "Add this to your nginx config at /etc/nginx/sites-available/your-domain:"
echo ""
cat << EOF
    # $SERVICE_NAME - Port $PORT
    location $PATH_PREFIX/ {
        rewrite ^$PATH_PREFIX/(.*) /\$1 break;
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Prefix $PATH_PREFIX;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
EOF
echo ""
echo "After adding, run:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
```

Make executable:
```bash
chmod +x /opt/gw2api/scripts/nginx-add-service.sh
```

### Task 5.8: Testing the Configuration

```bash
# Test nginx configuration syntax
sudo nginx -t

# Check which ports are in use
sudo netstat -tlnp | grep -E ':(80|443|5555)'

# Test HTTP endpoint (before SSL)
curl http://your-domain.com/gw2/api/status

# Test HTTPS endpoint (after SSL)
curl https://your-domain.com/gw2/api/status

# View nginx access logs
sudo tail -f /var/log/nginx/access.log

# View nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Quick Reference: Adding a New Service

When you're ready to add another service in the future:

1. **Deploy your new service** on a different port (e.g., 5556)

2. **Edit nginx config**:
```bash
sudo nano /etc/nginx/sites-available/your-domain
```

3. **Add new location block** (copy the GW2API section and modify):
```nginx
location /newservice/ {
    rewrite ^/newservice/(.*) /$1 break;
    proxy_pass http://127.0.0.1:5556;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /newservice;
}
```

4. **Test and reload**:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

5. **Access at**: `https://your-domain.com/newservice/`

That's it! No need to modify SSL certificates or main server configuration.

---

## Phase 6: Git-Based Deployment Workflow

### Task 6.1: Create Deployment Script

Create `/opt/gw2api/app/deploy.sh`:

```bash
#!/bin/bash

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Navigate to app directory
cd /opt/gw2api/app

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git pull origin main

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# Run database migrations (if you add a migration system later)
# flask db upgrade

# Restart service
echo "♻️  Restarting application..."
sudo systemctl restart gw2api

# Wait a moment and check status
sleep 2
if sudo systemctl is-active --quiet gw2api; then
    echo "✅ Deployment successful!"
    echo "📊 Service status:"
    sudo systemctl status gw2api --no-pager
else
    echo "❌ Deployment failed - service did not start"
    echo "📋 Check logs:"
    echo "  sudo journalctl -u gw2api -n 50"
    exit 1
fi

echo "🎉 Deployment complete!"
```

Make executable:
```bash
chmod +x /opt/gw2api/app/deploy.sh
```

### Task 6.2: Set Up GitHub Webhook (Optional)

If you want automatic deployments on push:

1. Install webhook receiver:
```bash
sudo apt install webhook
```

2. Create `/opt/gw2api/hooks.json`:
```json
[
  {
    "id": "deploy-gw2api",
    "execute-command": "/opt/gw2api/app/deploy.sh",
    "command-working-directory": "/opt/gw2api/app",
    "pass-arguments-to-command": [],
    "trigger-rule": {
      "and": [
        {
          "match": {
            "type": "payload-hash-sha1",
            "secret": "YOUR_WEBHOOK_SECRET",
            "parameter": {
              "source": "header",
              "name": "X-Hub-Signature"
            }
          }
        },
        {
          "match": {
            "type": "value",
            "value": "refs/heads/main",
            "parameter": {
              "source": "payload",
              "name": "ref"
            }
          }
        }
      ]
    }
  }
]
```

3. Run webhook service:
```bash
webhook -hooks /opt/gw2api/hooks.json -verbose
```

4. Configure GitHub webhook:
   - Go to your repo → Settings → Webhooks
   - Add webhook URL: `http://your-domain.com:9000/hooks/deploy-gw2api`
   - Secret: Same as in hooks.json
   - Content type: application/json
   - Events: Just push

### Task 6.3: Manual Deployment Process

For manual deployments:

```bash
# SSH into your VPS
ssh gw2api@your-domain.com

# Run deployment script
cd /opt/gw2api/app
./deploy.sh

# Or deploy manually:
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart gw2api
```

---

## Phase 7: Testing and Verification

### Task 7.1: Test Authentication

```bash
# Register a new user
curl -X POST http://localhost:5555/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'

# Should return:
# {"status": "success", "data": {"token": "...", "user_id": 1, "email": "test@example.com"}}

# Login
curl -X POST http://localhost:5555/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'

# Save the token for next requests
TOKEN="<token-from-response>"
```

### Task 7.2: Test API Key Management

```bash
# Add GW2 API key
curl -X POST http://localhost:5555/api/user/api-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"api_key": "YOUR-GW2-API-KEY", "name": "Main Key"}'
```

### Task 7.3: Test Protected Endpoints

```bash
# Test account endpoint
curl http://localhost:5555/api/account \
  -H "Authorization: Bearer $TOKEN"

# Test WvW data
curl http://localhost:5555/api/wvw/match/1020 \
  -H "Authorization: Bearer $TOKEN"
```

### Task 7.4: Monitor Logs

```bash
# Application logs
tail -f /opt/gw2api/logs/app.log

# System logs
sudo journalctl -u gw2api -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Phase 8: Maintenance and Operations

### Task 8.1: Database Backup

Create `/opt/gw2api/scripts/backup-db.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/gw2api/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="gw2api_${DATE}.sql.gz"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U gw2api_user gw2api | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "gw2api_*.sql.gz" -mtime +7 -delete

echo "Backup created: $FILENAME"
```

Add to crontab (daily at 2 AM):
```bash
0 2 * * * /opt/gw2api/scripts/backup-db.sh
```

### Task 8.2: Log Rotation

Create `/etc/logrotate.d/gw2api`:

```
/opt/gw2api/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 gw2api gw2api
    sharedscripts
    postrotate
        systemctl reload gw2api > /dev/null 2>&1 || true
    endscript
}
```

### Task 8.3: Monitoring Script

Create `/opt/gw2api/scripts/health-check.sh`:

```bash
#!/bin/bash

# Check if service is running
if ! systemctl is-active --quiet gw2api; then
    echo "❌ GW2API service is not running"
    sudo systemctl start gw2api
    exit 1
fi

# Check if API is responding
if ! curl -f http://localhost:5555/api/status > /dev/null 2>&1; then
    echo "❌ GW2API is not responding"
    sudo systemctl restart gw2api
    exit 1
fi

# Check database connection
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw gw2api; then
    echo "❌ Database connection failed"
    exit 1
fi

echo "✅ All systems operational"
```

Add to crontab (every 5 minutes):
```bash
*/5 * * * * /opt/gw2api/scripts/health-check.sh >> /opt/gw2api/logs/health-check.log 2>&1
```

---

## Troubleshooting Guide

### Issue: Service won't start

```bash
# Check logs
sudo journalctl -u gw2api -n 100 --no-pager

# Check environment file
cat /opt/gw2api/app/.env.production

# Test manually
cd /opt/gw2api/app
source venv/bin/activate
python3 app.py
```

### Issue: Database connection fails

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U gw2api_user -d gw2api -h localhost

# Check DATABASE_URL in .env.production
```

### Issue: Authentication not working

```bash
# Verify JWT_SECRET_KEY is set
grep JWT_SECRET_KEY /opt/gw2api/app/.env.production

# Check user exists
sudo -u postgres psql gw2api -c "SELECT id, email FROM users;"
```

### Issue: Background tracking not working

```bash
# Check tracking logs
grep "\[TRACKING\]" /opt/gw2api/logs/app.log | tail -20

# Check tracked worlds
sudo -u postgres psql gw2api -c "SELECT * FROM user_tracked_worlds;"

# Check API keys are stored
sudo -u postgres psql gw2api -c "SELECT user_id, api_key_name FROM user_api_keys;"
```

---

## Security Checklist

- [ ] PostgreSQL password is strong (16+ characters)
- [ ] JWT_SECRET_KEY is random and secure (64+ characters)
- [ ] API_KEY_ENCRYPTION_KEY is securely generated
- [ ] .env.production file has correct permissions (chmod 600)
- [ ] Firewall is configured (ufw or iptables)
- [ ] SSH is configured with key-based auth only
- [ ] HTTPS is enabled with valid SSL certificate
- [ ] Database backups are running daily
- [ ] Log rotation is configured
- [ ] Rate limiting is enabled
- [ ] CORS is properly configured for your domain
- [ ] No sensitive data in git repository
- [ ] Application runs as non-root user

---

## Next Steps After Deployment

1. **Test thoroughly** - Create test user, add API key, verify tracking
2. **Monitor logs** - Watch for errors in first 24 hours
3. **Set up monitoring** - Consider Uptime Robot or similar
4. **Document your domain** - Update frontend to use your domain
5. **Create admin user** - For managing the system
6. **Plan for scaling** - Consider Redis for caching if needed
7. **Add features** - Multiple API keys per user, data export, etc.

---

## Quick Reference Commands

```bash
# Service management
sudo systemctl start gw2api
sudo systemctl stop gw2api
sudo systemctl restart gw2api
sudo systemctl status gw2api

# View logs
sudo journalctl -u gw2api -f
tail -f /opt/gw2api/logs/app.log

# Database access
sudo -u postgres psql gw2api

# Deploy updates
cd /opt/gw2api/app
./deploy.sh

# Check service health
curl http://localhost:5555/api/status
```

---

## Support and Contact

For issues or questions:
1. Check logs first: `/opt/gw2api/logs/`
2. Review this deployment guide
3. Check GitHub issues in your repository
4. Consult the original CLAUDE.md for application architecture

---

**End of Deployment Guide**

Good luck with your deployment! 🚀
