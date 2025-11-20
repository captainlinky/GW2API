"""Database connection and query utilities."""
import os
import logging
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger('GW2-Database')

DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    logger.warning("DATABASE_URL environment variable not set. Multi-tenant features will be disabled.")


@contextmanager
def get_db_connection():
    """Context manager for database connections."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not configured")

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


def execute_returning(sql, params=None):
    """Execute query and return first result row."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()
