import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


@dataclass(frozen=True)
class Settings:
    db_path: Path = field(
        default_factory=lambda: Path(os.environ.get("FINALLY_DB_PATH") or REPO_ROOT / "db" / "finally.db")
    )
    static_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("FINALLY_STATIC_DIR") or BACKEND_DIR / "static")
    )
    massive_api_key: str = field(default_factory=lambda: os.environ.get("MASSIVE_API_KEY", ""))
    massive_poll_interval: float = field(
        default_factory=lambda: float(os.environ.get("MASSIVE_POLL_INTERVAL") or 15.0)
    )
    sse_interval: float = 0.5
    snapshot_interval: float = 30.0
