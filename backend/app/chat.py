import json
import sqlite3
from typing import Any

from app import watchlist
from app.config import Settings
from db import DEFAULT_USER_ID, new_id, utc_now
from llm import LLMResponse, MalformedLLMResponse, complete, mock_complete, parse_llm_output
from market import MarketDataSource, PriceCache
from portfolio import TradeError, execute_trade, get_portfolio

SYSTEM_PROMPT = """You are FinAlly, an AI trading assistant inside a simulated trading workstation (fake money, market orders only, instant fills at the current price, fractional shares allowed).

- Analyze portfolio composition, risk concentration, and P&L using the portfolio context provided.
- Suggest trades with brief reasoning. Execute trades when the user asks or agrees by listing them in "trades"; they run automatically.
- Manage the watchlist proactively with "watchlist_changes" (action "add" or "remove").
- Be concise and data-driven. Never invent prices; use the figures in the context.
- If a previous action failed (see "Actions taken" in history), explain why and suggest a fix.
- Always respond with valid JSON only: {"message": string, "trades": [{"ticker", "side": "buy"|"sell", "quantity"}], "watchlist_changes": [{"ticker", "action": "add"|"remove"}]}. Use empty arrays when there is nothing to do."""

MALFORMED_REPLY = "Sorry, I couldn't understand the model's response, so no actions were taken. Please try again."


def build_context(conn: sqlite3.Connection, cache: PriceCache) -> dict[str, Any]:
    portfolio = get_portfolio(conn, cache)
    return {
        "cash_balance": portfolio["cash_balance"],
        "total_value": portfolio["total_value"],
        "total_unrealized_pnl": portfolio["total_unrealized_pnl"],
        "positions": portfolio["positions"],
        "watchlist": [
            {"ticker": e["ticker"], "price": e["price"]} for e in watchlist.list_watchlist(conn, cache)
        ],
    }


def load_history(conn: sqlite3.Connection, limit: int) -> list[dict[str, str]]:
    rows = conn.execute(
        "SELECT role, content, actions FROM chat_messages WHERE user_id = ? "
        "ORDER BY created_at DESC, rowid DESC LIMIT ?",
        (DEFAULT_USER_ID, limit),
    ).fetchall()
    history = []
    for row in reversed(rows):
        content = row["content"]
        if row["actions"]:
            content += f"\n\nActions taken: {row['actions']}"
        history.append({"role": row["role"], "content": content})
    return history


def build_messages(context: dict[str, Any], history: list[dict[str, str]], user_message: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Current portfolio context:\n{json.dumps(context)}"},
        *history,
        {"role": "user", "content": user_message},
    ]


def execute_actions(
    conn: sqlite3.Connection,
    source: MarketDataSource,
    cache: PriceCache,
    parsed: LLMResponse,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run the model's trades and watchlist changes through the same paths as the manual endpoints.

    Each action is independent: a failure is reported on that action (`error`) and the rest still run.
    """
    trades: list[dict[str, Any]] = []
    for t in parsed.trades:
        entry: dict[str, Any] = {"ticker": t.ticker.strip().upper(), "side": t.side.strip().lower(), "quantity": t.quantity}
        try:
            result = execute_trade(conn, cache, t.ticker, t.quantity, t.side)
        except TradeError as exc:
            entry["error"] = str(exc)
        else:
            entry.update(ticker=result.ticker, side=result.side, price=result.price)
        trades.append(entry)

    changes: list[dict[str, Any]] = []
    for c in parsed.watchlist_changes:
        entry = {"ticker": c.ticker.strip().upper(), "action": c.action.strip().lower()}
        try:
            if entry["action"] == "add":
                watchlist.add_to_watchlist(conn, source, cache, c.ticker)
            elif entry["action"] == "remove":
                watchlist.remove_from_watchlist(conn, source, c.ticker)
            else:
                entry["error"] = "action must be 'add' or 'remove'"
        except watchlist.InvalidTickerError as exc:
            entry["error"] = str(exc)
        except watchlist.TickerAlreadyWatchedError:
            entry["error"] = f"{entry['ticker']} is already on the watchlist"
        except watchlist.TickerNotWatchedError:
            entry["error"] = f"{entry['ticker']} is not on the watchlist"
        changes.append(entry)
    return trades, changes


def _save_message(conn: sqlite3.Connection, role: str, content: str, actions: dict | None, created_at: str) -> None:
    conn.execute(
        "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (new_id(), DEFAULT_USER_ID, role, content, json.dumps(actions) if actions else None, created_at),
    )


def handle_chat(
    conn: sqlite3.Connection,
    source: MarketDataSource,
    cache: PriceCache,
    settings: Settings,
    user_message: str,
) -> dict[str, Any]:
    """Full chat turn. LLM transport/config errors propagate (nothing is stored); bad output is reported in the reply."""
    asked_at = utc_now()
    context = build_context(conn, cache)
    if settings.llm_mock:
        raw = mock_complete(user_message, context)
    else:
        messages = build_messages(context, load_history(conn, settings.chat_history_limit), user_message)
        raw = complete(messages, api_key=settings.openrouter_api_key, model=settings.llm_model)

    try:
        parsed = parse_llm_output(raw)
    except MalformedLLMResponse as exc:
        reply = {"message": MALFORMED_REPLY, "trades": [], "watchlist_changes": [], "error": str(exc)}
        actions = None
    else:
        trades, changes = execute_actions(conn, source, cache, parsed)
        reply = {"message": parsed.message, "trades": trades, "watchlist_changes": changes}
        actions = {"trades": trades, "watchlist_changes": changes} if trades or changes else None

    with conn:
        _save_message(conn, "user", user_message, None, asked_at)
        _save_message(conn, "assistant", reply["message"], actions, utc_now())
    return reply
