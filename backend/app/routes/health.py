import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_db

router = APIRouter()


@router.get("/api/health")
def health(conn: sqlite3.Connection = Depends(get_db)) -> dict[str, str]:
    try:
        conn.execute("SELECT 1 FROM users_profile LIMIT 1").fetchone()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"status": "ok"}
