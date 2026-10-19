import asyncio
import contextlib
import logging
from collections.abc import Iterable
from typing import Any

import httpx2 as httpx

from .base import MarketDataSource, PriceCache, normalize_ticker

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.massive.com"
SNAPSHOT_PATH = "/v2/snapshot/locale/us/markets/stocks/tickers"


def _positive(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value > 0 else None


def parse_snapshot(payload: Any) -> dict[str, float]:
    """Extract {ticker: price} from a full-market snapshot response.

    Prefers the last trade, then falls back to the latest minute bar, the day bar and the
    previous close so that thinly traded or pre-market tickers still get a price. Malformed
    entries are skipped rather than failing the whole poll.
    """
    if not isinstance(payload, dict):
        return {}
    entries = payload.get("tickers")
    if not isinstance(entries, list):
        return {}
    prices: dict[str, float] = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("ticker"), str):
            continue
        candidates = (
            (entry.get("lastTrade") or {}).get("p"),
            (entry.get("min") or {}).get("c"),
            (entry.get("day") or {}).get("c"),
            (entry.get("prevDay") or {}).get("c"),
        )
        price = next((p for p in map(_positive, candidates) if p is not None), None)
        if price is not None:
            prices[normalize_ticker(entry["ticker"])] = price
    return prices


class MassiveDataSource(MarketDataSource):
    """Polls the Massive (formerly Polygon.io) REST snapshot endpoint for the watched tickers."""

    def __init__(
        self,
        cache: PriceCache,
        tickers: Iterable[str] = (),
        *,
        api_key: str,
        poll_interval: float = 15.0,
        base_url: str = DEFAULT_BASE_URL,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(cache, tickers)
        self.poll_interval = poll_interval
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = client
        self._owns_client = client is None
        self._task: asyncio.Task[None] | None = None

    async def poll_once(self) -> None:
        if not self._tickers:
            return
        assert self._client is not None
        response = await self._client.get(
            self._base_url + SNAPSHOT_PATH,
            params={"tickers": ",".join(sorted(self._tickers))},
            headers={"Authorization": f"Bearer {self._api_key}"},
        )
        response.raise_for_status()
        for ticker, price in parse_snapshot(response.json()).items():
            if ticker in self._tickers:
                self.cache.update(ticker, price)

    async def start(self) -> None:
        if self._task is not None:
            return
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10.0)
        self._task = asyncio.create_task(self._run(), name="massive-poller")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _run(self) -> None:
        while True:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # Rate limits, network blips and bad payloads must not kill the poller.
                logger.warning("Massive poll failed: %s", exc)
            await asyncio.sleep(self.poll_interval)
