from collections.abc import Iterable

from .base import MarketDataSource, PriceCache, PriceTick
from .massive import MassiveDataSource
from .simulator import MarketSimulator


def create_market_source(
    cache: PriceCache,
    tickers: Iterable[str],
    *,
    massive_api_key: str = "",
    massive_poll_interval: float = 15.0,
) -> MarketDataSource:
    """Massive when an API key is configured, otherwise the built-in simulator."""
    api_key = massive_api_key.strip()
    if api_key:
        return MassiveDataSource(cache, tickers, api_key=api_key, poll_interval=massive_poll_interval)
    return MarketSimulator(cache, tickers)


__all__ = [
    "MarketDataSource",
    "MassiveDataSource",
    "MarketSimulator",
    "PriceCache",
    "PriceTick",
    "create_market_source",
]
