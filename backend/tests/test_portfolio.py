import asyncio

import pytest

from db import get_connection, init_db
from market import PriceCache
from portfolio import TradeError, execute_trade, get_history, get_portfolio, record_snapshot, snapshot_loop


@pytest.fixture
def cache():
    c = PriceCache()
    c.update("AAPL", 100.0)
    c.update("TSLA", 250.0)
    return c


@pytest.fixture
def conn(settings):
    init_db(settings.db_path)
    c = get_connection(settings.db_path)
    yield c
    c.close()


def _count(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_buy_creates_position_and_debits_cash(conn, cache):
    result = execute_trade(conn, cache, "aapl", 10, "buy")
    assert (result.ticker, result.side, result.price) == ("AAPL", "buy", 100.0)
    assert result.cash_balance == 9000.0
    p = get_portfolio(conn, cache)
    assert p["cash_balance"] == 9000.0
    assert p["positions"][0]["quantity"] == 10
    assert p["positions"][0]["avg_cost"] == 100.0
    assert p["total_value"] == 10000.0
    assert _count(conn, "trades") == 1


def test_fractional_shares(conn, cache):
    execute_trade(conn, cache, "AAPL", 0.5, "buy")
    p = get_portfolio(conn, cache)
    assert p["positions"][0]["quantity"] == 0.5
    assert p["cash_balance"] == 9950.0


def test_second_buy_updates_avg_cost(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    cache.update("AAPL", 200.0)
    execute_trade(conn, cache, "AAPL", 10, "buy")
    pos = get_portfolio(conn, cache)["positions"][0]
    assert pos["quantity"] == 20
    assert pos["avg_cost"] == pytest.approx(150.0)
    assert _count(conn, "positions") == 1


def test_partial_sell_keeps_avg_cost(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    cache.update("AAPL", 120.0)
    result = execute_trade(conn, cache, "AAPL", 4, "sell")
    assert result.cash_balance == pytest.approx(9000.0 + 480.0)
    pos = get_portfolio(conn, cache)["positions"][0]
    assert pos["quantity"] == 6
    assert pos["avg_cost"] == 100.0
    assert pos["unrealized_pnl"] == pytest.approx(120.0)


def test_sell_all_removes_position(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    execute_trade(conn, cache, "AAPL", 10, "sell")
    assert get_portfolio(conn, cache)["positions"] == []
    assert _count(conn, "positions") == 0


def test_sell_all_survives_float_dust(conn, cache):
    cache.update("AAPL", 33.33)
    execute_trade(conn, cache, "AAPL", 0.1, "buy")
    execute_trade(conn, cache, "AAPL", 0.2, "buy")
    execute_trade(conn, cache, "AAPL", 0.1 + 0.2, "sell")
    assert _count(conn, "positions") == 0


def test_sell_at_a_loss(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    cache.update("AAPL", 80.0)
    assert get_portfolio(conn, cache)["total_unrealized_pnl"] == pytest.approx(-200.0)
    execute_trade(conn, cache, "AAPL", 10, "sell")
    p = get_portfolio(conn, cache)
    assert p["cash_balance"] == pytest.approx(9800.0)
    assert p["total_value"] == pytest.approx(9800.0)
    assert p["positions"] == []


def test_insufficient_cash_changes_nothing(conn, cache):
    with pytest.raises(TradeError, match="insufficient cash"):
        execute_trade(conn, cache, "AAPL", 101, "buy")
    p = get_portfolio(conn, cache)
    assert p["cash_balance"] == 10000.0
    assert p["positions"] == []
    assert _count(conn, "trades") == 0
    assert _count(conn, "portfolio_snapshots") == 0


def test_spend_exact_cash(conn, cache):
    execute_trade(conn, cache, "AAPL", 100, "buy")
    assert get_portfolio(conn, cache)["cash_balance"] == 0.0


def test_insufficient_shares_changes_nothing(conn, cache):
    execute_trade(conn, cache, "AAPL", 5, "buy")
    with pytest.raises(TradeError, match="insufficient shares"):
        execute_trade(conn, cache, "AAPL", 6, "sell")
    with pytest.raises(TradeError, match="insufficient shares"):
        execute_trade(conn, cache, "TSLA", 1, "sell")
    assert get_portfolio(conn, cache)["positions"][0]["quantity"] == 5
    assert _count(conn, "trades") == 1


@pytest.mark.parametrize("quantity", [0, -1, float("nan"), float("inf")])
def test_rejects_bad_quantity(conn, cache, quantity):
    with pytest.raises(TradeError, match="quantity"):
        execute_trade(conn, cache, "AAPL", quantity, "buy")


def test_rejects_bad_side_and_unpriced_ticker(conn, cache):
    with pytest.raises(TradeError, match="side"):
        execute_trade(conn, cache, "AAPL", 1, "short")
    with pytest.raises(TradeError, match="no price"):
        execute_trade(conn, cache, "ZZZZ", 1, "buy")


def test_trade_records_snapshot_with_total_value(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    history = get_history(conn)
    assert len(history) == 1
    assert history[0]["total_value"] == pytest.approx(10000.0)


def test_position_valued_at_cost_when_price_missing(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    cache.remove("AAPL")
    p = get_portfolio(conn, cache)
    assert p["total_value"] == 10000.0
    assert p["positions"][0]["unrealized_pnl"] == 0.0


def test_record_snapshot_reflects_price_moves(conn, cache):
    execute_trade(conn, cache, "AAPL", 10, "buy")
    cache.update("AAPL", 110.0)
    record_snapshot(conn, cache)
    assert [s["total_value"] for s in get_history(conn)] == pytest.approx([10000.0, 10100.0])


def test_snapshot_loop_records_periodically(settings, cache):
    init_db(settings.db_path)

    async def run():
        task = asyncio.create_task(snapshot_loop(settings.db_path, cache, 0.01))
        await asyncio.sleep(0.15)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    asyncio.run(run())
    conn = get_connection(settings.db_path)
    try:
        assert len(get_history(conn)) >= 2
    finally:
        conn.close()


def test_api_portfolio_initial(client):
    body = client.get("/api/portfolio").json()
    assert body["cash_balance"] == 10000.0
    assert body["total_value"] == 10000.0
    assert body["positions"] == []


def test_api_trade_round_trip(client):
    client.app.state.price_cache.update("AAPL", 100.0)
    resp = client.post("/api/portfolio/trade", json={"ticker": "aapl", "quantity": 2.5, "side": "buy"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["trade"]["ticker"] == "AAPL"
    assert body["portfolio"]["cash_balance"] == 9750.0
    assert body["portfolio"]["positions"][0]["quantity"] == 2.5

    assert client.get("/api/portfolio").json()["positions"][0]["ticker"] == "AAPL"
    assert len(client.get("/api/portfolio/history").json()["snapshots"]) >= 1

    resp = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2.5, "side": "sell"})
    assert resp.status_code == 200
    assert resp.json()["portfolio"]["positions"] == []


def test_api_trade_errors(client):
    client.app.state.price_cache.update("AAPL", 100.0)
    resp = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1000, "side": "buy"})
    assert resp.status_code == 400
    assert "insufficient cash" in resp.json()["detail"]
    resp = client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "sell"})
    assert resp.status_code == 400
    assert "insufficient shares" in resp.json()["detail"]
    assert client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 0, "side": "buy"}).status_code == 422
    assert client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1}).status_code == 422
