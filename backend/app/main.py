import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import Settings
from app.routes import health, portfolio, stream, watchlist
from db import DEFAULT_USER_ID, get_connection, init_db
from market import PriceCache, create_market_source
from portfolio import snapshot_loop


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        init_db(settings.db_path)
        conn = get_connection(settings.db_path)
        try:
            rows = conn.execute("SELECT ticker FROM watchlist WHERE user_id = ?", (DEFAULT_USER_ID,)).fetchall()
        finally:
            conn.close()
        source = create_market_source(
            app.state.price_cache,
            [row["ticker"] for row in rows],
            massive_api_key=settings.massive_api_key,
            massive_poll_interval=settings.massive_poll_interval,
        )
        app.state.market_source = source
        await source.start()
        snapshots = asyncio.create_task(
            snapshot_loop(settings.db_path, app.state.price_cache, settings.snapshot_interval)
        )
        try:
            yield
        finally:
            snapshots.cancel()
            await asyncio.gather(snapshots, return_exceptions=True)
            await source.stop()

    app = FastAPI(title="FinAlly", lifespan=lifespan)
    app.state.settings = settings
    app.state.price_cache = PriceCache()

    app.include_router(health.router)
    app.include_router(stream.router)
    app.include_router(watchlist.router)
    app.include_router(portfolio.router)

    # Mounted last so /api/* routes registered above take precedence.
    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")

    return app


app = create_app()
