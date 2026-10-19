from fastapi.testclient import TestClient

from app.main import create_app


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_startup_initializes_database(client, settings):
    assert settings.db_path.exists()


def test_unknown_api_route_404_without_static(client):
    assert client.get("/api/nope").status_code == 404


def test_serves_static_export_when_present(settings):
    settings.static_dir.mkdir()
    (settings.static_dir / "index.html").write_text("<h1>FinAlly</h1>")
    (settings.static_dir / "app.js").write_text("console.log(1)")
    with TestClient(create_app(settings)) as client:
        assert "FinAlly" in client.get("/").text
        assert client.get("/app.js").status_code == 200
        assert client.get("/api/health").json() == {"status": "ok"}


def test_no_static_mount_when_dir_missing(client):
    assert client.get("/").status_code == 404


def test_get_db_dependency_yields_seeded_connection(client):
    from app.deps import get_db

    request = type("R", (), {"app": client.app})()
    gen = get_db(request)
    conn = next(gen)
    assert conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()[0] == 10
    gen.close()
