import re
import sqlite3
from typing import Any

from db import DEFAULT_USER_ID, new_id, utc_now
from market import MarketDataSource, PriceCache
from market.base import normalize_ticker

TICKER_PATTERN = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")


class InvalidTickerError(ValueError):
    pass


class TickerAlreadyWatchedError(Exception):
    pass


class TickerNotWatchedError(Exception):
    pass


def validate_ticker(ticker: str) -> str:
    normalized = normalize_ticker(ticker)
    if not TICKER_PATTERN.match(normalized):
        raise InvalidTickerError(f"invalid ticker: {ticker!r}")
    return normalized


def _entry(ticker: str, added_at: str, cache: PriceCache) -> dict[str, Any]:
    tick = cache.get(ticker)
    return {
        "ticker": ticker,
        "added_at": added_at,
        "price": tick.price if tick else None,
        "previous_price": tick.previous_price if tick else None,
        "direction": tick.direction if tick else None,
        "timestamp": tick.timestamp if tick else None,
    }


def list_watchlist(conn: sqlite3.Connection, cache: PriceCache) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT ticker, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at, ticker",
        (DEFAULT_USER_ID,),
    ).fetchall()
    return [_entry(row["ticker"], row["added_at"], cache) for row in rows]


def add_to_watchlist(
    conn: sqlite3.Connection, source: MarketDataSource, cache: PriceCache, ticker: str
) -> dict[str, Any]:
    """Persist the ticker and start tracking it. Raises InvalidTickerError / TickerAlreadyWatchedError."""
    ticker = validate_ticker(ticker)
    added_at = utc_now()
    try:
        with conn:
            conn.execute(
                "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                (new_id(), DEFAULT_USER_ID, ticker, added_at),
            )
    except sqlite3.IntegrityError as exc:
        raise TickerAlreadyWatchedError(ticker) from exc
    source.add_ticker(ticker)
    return _entry(ticker, added_at, cache)


def remove_from_watchlist(conn: sqlite3.Connection, source: MarketDataSource, ticker: str) -> str:
    """Delete the ticker and stop tracking it. Raises InvalidTickerError / TickerNotWatchedError."""
    ticker = validate_ticker(ticker)
    with conn:
        cursor = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (DEFAULT_USER_ID, ticker)
        )
    if cursor.rowcount == 0:
        raise TickerNotWatchedError(ticker)
    source.remove_ticker(ticker)
    return ticker
