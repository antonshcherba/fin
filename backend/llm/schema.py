import json
import re

from pydantic import BaseModel, Field, ValidationError


class MalformedLLMResponse(ValueError):
    """The model's output could not be parsed into the structured schema."""


class LLMTrade(BaseModel):
    ticker: str
    side: str
    quantity: float


class LLMWatchlistChange(BaseModel):
    ticker: str
    action: str


class LLMResponse(BaseModel):
    message: str
    trades: list[LLMTrade] = Field(default_factory=list)
    watchlist_changes: list[LLMWatchlistChange] = Field(default_factory=list)


# Strict mode needs every property listed in `required` and additionalProperties=false; the parser
# below stays lenient and treats missing trades/watchlist_changes as empty.
RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "finally_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "trades": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ticker": {"type": "string"},
                            "side": {"type": "string", "enum": ["buy", "sell"]},
                            "quantity": {"type": "number"},
                        },
                        "required": ["ticker", "side", "quantity"],
                        "additionalProperties": False,
                    },
                },
                "watchlist_changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ticker": {"type": "string"},
                            "action": {"type": "string", "enum": ["add", "remove"]},
                        },
                        "required": ["ticker", "action"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["message", "trades", "watchlist_changes"],
            "additionalProperties": False,
        },
    },
}

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL | re.IGNORECASE)


def parse_llm_output(raw: str | None) -> LLMResponse:
    """Parse the model's raw text, tolerating code fences and prose around the JSON object."""
    text = (raw or "").strip()
    if not text:
        raise MalformedLLMResponse("empty response")
    if fenced := _FENCE.match(text):
        text = fenced.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise MalformedLLMResponse("response is not valid JSON") from None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            raise MalformedLLMResponse("response is not valid JSON") from None
    if not isinstance(data, dict):
        raise MalformedLLMResponse("response must be a JSON object")
    try:
        return LLMResponse.model_validate(data)
    except ValidationError as exc:
        fields = ", ".join(".".join(str(p) for p in e["loc"]) for e in exc.errors())
        raise MalformedLLMResponse(f"response does not match the schema ({fields})") from exc
