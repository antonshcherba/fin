import asyncio
import logging
import sqlite3
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from db import DEFAULT_USER_ID, get_connection, new_id, utc_now
from market import PriceCache
from market.base import normalize_ticker

logger = logging.getLogger(__name__)

Side = Literal["buy", "sell"]

# Float dust tolerance: selling "all" shares or spending "all" cash must not fail on rounding.
EPSILON = 1e-9


class TradeError(Exception):
    """A trade the user asked for cannot be executed. The message is safe to show to the user."""


@dataclass(frozen=True)
class TradeResult:
    id: str
    ticker: str
    side: Side
    quantity: float
    price: float
    executed_at: str
    cash_balance: float

    def to_dict(self) -> dict:
        return asdict(self)


def execute_trade(
    conn: sqlite3.Connection,
    cache: PriceCache,
    ticker: str,
    quantity: float,
    side: str,
    *,
    user_id: str = DEFAULT_USER_ID,
) -> TradeResult:
    """Market order filled at the cached price. Raises TradeError; nothing is written on failure.

    Shared by the REST endpoint and the LLM auto-execution flow.
    """
    ticker = normalize_ticker(ticker)
    side = side.strip().lower()
    if side not in ("buy", "sell"):
        raise TradeError("side must be 'buy' or 'sell'")
    if not ticker:
        raise TradeError("ticker is required")
    if not quantity > 0 or quantity == float("inf"):
        raise TradeError("quantity must be a positive number")
    price = cache.get_price(ticker)
    if price is None:
        raise TradeError(f"no price available for {ticker}")

    now = utc_now()
    # IMMEDIATE takes the write lock up front so the balance check and the update can't interleave
    # with another writer (e.g. the snapshot task or a concurrent trade).
    conn.execute("BEGIN IMMEDIATE")
    try:
        cash = _cash_balance(conn, user_id)
        position = conn.execute(
            "SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        ).fetchone()
        held = position["quantity"] if position else 0.0
        notional = quantity * price

        if side == "buy":
            if notional > cash + EPSILON:
                raise TradeError(f"insufficient cash: need ${notional:,.2f}, have ${cash:,.2f}")
            new_cash = max(cash - notional, 0.0)
            new_qty = held + quantity
            avg_cost = (held * position["avg_cost"] + notional) / new_qty if position else price
            _upsert_position(conn, user_id, ticker, new_qty, avg_cost, now)
        else:
            if quantity > held + EPSILON:
                raise TradeError(f"insufficient shares: trying to sell {quantity:g} {ticker}, have {held:g}")
            new_cash = cash + notional
            remaining = held - quantity
            if remaining <= EPSILON:
                conn.execute("DELETE FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker))
            else:
                _upsert_position(conn, user_id, ticker, remaining, position["avg_cost"], now)

        conn.execute("UPDATE users_profile SET cash_balance = ? WHERE id = ?", (new_cash, user_id))
        trade_id = new_id()
        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trade_id, user_id, ticker, side, quantity, price, now),
        )
        _insert_snapshot(conn, cache, user_id, now)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return TradeResult(trade_id, ticker, side, quantity, price, now, new_cash)


def get_portfolio(conn: sqlite3.Connection, cache: PriceCache, *, user_id: str = DEFAULT_USER_ID) -> dict:
    cash = _cash_balance(conn, user_id)
    positions = []
    for row in conn.execute(
        "SELECT ticker, quantity, avg_cost FROM positions WHERE user_id = ? ORDER BY ticker", (user_id,)
    ):
        # Without a live price (e.g. ticker dropped from the feed) value at cost so totals stay sane.
        price = cache.get_price(row["ticker"])
        current = row["avg_cost"] if price is None else price
        cost_basis = row["quantity"] * row["avg_cost"]
        market_value = row["quantity"] * current
        pnl = market_value - cost_basis
        positions.append(
            {
                "ticker": row["ticker"],
                "quantity": row["quantity"],
                "avg_cost": row["avg_cost"],
                "current_price": current,
                "market_value": market_value,
                "unrealized_pnl": pnl,
                "unrealized_pnl_pct": pnl / cost_basis * 100 if cost_basis else 0.0,
            }
        )
    positions_value = sum(p["market_value"] for p in positions)
    return {
        "cash_balance": cash,
        "positions_value": positions_value,
        "total_value": cash + positions_value,
        "total_unrealized_pnl": sum(p["unrealized_pnl"] for p in positions),
        "positions": positions,
    }


def get_history(conn: sqlite3.Connection, *, user_id: str = DEFAULT_USER_ID) -> list[dict]:
    rows = conn.execute(
        "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? ORDER BY recorded_at, rowid",
        (user_id,),
    )
    return [{"total_value": r["total_value"], "recorded_at": r["recorded_at"]} for r in rows]


def record_snapshot(conn: sqlite3.Connection, cache: PriceCache, *, user_id: str = DEFAULT_USER_ID) -> None:
    with conn:
        _insert_snapshot(conn, cache, user_id, utc_now())


async def snapshot_loop(db_path: str | Path, cache: PriceCache, interval: float) -> None:
    """Record a portfolio snapshot every `interval` seconds until cancelled."""
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_snapshot_once, db_path, cache)
        except Exception:
            logger.exception("portfolio snapshot failed")


def _snapshot_once(db_path: str | Path, cache: PriceCache) -> None:
    conn = get_connection(db_path)
    try:
        record_snapshot(conn, cache)
    finally:
        conn.close()


def _cash_balance(conn: sqlite3.Connection, user_id: str) -> float:
    row = conn.execute("SELECT cash_balance FROM users_profile WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise TradeError("user profile not found")
    return row["cash_balance"]


def _upsert_position(
    conn: sqlite3.Connection, user_id: str, ticker: str, quantity: float, avg_cost: float, now: str
) -> None:
    updated = conn.execute(
        "UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = ? WHERE user_id = ? AND ticker = ?",
        (quantity, avg_cost, now, user_id, ticker),
    )
    if updated.rowcount == 0:
        conn.execute(
            "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (new_id(), user_id, ticker, quantity, avg_cost, now),
        )


def _insert_snapshot(conn: sqlite3.Connection, cache: PriceCache, user_id: str, now: str) -> None:
    total = get_portfolio(conn, cache, user_id=user_id)["total_value"]
    conn.execute(
        "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) VALUES (?, ?, ?, ?)",
        (new_id(), user_id, total, now),
    )
