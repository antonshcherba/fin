import json
import re
from typing import Any

import litellm

from .schema import RESPONSE_FORMAT

DEFAULT_MODEL = "openrouter/openai/gpt-oss-120b"
# Prefer Cerebras for fast inference; OpenRouter may fall back to another provider if it is down.
PROVIDER_ROUTING = {"provider": {"order": ["cerebras"]}}


class LLMConfigError(RuntimeError):
    """The LLM cannot be called because it is not configured."""


class LLMRequestError(RuntimeError):
    """The call to the LLM provider failed (network, auth, provider error, timeout)."""


def complete(messages: list[dict[str, Any]], *, api_key: str, model: str = DEFAULT_MODEL, timeout: float = 60.0) -> str:
    """Call the model via LiteLLM/OpenRouter with structured output and return the raw message text."""
    if not api_key:
        raise LLMConfigError("OPENROUTER_API_KEY is not set")
    try:
        response = litellm.completion(
            model=model,
            messages=messages,
            response_format=RESPONSE_FORMAT,
            extra_body=PROVIDER_ROUTING,
            api_key=api_key,
            timeout=timeout,
        )
        return response.choices[0].message.content or ""
    except Exception as exc:
        raise LLMRequestError(type(exc).__name__) from exc


_TRADE = re.compile(r"\b(buy|sell)\s+(\d+(?:\.\d+)?)\s+(?:shares?\s+of\s+)?([A-Za-z][A-Za-z0-9.\-]{0,9})\b", re.IGNORECASE)
_WATCHLIST = re.compile(r"\b(add|remove)\s+([A-Za-z][A-Za-z0-9.\-]{0,9})\s+(?:to|from)\s+(?:my\s+|the\s+)?watchlist\b", re.IGNORECASE)


def mock_complete(user_message: str, portfolio: dict[str, Any]) -> str:
    """Deterministic stand-in for the model (LLM_MOCK=true). Returns raw JSON text like the real call.

    Recognises "buy 5 AAPL" / "sell 2 TSLA" and "add PYPL to watchlist" / "remove PYPL from watchlist";
    anything else gets a portfolio summary.
    """
    trades = [
        {"ticker": m.group(3).upper(), "side": m.group(1).lower(), "quantity": float(m.group(2))}
        for m in _TRADE.finditer(user_message)
    ]
    changes = [
        {"ticker": m.group(2).upper(), "action": m.group(1).lower()} for m in _WATCHLIST.finditer(user_message)
    ]
    if trades or changes:
        message = "Mock mode: executing your requested actions."
    else:
        count = len(portfolio["positions"])
        message = (
            f"Mock mode: your portfolio is worth ${portfolio['total_value']:,.2f} with "
            f"${portfolio['cash_balance']:,.2f} in cash across {count} position{'s' if count != 1 else ''}."
        )
    return json.dumps({"message": message, "trades": trades, "watchlist_changes": changes})
