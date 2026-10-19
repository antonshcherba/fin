import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from market import PriceCache

router = APIRouter()

KEEPALIVE_AFTER_SECONDS = 15.0


async def price_events(
    cache: PriceCache,
    request: Request | None = None,
    *,
    interval: float = 0.5,
) -> AsyncIterator[str]:
    """Yield SSE frames: the full cache on connect, then every tick that changed since the last frame.

    Each tick is its own default-named event so the browser's EventSource.onmessage receives it.
    """
    yield "retry: 1000\n\n"
    sent: dict[str, float] = {}
    idle = 0.0
    while request is None or not await request.is_disconnected():
        frames = []
        for ticker, tick in cache.snapshot().items():
            if sent.get(ticker) != tick.timestamp:
                sent[ticker] = tick.timestamp
                frames.append(f"data: {json.dumps(tick.to_dict())}\n\n")
        if frames:
            idle = 0.0
            for frame in frames:
                yield frame
        elif idle >= KEEPALIVE_AFTER_SECONDS:
            idle = 0.0
            yield ": keepalive\n\n"
        await asyncio.sleep(interval)
        idle += interval


@router.get("/api/stream/prices")
async def stream_prices(request: Request) -> StreamingResponse:
    return StreamingResponse(
        price_events(request.app.state.price_cache, request, interval=request.app.state.settings.sse_interval),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
