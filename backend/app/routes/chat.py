import logging
import sqlite3
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, StringConstraints

from app import chat
from app.config import Settings
from app.deps import get_db, get_settings
from llm import LLMConfigError, LLMRequestError

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


@router.post("/api/chat")
def post_chat(
    body: ChatRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    try:
        return chat.handle_chat(
            conn, request.app.state.market_source, request.app.state.price_cache, settings, body.message
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMRequestError as exc:
        logger.exception("LLM request failed")
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc
