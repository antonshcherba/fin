import pytest

from app import watchlist
from db import DEFAULT_TICKERS, get_connection


def test_get_watchlist_returns_seeded_tickers_with_prices(client):
    resp = client.get("/api/watchlist")
    assert resp.status_code == 200
    items = resp.json()
    assert {i["ticker"] for i in items} == set(DEFAULT_TICKERS)
    assert all(i["price"] is not None for i in items)
    assert {"ticker", "price", "previous_price", "direction", "timestamp", "added_at"} <= items[0].keys()


def test_add_ticker_persists_and_tracks(client):
    resp = client.post("/api/watchlist", json={"ticker": " pypl "})
    assert resp.status_code == 201
    body = resp.json()
    assert body["ticker"] == "PYPL"
    assert body["price"] is not None
    assert "PYPL" in client.app.state.market_source.tickers
    assert "PYPL" in client.app.state.price_cache
    assert "PYPL" in {i["ticker"] for i in client.get("/api/watchlist").json()}


def test_add_duplicate_is_conflict(client):
    assert client.post("/api/watchlist", json={"ticker": "aapl"}).status_code == 409
    assert len(client.get("/api/watchlist").json()) == len(DEFAULT_TICKERS)


@pytest.mark.parametrize("ticker", ["", "   ", "1ABC", "TOOLONGTICKER", "AA PL", "AAPL;DROP"])
def test_add_invalid_ticker_is_rejected(client, ticker):
    assert client.post("/api/watchlist", json={"ticker": ticker}).status_code == 422


def test_add_missing_body_field_is_rejected(client):
    assert client.post("/api/watchlist", json={}).status_code == 422


def test_remove_ticker_stops_tracking(client):
    resp = client.delete("/api/watchlist/aapl")
    assert resp.status_code == 200
    assert resp.json() == {"ticker": "AAPL"}
    assert "AAPL" not in client.app.state.market_source.tickers
    assert "AAPL" not in client.app.state.price_cache
    assert "AAPL" not in {i["ticker"] for i in client.get("/api/watchlist").json()}


def test_remove_unknown_ticker_is_404(client):
    assert client.delete("/api/watchlist/ZZZZ").status_code == 404


def test_remove_invalid_ticker_is_422(client):
    assert client.delete("/api/watchlist/1bad").status_code == 422


def test_add_then_remove_roundtrip(client):
    client.post("/api/watchlist", json={"ticker": "SHOP"})
    assert client.delete("/api/watchlist/SHOP").status_code == 200
    assert client.delete("/api/watchlist/SHOP").status_code == 404


def test_service_functions_are_reusable_outside_http(client, settings):
    source = client.app.state.market_source
    cache = client.app.state.price_cache
    conn = get_connection(settings.db_path)
    try:
        entry = watchlist.add_to_watchlist(conn, source, cache, "uber")
        assert entry["ticker"] == "UBER"
        with pytest.raises(watchlist.TickerAlreadyWatchedError):
            watchlist.add_to_watchlist(conn, source, cache, "UBER")
        assert "UBER" in {i["ticker"] for i in watchlist.list_watchlist(conn, cache)}
        assert watchlist.remove_from_watchlist(conn, source, "uber") == "UBER"
        with pytest.raises(watchlist.TickerNotWatchedError):
            watchlist.remove_from_watchlist(conn, source, "UBER")
        with pytest.raises(watchlist.InvalidTickerError):
            watchlist.add_to_watchlist(conn, source, cache, "not valid")
    finally:
        conn.close()


def test_ticker_without_price_yet_lists_null_price(client, settings):
    conn = get_connection(settings.db_path)
    try:
        class NoPriceSource:
            def add_ticker(self, ticker): ...

        watchlist.add_to_watchlist(conn, NoPriceSource(), client.app.state.price_cache, "ZZZ")
        item = next(i for i in watchlist.list_watchlist(conn, client.app.state.price_cache) if i["ticker"] == "ZZZ")
        assert item["price"] is None and item["direction"] is None
    finally:
        conn.close()
