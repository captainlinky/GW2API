"""Encryption utilities for API key storage."""
import os
import logging
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger('GW2-Crypto')

# Get encryption key from environment
ENCRYPTION_KEY = os.environ.get('API_KEY_ENCRYPTION_KEY')

# Only validate if we're using database-backed encryption
if ENCRYPTION_KEY and not ENCRYPTION_KEY.startswith('PLACEHOLDER'):
    try:
        cipher = Fernet(ENCRYPTION_KEY.encode())
    except Exception as e:
        logger.error(f"Invalid API_KEY_ENCRYPTION_KEY: {e}")
        cipher = None
else:
    cipher = None
    if os.environ.get('DATABASE_URL'):
        logger.warning("API_KEY_ENCRYPTION_KEY not properly configured for multi-tenant mode")


def encrypt_api_key(api_key: str) -> str:
    """
    Encrypt a GW2 API key for secure storage.

    Args:
        api_key: Plain text GW2 API key

    Returns:
        Encrypted API key as string

    Raises:
        RuntimeError: If encryption is not configured
    """
    if not cipher:
        raise RuntimeError("Encryption not configured - API_KEY_ENCRYPTION_KEY not set")

    return cipher.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Decrypt a stored GW2 API key.

    Args:
        encrypted_key: Encrypted API key from database

    Returns:
        Plain text GW2 API key

    Raises:
        RuntimeError: If encryption is not configured
    """
    if not cipher:
        raise RuntimeError("Encryption not configured - API_KEY_ENCRYPTION_KEY not set")

    return cipher.decrypt(encrypted_key.encode()).decode()


def get_user_api_key(user_id: int) -> str:
    """
    Get and decrypt user's primary API key.

    Args:
        user_id: User ID

    Returns:
        Decrypted GW2 API key or None if not found

    Raises:
        RuntimeError: If database is not configured
    """
    try:
        from database import query_one
    except ImportError:
        logger.error("Database module not available")
        return None

    try:
        result = query_one(
            "SELECT api_key_encrypted FROM user_api_keys WHERE user_id = %s AND is_active = TRUE LIMIT 1",
            (user_id,)
        )

        if result:
            return decrypt_api_key(result['api_key_encrypted'])
        return None
    except Exception as e:
        logger.error(f"Error retrieving API key for user {user_id}: {e}")
        return None
