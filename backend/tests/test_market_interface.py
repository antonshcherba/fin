import asyncio
import inspect

import httpx2 as httpx
import pytest

from market import MarketDataSource, MarketSimulator, MassiveDataSource, PriceCache, create_market_source


def _massive(cache, tickers):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    return MassiveDataSource(cache, tickers, api_key="k", client=client)


FACTORIES = {
    "simulator": lambda cache, tickers: MarketSimulator(cache, tickers),
    "massive": _massive,
}


@pytest.fixture(params=FACTORIES)
def source(request):
    cache = PriceCache()
    return FACTORIES[request.param](cache, ["AAPL", "GOOGL"])


def test_is_market_data_source(source):
    assert isinstance(source, MarketDataSource)
    assert inspect.iscoroutinefunction(source.start)
    assert inspect.iscoroutinefunction(source.stop)


def test_ticker_management_is_normalised_and_idempotent(source):
    assert source.tickers == {"AAPL", "GOOGL"}
    source.add_ticker(" msft ")
    source.add_ticker("MSFT")
    assert source.tickers == {"AAPL", "GOOGL", "MSFT"}
    source.remove_ticker("msft")
    source.remove_ticker("MSFT")
    assert source.tickers == {"AAPL", "GOOGL"}
    assert source.cache.get("MSFT") is None


def test_lifecycle_is_restartable(source):
    async def scenario():
        await source.start()
        await source.stop()
        await source.stop()
        await source.start()
        await source.stop()

    asyncio.run(scenario())


def test_abstract_base_cannot_be_instantiated():
    with pytest.raises(TypeError):
        MarketDataSource(PriceCache())


def test_factory_selects_by_api_key():
    cache = PriceCache()
    assert isinstance(create_market_source(cache, ["AAPL"]), MarketSimulator)
    assert isinstance(create_market_source(cache, ["AAPL"], massive_api_key="  "), MarketSimulator)
    massive = create_market_source(cache, ["AAPL"], massive_api_key=" key ", massive_poll_interval=5)
    assert isinstance(massive, MassiveDataSource)
    assert massive.poll_interval == 5
