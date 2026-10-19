import sqlite3
from collections.abc import Iterator

from fastapi import Request

from app.config import Settings
from db import get_connection


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = get_connection(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
