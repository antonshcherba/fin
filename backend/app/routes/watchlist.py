import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app import watchlist
from app.deps import get_db

router = APIRouter()


class AddTickerRequest(BaseModel):
    ticker: str


@router.get("/api/watchlist")
def get_watchlist(request: Request, conn: sqlite3.Connection = Depends(get_db)) -> list[dict[str, Any]]:
    return watchlist.list_watchlist(conn, request.app.state.price_cache)


@router.post("/api/watchlist", status_code=201)
def add_ticker(
    body: AddTickerRequest, request: Request, conn: sqlite3.Connection = Depends(get_db)
) -> dict[str, Any]:
    try:
        return watchlist.add_to_watchlist(
            conn, request.app.state.market_source, request.app.state.price_cache, body.ticker
        )
    except watchlist.InvalidTickerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except watchlist.TickerAlreadyWatchedError as exc:
        raise HTTPException(status_code=409, detail=f"{exc} is already on the watchlist") from exc


@router.delete("/api/watchlist/{ticker}")
def remove_ticker(
    ticker: str, request: Request, conn: sqlite3.Connection = Depends(get_db)
) -> dict[str, str]:
    try:
        removed = watchlist.remove_from_watchlist(conn, request.app.state.market_source, ticker)
    except watchlist.InvalidTickerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except watchlist.TickerNotWatchedError as exc:
        raise HTTPException(status_code=404, detail=f"{exc} is not on the watchlist") from exc
    return {"ticker": removed}
