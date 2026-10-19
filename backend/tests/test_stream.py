import asyncio
import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routes.stream import price_events
from market import PriceCache


def _data(frame: str) -> dict:
    assert frame.startswith("data: ") and frame.endswith("\n\n")
    return json.loads(frame[len("data: ") :])


def test_price_events_sends_snapshot_then_only_changes():
    async def scenario():
        cache = PriceCache()
        cache.update("AAPL", 190.0, timestamp=1.0)
        cache.update("MSFT", 420.0, timestamp=1.0)
        events = price_events(cache, interval=0.01)
        frames = [await anext(events) for _ in range(3)]
        cache.update("AAPL", 191.0, timestamp=2.0)
        frames.append(await asyncio.wait_for(anext(events), 1))
        await events.aclose()
        return frames

    retry, *ticks = asyncio.run(scenario())
    assert retry == "retry: 1000\n\n"
    first, second, changed = (_data(f) for f in ticks)
    assert {first["ticker"], second["ticker"]} == {"AAPL", "MSFT"}
    assert changed == {
        "ticker": "AAPL",
        "price": 191.0,
        "previous_price": 190.0,
        "timestamp": 2.0,
        "direction": "up",
    }


def test_price_events_keepalive_when_idle(monkeypatch):
    monkeypatch.setattr("app.routes.stream.KEEPALIVE_AFTER_SECONDS", 0.03)

    async def scenario():
        events = price_events(PriceCache(), interval=0.01)
        frames = [await asyncio.wait_for(anext(events), 1) for _ in range(2)]
        await events.aclose()
        return frames

    assert asyncio.run(scenario()) == ["retry: 1000\n\n", ": keepalive\n\n"]


def test_stream_endpoint_serves_live_simulator_prices(tmp_path):
    settings = Settings(db_path=tmp_path / "db" / "finally.db", static_dir=tmp_path / "static", sse_interval=0.01)
    with TestClient(create_app(settings)) as client:
        with client.stream("GET", "/api/stream/prices") as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            assert resp.headers["cache-control"] == "no-cache"
            tickers = set()
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    tick = json.loads(line[6:])
                    assert set(tick) == {"ticker", "price", "previous_price", "timestamp", "direction"}
                    assert tick["direction"] in {"up", "down", "flat"}
                    tickers.add(tick["ticker"])
                if len(tickers) == 10:
                    break
    assert tickers == {"AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"}


def test_app_exposes_market_source_matching_watchlist(client):
    assert client.app.state.market_source.tickers == set(client.app.state.price_cache.snapshot())
    assert len(client.app.state.price_cache) == 10
