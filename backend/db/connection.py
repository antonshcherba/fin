import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .seed import DEFAULT_CASH_BALANCE, DEFAULT_TICKERS, DEFAULT_USER_ID

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    # check_same_thread=False: FastAPI may run a dependency and its endpoint on different worker threads.
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: str | Path) -> None:
    """Create the schema and seed defaults. Safe to call repeatedly.

    Seeding is keyed on the default user profile being absent, so a user who
    later empties their watchlist does not get the defaults back on restart.
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection(db_path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA_PATH.read_text())
        _seed(conn)
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection) -> None:
    with conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, DEFAULT_CASH_BALANCE, utc_now()),
        )
        if cursor.rowcount == 0:
            return
        now = utc_now()
        conn.executemany(
            "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
            [(new_id(), DEFAULT_USER_ID, ticker, now) for ticker in DEFAULT_TICKERS],
        )
