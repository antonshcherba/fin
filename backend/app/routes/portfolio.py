import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.deps import get_db
from market import PriceCache
from portfolio import TradeError, execute_trade, get_history, get_portfolio

router = APIRouter()


class TradeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    side: str


def get_price_cache(request: Request) -> PriceCache:
    return request.app.state.price_cache


@router.get("/api/portfolio")
def portfolio(conn: sqlite3.Connection = Depends(get_db), cache: PriceCache = Depends(get_price_cache)) -> dict:
    return get_portfolio(conn, cache)


@router.post("/api/portfolio/trade")
def trade(
    body: TradeRequest,
    conn: sqlite3.Connection = Depends(get_db),
    cache: PriceCache = Depends(get_price_cache),
) -> dict:
    try:
        result = execute_trade(conn, cache, body.ticker, body.quantity, body.side)
    except TradeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"trade": result.to_dict(), "portfolio": get_portfolio(conn, cache)}


@router.get("/api/portfolio/history")
def history(conn: sqlite3.Connection = Depends(get_db)) -> dict:
    return {"snapshots": get_history(conn)}
