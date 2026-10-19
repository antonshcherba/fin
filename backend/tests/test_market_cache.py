from market import PriceCache


def test_first_update_has_flat_direction():
    tick = PriceCache().update("aapl", 190.0, timestamp=1.0)
    assert (tick.ticker, tick.price, tick.previous_price, tick.direction) == ("AAPL", 190.0, 190.0, "flat")


def test_update_tracks_previous_and_direction():
    cache = PriceCache()
    cache.update("AAPL", 190.0, timestamp=1.0)
    up = cache.update("AAPL", 191.0, timestamp=2.0)
    assert (up.previous_price, up.direction, up.timestamp) == (190.0, "up", 2.0)
    down = cache.update("AAPL", 190.5, timestamp=3.0)
    assert (down.previous_price, down.direction) == (191.0, "down")


def test_unchanged_price_keeps_last_move():
    cache = PriceCache()
    cache.update("AAPL", 190.0, timestamp=1.0)
    cache.update("AAPL", 191.0, timestamp=2.0)
    tick = cache.update("AAPL", 191.0, timestamp=3.0)
    assert (tick.direction, tick.timestamp) == ("up", 2.0)


def test_lookup_is_case_insensitive_and_remove_works():
    cache = PriceCache()
    cache.update("msft", 420.0)
    assert "MSFT" in cache and cache.get_price("Msft") == 420.0
    cache.remove("msft")
    assert cache.get("MSFT") is None and len(cache) == 0


def test_tick_to_dict_shape():
    tick = PriceCache().update("V", 280.0, timestamp=5.0)
    assert tick.to_dict() == {
        "ticker": "V",
        "price": 280.0,
        "previous_price": 280.0,
        "timestamp": 5.0,
        "direction": "flat",
    }
