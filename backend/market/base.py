import time
from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

Direction = Literal["up", "down", "flat"]


def normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


@dataclass(frozen=True, slots=True)
class PriceTick:
    ticker: str
    price: float
    previous_price: float
    timestamp: float  # unix seconds

    @property
    def direction(self) -> Direction:
        if self.price > self.previous_price:
            return "up"
        if self.price < self.previous_price:
            return "down"
        return "flat"

    def to_dict(self) -> dict[str, str | float]:
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "timestamp": self.timestamp,
            "direction": self.direction,
        }


class PriceCache:
    """Latest tick per ticker. Written by one market data source, read by many consumers.

    Only called from the event loop thread, so no locking is needed.
    """

    def __init__(self) -> None:
        self._ticks: dict[str, PriceTick] = {}

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceTick:
        """Record a new price. An unchanged price is a no-op so the last move's direction survives."""
        ticker = normalize_ticker(ticker)
        current = self._ticks.get(ticker)
        if current is not None and current.price == price:
            return current
        tick = PriceTick(
            ticker=ticker,
            price=price,
            previous_price=current.price if current else price,
            timestamp=time.time() if timestamp is None else timestamp,
        )
        self._ticks[ticker] = tick
        return tick

    def get(self, ticker: str) -> PriceTick | None:
        return self._ticks.get(normalize_ticker(ticker))

    def get_price(self, ticker: str) -> float | None:
        tick = self.get(ticker)
        return tick.price if tick else None

    def remove(self, ticker: str) -> None:
        self._ticks.pop(normalize_ticker(ticker), None)

    def snapshot(self) -> dict[str, PriceTick]:
        return dict(self._ticks)

    def __contains__(self, ticker: str) -> bool:
        return normalize_ticker(ticker) in self._ticks

    def __len__(self) -> int:
        return len(self._ticks)


class MarketDataSource(ABC):
    """A background producer that keeps a PriceCache current for a set of tickers."""

    def __init__(self, cache: PriceCache, tickers: Iterable[str] = ()) -> None:
        self.cache = cache
        self._tickers: set[str] = {normalize_ticker(t) for t in tickers}

    @property
    def tickers(self) -> frozenset[str]:
        return frozenset(self._tickers)

    def add_ticker(self, ticker: str) -> None:
        ticker = normalize_ticker(ticker)
        if ticker not in self._tickers:
            self._tickers.add(ticker)
            self._on_ticker_added(ticker)

    def remove_ticker(self, ticker: str) -> None:
        ticker = normalize_ticker(ticker)
        if ticker in self._tickers:
            self._tickers.discard(ticker)
            self.cache.remove(ticker)

    def _on_ticker_added(self, ticker: str) -> None:
        """Hook for sources that can produce a price immediately."""

    @abstractmethod
    async def start(self) -> None:
        """Begin producing prices in a background task. Must return promptly."""

    @abstractmethod
    async def stop(self) -> None:
        """Cancel the background task and wait for it to finish."""
