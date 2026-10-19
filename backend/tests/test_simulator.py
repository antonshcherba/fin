import asyncio
import math
import random
import statistics

from market import MarketSimulator, PriceCache
from market.simulator import PROFILES, SECONDS_PER_TRADING_YEAR, gbm_step


def test_gbm_step_zero_shock_is_deterministic_drift():
    dt = 1e-4
    expected = 100.0 * math.exp((0.1 - 0.5 * 0.2**2) * dt)
    assert gbm_step(100.0, 0.1, 0.2, dt, 0.0) == expected


def test_gbm_step_positive_shock_raises_price_and_stays_positive():
    assert gbm_step(100.0, 0.0, 0.3, 1e-3, 1.0) > gbm_step(100.0, 0.0, 0.3, 1e-3, -1.0) > 0
    assert gbm_step(100.0, 0.0, 0.3, 1.0, -10.0) > 0


def test_gbm_log_returns_match_theory():
    rng = random.Random(7)
    mu, sigma, dt = 0.08, 0.3, 1e-3
    logs = [math.log(gbm_step(1.0, mu, sigma, dt, rng.gauss(0, 1))) for _ in range(20000)]
    assert abs(statistics.fmean(logs) - (mu - 0.5 * sigma**2) * dt) < 5e-5
    assert abs(statistics.stdev(logs) - sigma * math.sqrt(dt)) < 5e-4


def test_seeds_cache_with_realistic_prices():
    cache = PriceCache()
    MarketSimulator(cache, ["AAPL", "GOOGL"])
    assert cache.get_price("AAPL") == PROFILES["AAPL"].seed_price
    assert cache.get_price("GOOGL") == PROFILES["GOOGL"].seed_price


def test_step_keeps_prices_positive_and_rounded():
    cache = PriceCache()
    sim = MarketSimulator(cache, list(PROFILES), rng=random.Random(1))
    for _ in range(500):
        sim.step()
    for tick in cache.snapshot().values():
        assert tick.price > 0
        assert tick.price == round(tick.price, 2)


def test_step_moves_are_small_without_events():
    cache = PriceCache()
    sim = MarketSimulator(cache, ["AAPL"], event_probability=0.0, rng=random.Random(2))
    last = cache.get_price("AAPL")
    for _ in range(200):
        sim.step()
        price = cache.get_price("AAPL")
        assert abs(price / last - 1) < 0.01
        last = price


def test_events_are_two_to_five_percent_moves():
    cache = PriceCache()
    sim = MarketSimulator(cache, ["AAPL"], event_probability=1.0, rng=random.Random(3))
    last = cache.get_price("AAPL")
    for _ in range(100):
        sim.step()
        price = cache.get_price("AAPL")
        # event magnitude plus a little GBM noise on either side
        assert 0.018 <= abs(price / last - 1) <= 0.052
        last = price


def _correlation(xs, ys):
    return statistics.correlation(xs, ys)


def test_same_sector_moves_more_correlated_than_cross_sector():
    cache = PriceCache()
    sim = MarketSimulator(cache, ["AAPL", "MSFT", "JPM"], event_probability=0.0, rng=random.Random(4))
    series: dict[str, list[float]] = {t: [] for t in sim.tickers}
    last = {t: cache.get_price(t) for t in sim.tickers}
    for _ in range(4000):
        sim.step()
        for t in series:
            price = cache.get_price(t)
            series[t].append(math.log(price / last[t]))
            last[t] = price
    same = _correlation(series["AAPL"], series["MSFT"])
    cross = _correlation(series["AAPL"], series["JPM"])
    assert same > cross > 0.1


def test_add_and_remove_ticker():
    cache = PriceCache()
    sim = MarketSimulator(cache, ["AAPL"], rng=random.Random(5))
    sim.add_ticker("pypl")
    assert "PYPL" in sim.tickers
    assert 50 <= cache.get_price("PYPL") <= 300
    sim.step()
    sim.remove_ticker("PYPL")
    assert "PYPL" not in sim.tickers and cache.get("PYPL") is None
    sim.step()  # must not raise after removal


def test_dt_scales_with_interval():
    sim = MarketSimulator(PriceCache(), interval=0.5, time_scale=10.0)
    assert sim.dt == 0.5 * 10.0 / SECONDS_PER_TRADING_YEAR


def test_background_task_updates_cache_and_stops():
    async def scenario():
        cache = PriceCache()
        sim = MarketSimulator(cache, ["AAPL"], interval=0.01, rng=random.Random(6))
        await sim.start()
        await sim.start()  # idempotent
        await asyncio.sleep(0.2)
        await sim.stop()
        return cache.get("AAPL"), sim._task

    tick, task = asyncio.run(scenario())
    assert tick.price > 0 and tick.price != PROFILES["AAPL"].seed_price
    assert task is None
