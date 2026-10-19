import json
from types import SimpleNamespace

import litellm
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from db import get_connection
from llm import MalformedLLMResponse, mock_complete, parse_llm_output
from llm.schema import RESPONSE_FORMAT


@pytest.fixture
def mock_client(tmp_path):
    settings = Settings(db_path=tmp_path / "db" / "finally.db", static_dir=tmp_path / "static", llm_mock=True)
    with TestClient(create_app(settings)) as c:
        c.app.state.price_cache.update("AAPL", 100.0)
        c.app.state.price_cache.update("TSLA", 250.0)
        yield c


@pytest.fixture
def live_client(tmp_path):
    settings = Settings(
        db_path=tmp_path / "db" / "finally.db",
        static_dir=tmp_path / "static",
        llm_mock=False,
        openrouter_api_key="test-key",
    )
    with TestClient(create_app(settings)) as c:
        c.app.state.price_cache.update("AAPL", 100.0)
        yield c


def fake_llm(monkeypatch, content):
    calls = []

    def completion(**kwargs):
        calls.append(kwargs)
        if isinstance(content, Exception):
            raise content
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    monkeypatch.setattr(litellm, "completion", completion)
    return calls


def chat_rows(client):
    conn = get_connection(client.app.state.settings.db_path)
    try:
        return [dict(r) for r in conn.execute("SELECT role, content, actions FROM chat_messages ORDER BY rowid")]
    finally:
        conn.close()


# --- parsing ---


def test_parse_full_response():
    raw = json.dumps(
        {
            "message": "Buying.",
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
            "watchlist_changes": [{"ticker": "PYPL", "action": "add"}],
        }
    )
    parsed = parse_llm_output(raw)
    assert parsed.message == "Buying."
    assert (parsed.trades[0].ticker, parsed.trades[0].side, parsed.trades[0].quantity) == ("AAPL", "buy", 10.0)
    assert (parsed.watchlist_changes[0].ticker, parsed.watchlist_changes[0].action) == ("PYPL", "add")


def test_parse_message_only_defaults_to_no_actions():
    parsed = parse_llm_output('{"message": "Hi"}')
    assert parsed.trades == [] and parsed.watchlist_changes == []


@pytest.mark.parametrize(
    "raw",
    [
        '```json\n{"message": "Hi"}\n```',
        '```\n{"message": "Hi"}\n```',
        'Sure! {"message": "Hi"} Hope that helps.',
        '  {"message": "Hi"}  ',
    ],
)
def test_parse_tolerates_wrapping(raw):
    assert parse_llm_output(raw).message == "Hi"


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "   ",
        "just some prose",
        '{"message": "unterminated',
        "[1, 2, 3]",
        '"a string"',
        '{"trades": []}',
        '{"message": 5}',
        '{"message": "x", "trades": [{"ticker": "AAPL"}]}',
        '{"message": "x", "trades": "buy everything"}',
    ],
)
def test_parse_malformed_raises(raw):
    with pytest.raises(MalformedLLMResponse):
        parse_llm_output(raw)


def test_response_format_is_strict_schema():
    schema = RESPONSE_FORMAT["json_schema"]["schema"]
    assert RESPONSE_FORMAT["json_schema"]["strict"] is True
    assert schema["required"] == ["message", "trades", "watchlist_changes"]
    assert schema["additionalProperties"] is False


# --- mock ---

EMPTY_PORTFOLIO = {"positions": [], "total_value": 10000.0, "cash_balance": 10000.0}


def test_mock_is_deterministic_and_parseable():
    first = mock_complete("how am I doing?", EMPTY_PORTFOLIO)
    assert first == mock_complete("how am I doing?", EMPTY_PORTFOLIO)
    parsed = parse_llm_output(first)
    assert "$10,000.00" in parsed.message
    assert parsed.trades == [] and parsed.watchlist_changes == []


def test_mock_extracts_actions():
    parsed = parse_llm_output(mock_complete("Buy 5 aapl and add pypl to watchlist, then sell 2.5 TSLA", EMPTY_PORTFOLIO))
    assert [(t.ticker, t.side, t.quantity) for t in parsed.trades] == [("AAPL", "buy", 5.0), ("TSLA", "sell", 2.5)]
    assert [(c.ticker, c.action) for c in parsed.watchlist_changes] == [("PYPL", "add")]


# --- API in mock mode ---


def test_chat_plain_message_is_stored(mock_client):
    resp = mock_client.post("/api/chat", json={"message": "how is my portfolio?"})
    assert resp.status_code == 200
    body = resp.json()
    assert "$10,000.00" in body["message"]
    assert body["trades"] == [] and body["watchlist_changes"] == []
    rows = chat_rows(mock_client)
    assert [r["role"] for r in rows] == ["user", "assistant"]
    assert rows[0]["content"] == "how is my portfolio?" and rows[0]["actions"] is None
    assert rows[1]["content"] == body["message"] and rows[1]["actions"] is None


def test_chat_auto_executes_trade(mock_client):
    body = mock_client.post("/api/chat", json={"message": "buy 10 AAPL"}).json()
    assert body["trades"] == [{"ticker": "AAPL", "side": "buy", "quantity": 10.0, "price": 100.0}]
    portfolio = mock_client.get("/api/portfolio").json()
    assert portfolio["cash_balance"] == 9000.0
    assert portfolio["positions"][0]["ticker"] == "AAPL"
    stored = json.loads(chat_rows(mock_client)[1]["actions"])
    assert stored["trades"] == body["trades"]


def test_chat_failed_trade_reports_error_and_changes_nothing(mock_client):
    body = mock_client.post("/api/chat", json={"message": "buy 1000 AAPL"}).json()
    assert len(body["trades"]) == 1
    assert "insufficient cash" in body["trades"][0]["error"]
    assert "price" not in body["trades"][0]
    assert mock_client.get("/api/portfolio").json()["cash_balance"] == 10000.0

    body = mock_client.post("/api/chat", json={"message": "sell 1 AAPL"}).json()
    assert "insufficient shares" in body["trades"][0]["error"]


def test_chat_unknown_ticker_trade_fails(mock_client):
    body = mock_client.post("/api/chat", json={"message": "buy 1 ZZZZ"}).json()
    assert "no price available" in body["trades"][0]["error"]


def test_chat_one_failure_does_not_block_other_trades(mock_client):
    body = mock_client.post("/api/chat", json={"message": "buy 1000 AAPL then buy 1 TSLA"}).json()
    assert "error" in body["trades"][0]
    assert body["trades"][1] == {"ticker": "TSLA", "side": "buy", "quantity": 1.0, "price": 250.0}
    assert mock_client.get("/api/portfolio").json()["cash_balance"] == 9750.0


def test_chat_watchlist_changes(mock_client):
    body = mock_client.post("/api/chat", json={"message": "add PYPL to watchlist"}).json()
    assert body["watchlist_changes"] == [{"ticker": "PYPL", "action": "add"}]
    tickers = [e["ticker"] for e in mock_client.get("/api/watchlist").json()]
    assert "PYPL" in tickers

    body = mock_client.post("/api/chat", json={"message": "add PYPL to watchlist"}).json()
    assert body["watchlist_changes"][0]["error"] == "PYPL is already on the watchlist"

    body = mock_client.post("/api/chat", json={"message": "remove PYPL from watchlist"}).json()
    assert body["watchlist_changes"] == [{"ticker": "PYPL", "action": "remove"}]
    body = mock_client.post("/api/chat", json={"message": "remove PYPL from watchlist"}).json()
    assert body["watchlist_changes"][0]["error"] == "PYPL is not on the watchlist"


def test_chat_request_validation(mock_client):
    assert mock_client.post("/api/chat", json={}).status_code == 422
    assert mock_client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert mock_client.post("/api/chat", json={"message": "x" * 4001}).status_code == 422
    assert chat_rows(mock_client) == []


# --- API against the (faked) LiteLLM call ---


def test_chat_calls_litellm_with_context_history_and_structured_output(live_client, monkeypatch):
    calls = fake_llm(monkeypatch, json.dumps({"message": "First.", "trades": [], "watchlist_changes": []}))
    live_client.post("/api/chat", json={"message": "hello"})
    calls = fake_llm(monkeypatch, json.dumps({"message": "Second.", "trades": [], "watchlist_changes": []}))
    live_client.post("/api/chat", json={"message": "and now?"})

    kwargs = calls[0]
    assert kwargs["model"] == "openrouter/openai/gpt-oss-120b"
    assert kwargs["api_key"] == "test-key"
    assert kwargs["response_format"] == RESPONSE_FORMAT
    assert kwargs["extra_body"] == {"provider": {"order": ["cerebras"]}}
    messages = kwargs["messages"]
    assert messages[0]["role"] == "system" and "FinAlly" in messages[0]["content"]
    context = json.loads(messages[1]["content"].split("\n", 1)[1])
    assert context["cash_balance"] == 10000.0 and context["total_value"] == 10000.0
    assert {w["ticker"] for w in context["watchlist"]} >= {"AAPL", "NVDA"}
    assert [(m["role"], m["content"]) for m in messages[2:]] == [
        ("user", "hello"),
        ("assistant", "First."),
        ("user", "and now?"),
    ]


def test_chat_history_includes_actions_taken(live_client, monkeypatch):
    fake_llm(
        monkeypatch,
        json.dumps({"message": "Done.", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}]}),
    )
    live_client.post("/api/chat", json={"message": "buy one"})
    calls = fake_llm(monkeypatch, '{"message": "ok"}')
    live_client.post("/api/chat", json={"message": "what did you do?"})
    assistant = calls[0]["messages"][3]
    assert assistant["role"] == "assistant"
    assert "Actions taken:" in assistant["content"] and '"price": 100.0' in assistant["content"]


def test_chat_history_is_limited(tmp_path, monkeypatch):
    settings = Settings(
        db_path=tmp_path / "finally.db", static_dir=tmp_path / "s", openrouter_api_key="k", chat_history_limit=2
    )
    with TestClient(create_app(settings)) as c:
        calls = fake_llm(monkeypatch, '{"message": "reply"}')
        for i in range(3):
            c.post("/api/chat", json={"message": f"m{i}"})
        sent = [m["content"] for m in calls[-1]["messages"][2:]]
        assert sent == ["m1", "reply", "m2"]  # 2 most recent history rows + the new message


def test_chat_malformed_output_is_reported_and_no_actions_run(live_client, monkeypatch):
    fake_llm(monkeypatch, "I think you should buy AAPL!")
    resp = live_client.post("/api/chat", json={"message": "buy something"})
    assert resp.status_code == 200
    body = resp.json()
    assert "couldn't understand" in body["message"]
    assert body["trades"] == [] and body["watchlist_changes"] == []
    assert body["error"]
    assert live_client.get("/api/portfolio").json()["cash_balance"] == 10000.0
    assert len(chat_rows(live_client)) == 2


def test_chat_code_fenced_output_still_executes(live_client, monkeypatch):
    payload = {"message": "Bought.", "trades": [{"ticker": "aapl", "side": "BUY", "quantity": 2}]}
    fake_llm(monkeypatch, f"```json\n{json.dumps(payload)}\n```")
    body = live_client.post("/api/chat", json={"message": "buy 2 aapl"}).json()
    assert body["message"] == "Bought."
    assert body["trades"] == [{"ticker": "AAPL", "side": "buy", "quantity": 2.0, "price": 100.0}]


def test_chat_invalid_side_and_action_are_reported(live_client, monkeypatch):
    payload = {
        "message": "x",
        "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}],
        "watchlist_changes": [{"ticker": "PYPL", "action": "ignore"}, {"ticker": "!!", "action": "add"}],
    }
    fake_llm(monkeypatch, json.dumps(payload))
    body = live_client.post("/api/chat", json={"message": "go"}).json()
    assert "side must be" in body["trades"][0]["error"]
    assert "action must be" in body["watchlist_changes"][0]["error"]
    assert "invalid ticker" in body["watchlist_changes"][1]["error"]


def test_chat_provider_failure_is_502_and_stores_nothing(live_client, monkeypatch):
    fake_llm(monkeypatch, RuntimeError("boom"))
    resp = live_client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 502
    assert "RuntimeError" in resp.json()["detail"]
    assert chat_rows(live_client) == []


def test_chat_without_api_key_is_503(tmp_path, monkeypatch):
    calls = fake_llm(monkeypatch, '{"message": "never"}')
    settings = Settings(db_path=tmp_path / "finally.db", static_dir=tmp_path / "s", openrouter_api_key="")
    with TestClient(create_app(settings)) as c:
        resp = c.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 503
    assert "OPENROUTER_API_KEY" in resp.json()["detail"]
    assert calls == []


def test_llm_mock_env_flag(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "TRUE")
    assert Settings().llm_mock is True
    monkeypatch.setenv("LLM_MOCK", "false")
    assert Settings().llm_mock is False
    monkeypatch.delenv("LLM_MOCK")
    assert Settings().llm_mock is False
