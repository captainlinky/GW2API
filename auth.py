"""Authentication and authorization utilities."""
import os
import logging
import jwt
import bcrypt
from functools import wraps
from datetime import datetime, timedelta
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger('GW2-Auth')

SECRET_KEY = os.environ.get('JWT_SECRET_KEY')

if not SECRET_KEY:
    logger.warning("JWT_SECRET_KEY environment variable not set. Authentication disabled.")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except Exception as e:
        logger.error(f"Error verifying password: {e}")
        return False


def generate_token(user_id: int, expiry_days: int = 7) -> str:
    """
    Generate a JWT token for a user.

    Args:
        user_id: User ID
        expiry_days: Token validity period in days

    Returns:
        JWT token string

    Raises:
        RuntimeError: If JWT_SECRET_KEY is not configured
    """
    if not SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY not configured")

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
        RuntimeError: If JWT_SECRET_KEY is not configured
    """
    if not SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY not configured")

    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])


def verify_token(token: str) -> dict:
    """
    Verify and decode a JWT token (alias for decode_token).

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        ValueError: If token is invalid or expired
    """
    try:
        return decode_token(token)
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")


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
            try:
                from database import execute
                execute(
                    "UPDATE users SET last_login = NOW() WHERE id = %s",
                    (request.user_id,)
                )
            except Exception as e:
                logger.warning(f"Could not update last_login: {e}")

        except jwt.ExpiredSignatureError:
            return jsonify({'status': 'error', 'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return jsonify({'status': 'error', 'message': 'Invalid token'}), 401

        return f(*args, **kwargs)

    return decorated


def create_user(email: str, password: str, api_key: str = None) -> dict:
    """
    Create a new user account.

    Args:
        email: User email
        password: Plain text password
        api_key: Optional GW2 API key to store

    Returns:
        Dictionary with user_id and token

    Raises:
        ValueError: If email already exists
        RuntimeError: If database is not configured
    """
    try:
        from database import query_one, execute
    except ImportError:
        raise RuntimeError("Database module not available")

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
    try:
        execute(
            "INSERT INTO user_settings (user_id) VALUES (%s)",
            (user_id,)
        )
    except Exception as e:
        logger.error(f"Error creating user settings for {user_id}: {e}")

    # Store API key if provided
    if api_key:
        try:
            from crypto_utils import encrypt_api_key
            encrypted_key = encrypt_api_key(api_key)
            execute(
                "INSERT INTO user_api_keys (user_id, api_key_encrypted, api_key_name) VALUES (%s, %s, %s)",
                (user_id, encrypted_key, 'Default Key')
            )
            logger.info(f"API key stored for user {user_id}")
        except Exception as e:
            logger.error(f"Error storing API key for user {user_id}: {e}")
            # Don't fail registration if API key storage fails
            # The user can add it later in settings

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
        RuntimeError: If database is not configured
    """
    try:
        from database import query_one
    except ImportError:
        raise RuntimeError("Database module not available")

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
