import asyncio

import httpx2 as httpx
import pytest

from market import MassiveDataSource, PriceCache
from market.massive import SNAPSHOT_PATH, parse_snapshot

SNAPSHOT = {
    "status": "OK",
    "count": 3,
    "tickers": [
        {"ticker": "AAPL", "lastTrade": {"p": 191.25, "t": 1}, "min": {"c": 191.0}, "day": {"c": 190.0}},
        {"ticker": "msft", "lastTrade": {}, "min": {"c": 421.5}, "prevDay": {"c": 420.0}},
        {"ticker": "TSLA", "day": {"c": 0}, "prevDay": {"c": 249.9}},
    ],
}


def test_parse_snapshot_prefers_last_trade_then_falls_back():
    assert parse_snapshot(SNAPSHOT) == {"AAPL": 191.25, "MSFT": 421.5, "TSLA": 249.9}


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        {},
        {"tickers": "nope"},
        {"tickers": [None, 5, {"lastTrade": {"p": 1}}, {"ticker": 7}]},
        {"tickers": [{"ticker": "AAPL", "lastTrade": {"p": "190"}, "day": {"c": True}}]},
        {"tickers": [{"ticker": "AAPL", "lastTrade": {"p": -1}}]},
    ],
)
def test_parse_snapshot_skips_malformed(payload):
    assert parse_snapshot(payload) == {}


def _source(handler, tickers=("AAPL", "MSFT"), **kwargs):
    cache = PriceCache()
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return cache, MassiveDataSource(cache, tickers, api_key="secret", client=client, **kwargs)


def test_poll_once_requests_union_of_tickers_and_updates_cache():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=SNAPSHOT)

    cache, source = _source(handler)
    asyncio.run(source.poll_once())

    (request,) = seen
    assert request.url.path == SNAPSHOT_PATH
    assert request.url.params["tickers"] == "AAPL,MSFT"
    assert request.headers["Authorization"] == "Bearer secret"
    assert "secret" not in str(request.url)
    assert cache.get_price("AAPL") == 191.25
    assert cache.get_price("MSFT") == 421.5
    assert "TSLA" not in cache  # not watched


def test_second_poll_sets_previous_price():
    prices = iter([100.0, 101.0])

    def handler(request):
        return httpx.Response(200, json={"tickers": [{"ticker": "AAPL", "lastTrade": {"p": next(prices)}}]})

    cache, source = _source(handler, tickers=["AAPL"])

    async def scenario():
        await source.poll_once()
        await source.poll_once()

    asyncio.run(scenario())
    tick = cache.get("AAPL")
    assert (tick.price, tick.previous_price, tick.direction) == (101.0, 100.0, "up")


def test_poll_once_without_tickers_makes_no_request():
    def handler(request):
        raise AssertionError("no request expected")

    _, source = _source(handler, tickers=[])
    asyncio.run(source.poll_once())


def test_http_error_raises_from_poll_once():
    _, source = _source(lambda request: httpx.Response(429))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(source.poll_once())


def test_background_poller_survives_errors_and_stops():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(500)
        return httpx.Response(200, json=SNAPSHOT)

    cache, source = _source(handler, poll_interval=0.01)

    async def scenario():
        await source.start()
        await asyncio.sleep(0.2)
        await source.stop()

    asyncio.run(scenario())
    assert calls["n"] >= 2
    assert cache.get_price("AAPL") == 191.25
    assert source._task is None


def test_added_ticker_is_included_in_next_poll():
    seen = []

    def handler(request):
        seen.append(request.url.params["tickers"])
        return httpx.Response(200, json={"tickers": []})

    _, source = _source(handler, tickers=["AAPL"])

    async def scenario():
        source.add_ticker("nvda")
        await source.poll_once()
        source.remove_ticker("AAPL")
        await source.poll_once()

    asyncio.run(scenario())
    assert seen == ["AAPL,NVDA", "NVDA"]
