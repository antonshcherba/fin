import asyncio
import contextlib
import math
import random
from collections.abc import Iterable
from dataclasses import dataclass

from .base import MarketDataSource, PriceCache, normalize_ticker

SECONDS_PER_TRADING_YEAR = 252 * 6.5 * 3600


@dataclass(frozen=True, slots=True)
class TickerProfile:
    seed_price: float
    drift: float  # annualised mu
    volatility: float  # annualised sigma
    sector: str | None = None


PROFILES: dict[str, TickerProfile] = {
    "AAPL": TickerProfile(190.0, 0.08, 0.25, "tech"),
    "GOOGL": TickerProfile(175.0, 0.08, 0.28, "tech"),
    "MSFT": TickerProfile(420.0, 0.09, 0.24, "tech"),
    "AMZN": TickerProfile(185.0, 0.09, 0.30, "tech"),
    "TSLA": TickerProfile(250.0, 0.05, 0.55, "auto"),
    "NVDA": TickerProfile(900.0, 0.12, 0.45, "tech"),
    "META": TickerProfile(500.0, 0.10, 0.35, "tech"),
    "JPM": TickerProfile(200.0, 0.06, 0.20, "finance"),
    "V": TickerProfile(280.0, 0.07, 0.18, "finance"),
    "NFLX": TickerProfile(600.0, 0.08, 0.38, "tech"),
}

MARKET_CORRELATION = 0.3
SECTOR_CORRELATION = 0.3  # additional, shared by tickers in the same sector

# time_scale compresses market time so a 500ms tick moves prices visibly; real-time dt would be
# ~1e-7 years per tick and prices would look frozen.
DEFAULT_TIME_SCALE = 30.0
EVENT_PROBABILITY = 0.001  # per ticker per tick, roughly one event per ticker every ~8 minutes
EVENT_MIN_MOVE = 0.02
EVENT_MAX_MOVE = 0.05


def gbm_step(price: float, drift: float, volatility: float, dt: float, z: float) -> float:
    """One exact GBM step: S * exp((mu - sigma^2/2) dt + sigma sqrt(dt) z), dt in years."""
    return price * math.exp((drift - 0.5 * volatility**2) * dt + volatility * math.sqrt(dt) * z)


def profile_for(ticker: str, rng: random.Random) -> TickerProfile:
    if ticker in PROFILES:
        return PROFILES[ticker]
    return TickerProfile(
        seed_price=round(rng.uniform(50.0, 300.0), 2),
        drift=0.07,
        volatility=round(rng.uniform(0.2, 0.4), 2),
    )


class MarketSimulator(MarketDataSource):
    def __init__(
        self,
        cache: PriceCache,
        tickers: Iterable[str] = (),
        *,
        interval: float = 0.5,
        time_scale: float = DEFAULT_TIME_SCALE,
        event_probability: float = EVENT_PROBABILITY,
        rng: random.Random | None = None,
    ) -> None:
        super().__init__(cache, tickers)
        self.interval = interval
        self.dt = interval * time_scale / SECONDS_PER_TRADING_YEAR
        self.event_probability = event_probability
        self.rng = rng or random.Random()
        self._profiles: dict[str, TickerProfile] = {}
        self._prices: dict[str, float] = {}
        self._task: asyncio.Task[None] | None = None
        for ticker in sorted(self._tickers):
            self._init_ticker(ticker)

    def _init_ticker(self, ticker: str) -> None:
        profile = profile_for(ticker, self.rng)
        self._profiles[ticker] = profile
        self._prices[ticker] = profile.seed_price
        self.cache.update(ticker, profile.seed_price)

    def _on_ticker_added(self, ticker: str) -> None:
        self._init_ticker(ticker)

    def remove_ticker(self, ticker: str) -> None:
        ticker = normalize_ticker(ticker)
        super().remove_ticker(ticker)
        self._profiles.pop(ticker, None)
        self._prices.pop(ticker, None)

    def step(self) -> None:
        """Advance every ticker one tick and publish to the cache."""
        market_z = self.rng.gauss(0.0, 1.0)
        sector_z: dict[str, float] = {}
        a = math.sqrt(MARKET_CORRELATION)
        b = math.sqrt(SECTOR_CORRELATION)
        for ticker in sorted(self._tickers):
            profile = self._profiles[ticker]
            idio = math.sqrt(1.0 - MARKET_CORRELATION - (SECTOR_CORRELATION if profile.sector else 0.0))
            z = a * market_z + idio * self.rng.gauss(0.0, 1.0)
            if profile.sector:
                if profile.sector not in sector_z:
                    sector_z[profile.sector] = self.rng.gauss(0.0, 1.0)
                z += b * sector_z[profile.sector]
            price = gbm_step(self._prices[ticker], profile.drift, profile.volatility, self.dt, z)
            if self.rng.random() < self.event_probability:
                move = self.rng.uniform(EVENT_MIN_MOVE, EVENT_MAX_MOVE)
                price *= 1.0 + (move if self.rng.random() < 0.5 else -move)
            self._prices[ticker] = price
            self.cache.update(ticker, round(price, 2))

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="market-simulator")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self.interval)
            self.step()
