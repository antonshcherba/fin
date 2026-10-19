import sqlite3

import pytest

from db import DEFAULT_TICKERS, get_connection, init_db

TABLES = {"users_profile", "watchlist", "positions", "trades", "portfolio_snapshots", "chat_messages"}


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "nested" / "finally.db"
    init_db(path)
    return path


def test_creates_file_and_all_tables(db_path):
    conn = get_connection(db_path)
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert TABLES <= names


def test_seeds_profile_and_watchlist(db_path):
    conn = get_connection(db_path)
    profile = conn.execute("SELECT * FROM users_profile").fetchall()
    assert [(r["id"], r["cash_balance"]) for r in profile] == [("default", 10000.0)]
    tickers = [r["ticker"] for r in conn.execute("SELECT ticker FROM watchlist WHERE user_id='default'")]
    assert sorted(tickers) == sorted(DEFAULT_TICKERS)
    assert len(tickers) == 10


def test_init_is_idempotent(db_path):
    init_db(db_path)
    conn = get_connection(db_path)
    assert conn.execute("SELECT COUNT(*) FROM users_profile").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 10


def test_does_not_reseed_after_user_changes(db_path):
    conn = get_connection(db_path)
    with conn:
        conn.execute("DELETE FROM watchlist")
        conn.execute("UPDATE users_profile SET cash_balance = 42")
    init_db(db_path)
    assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 0
    assert conn.execute("SELECT cash_balance FROM users_profile").fetchone()[0] == 42


def test_recreates_missing_tables_in_existing_file(tmp_path):
    path = tmp_path / "finally.db"
    sqlite3.connect(path).close()
    init_db(path)
    conn = get_connection(path)
    assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 10


def test_user_id_defaults_to_default(db_path):
    conn = get_connection(db_path)
    with conn:
        conn.execute("INSERT INTO positions (id, ticker, quantity, avg_cost, updated_at) VALUES ('p', 'AAPL', 1, 2, 'now')")
        conn.execute("INSERT INTO trades (id, ticker, side, quantity, price, executed_at) VALUES ('t', 'AAPL', 'buy', 1, 2, 'now')")
        conn.execute("INSERT INTO portfolio_snapshots (id, total_value, recorded_at) VALUES ('s', 1, 'now')")
        conn.execute("INSERT INTO chat_messages (id, role, content, created_at) VALUES ('c', 'user', 'hi', 'now')")
    for table in ("positions", "trades", "portfolio_snapshots", "chat_messages"):
        assert conn.execute(f"SELECT user_id FROM {table}").fetchone()[0] == "default"


def test_unique_watchlist_per_user(db_path):
    conn = get_connection(db_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO watchlist (id, ticker, added_at) VALUES ('x', 'AAPL', 'now')")


def test_unique_position_per_user(db_path):
    conn = get_connection(db_path)
    row = "INSERT INTO positions (id, ticker, quantity, avg_cost, updated_at) VALUES (?, 'AAPL', 1, 1, 'now')"
    conn.execute(row, ("a",))
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(row, ("b",))


def test_trade_side_constrained(db_path):
    conn = get_connection(db_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO trades (id, ticker, side, quantity, price, executed_at) VALUES ('t', 'A', 'hold', 1, 1, 'now')")
