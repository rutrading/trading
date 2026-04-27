"""Tests for the /api/ws WebSocket endpoint authentication.

The router accepts unauthenticated, then expects the first frame to be
`{type: "auth", token: "<jwt>"}`. These tests cover:
  - missing first frame (timeout)
  - malformed JSON in the first frame
  - wrong message type
  - missing/empty token field
  - invalid token (verify_token returns None)
  - valid token (manager.connect awaited with the right user_id, no double-accept)
  - valid token with payload missing `sub` falls back to "unknown"
"""

import json
import os

os.environ["SKIP_AUTH"] = "false"

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect

from app import auth as auth_module
from app.main import app
from app.ws import router as ws_router

client = TestClient(app)


@pytest.fixture
def fake_manager(monkeypatch):
    """Replace the WS manager with a MagicMock that drives connect/disconnect.

    The router now accepts the WebSocket itself before reading the first
    frame, then passes `already_accepted=True` into manager.connect — so
    the fake should NOT call ws.accept() (would raise "WebSocket is not
    connected"). The mock just records the call and returns.
    """
    fake = MagicMock()
    fake.connect = AsyncMock(return_value=None)
    fake.disconnect = AsyncMock()
    fake.subscribe = AsyncMock(return_value=[])
    fake.unsubscribe = AsyncMock(return_value=[])
    fake.get_ws_tickers = MagicMock(return_value=set())
    monkeypatch.setattr(ws_router, "_manager", fake)
    return fake


@pytest.fixture(autouse=True)
def _short_auth_timeout(monkeypatch):
    # Keep the unit-test timeout fast so the missing-frame case doesn't
    # add 5 real seconds to every test run.
    monkeypatch.setattr(ws_router, "AUTH_TIMEOUT_SECONDS", 0.2)
    yield


class TestWebSocketAuth:
    def test_missing_first_frame_closes_with_4001(self, fake_manager):
        """Client connects but never sends the auth frame → server closes 4001."""
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(auth_module, "SKIP_AUTH", False)
            with pytest.raises(WebSocketDisconnect) as excinfo:
                with client.websocket_connect("/api/ws") as ws:
                    # Wait for the server to give up and close us.
                    ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_malformed_first_frame_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws") as ws:
                ws.send_text("not json {{{")
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_wrong_type_first_frame_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws") as ws:
                ws.send_text(json.dumps({"type": "ping"}))
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_missing_token_field_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws") as ws:
                ws.send_text(json.dumps({"type": "auth"}))  # no token
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_empty_token_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws") as ws:
                ws.send_text(json.dumps({"type": "auth", "token": ""}))
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_invalid_token_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        # verify_token returns None for tokens that fail JWKS lookup
        monkeypatch.setattr(ws_router, "verify_token", lambda token: None)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws") as ws:
                ws.send_text(json.dumps({"type": "auth", "token": "bogus"}))
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_valid_token_calls_manager_connect_with_user_id(
        self, fake_manager, monkeypatch
    ):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        monkeypatch.setattr(
            ws_router, "verify_token", lambda token: {"sub": "user-xyz"}
        )
        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good"}))
            # Close from the client side. The handler's outer receive loop
            # raises WebSocketDisconnect and runs the finally clause that
            # calls manager.disconnect.
        fake_manager.connect.assert_awaited_once()
        # connect(ws, user_id, already_accepted=True)
        call = fake_manager.connect.await_args
        assert call.args[1] == "user-xyz"
        assert call.kwargs.get("already_accepted") is True
        fake_manager.disconnect.assert_awaited_once()

    def test_payload_without_sub_uses_unknown(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        monkeypatch.setattr(ws_router, "verify_token", lambda token: {})
        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "anything"}))
        fake_manager.connect.assert_awaited_once()
        assert fake_manager.connect.await_args.args[1] == "unknown"


class TestSnapshotOnSubscribe:
    """Verify the router pushes Redis state to a client right after subscribe.

    Without this, a fresh subscriber would have to wait for the next upstream
    tick — which can be a quote-only (bid/ask) tick that carries no `price`,
    leaving the chart and order form stuck on whatever the page-load REST
    snapshot returned.
    """

    def _read_n(self, ws, n: int) -> list[dict]:
        return [json.loads(ws.receive_text()) for _ in range(n)]

    def _auth(self, monkeypatch, fake_manager, accepted: set[str]):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        monkeypatch.setattr(ws_router, "verify_token", lambda t: {"sub": "u1"})
        fake_manager.get_ws_tickers.return_value = accepted

    def test_sends_snapshot_after_subscribe_ack(self, fake_manager, monkeypatch):
        from app.schemas import QuoteData

        async def fake_read(ticker):
            return QuoteData(
                ticker=ticker,
                price=100.5,
                bid_price=100.4,
                ask_price=100.6,
                timestamp=1700000000,
                source="alpaca_ws",
            )

        monkeypatch.setattr(ws_router, "read_redis", fake_read)
        self._auth(monkeypatch, fake_manager, {"AAPL"})

        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good"}))
            ws.send_text(json.dumps({"type": "subscribe", "tickers": ["AAPL"]}))
            ack, snapshot = self._read_n(ws, 2)

        assert ack["type"] == "subscribed"
        assert ack["tickers"] == ["AAPL"]
        assert snapshot["type"] == "quote"
        assert snapshot["ticker"] == "AAPL"
        assert snapshot["data"]["price"] == 100.5
        assert snapshot["data"]["bid_price"] == 100.4

    def test_skips_snapshot_when_redis_miss(self, fake_manager, monkeypatch):
        async def fake_read(ticker):
            return None

        monkeypatch.setattr(ws_router, "read_redis", fake_read)
        self._auth(monkeypatch, fake_manager, {"XYZ"})

        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good"}))
            ws.send_text(json.dumps({"type": "subscribe", "tickers": ["XYZ"]}))
            # Expect only the ack; no quote frame follows when Redis missed.
            (ack,) = self._read_n(ws, 1)

        assert ack["type"] == "subscribed"

    def test_snapshot_omits_none_fields(self, fake_manager, monkeypatch):
        from app.schemas import QuoteData

        async def fake_read(ticker):
            return QuoteData(
                ticker=ticker,
                bid_price=100.4,
                ask_price=100.6,
                timestamp=1700000000,
                source="alpaca_ws",
            )

        monkeypatch.setattr(ws_router, "read_redis", fake_read)
        self._auth(monkeypatch, fake_manager, {"BTC/USD"})

        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good"}))
            ws.send_text(
                json.dumps({"type": "subscribe", "tickers": ["BTC/USD"]})
            )
            _ack, snapshot = self._read_n(ws, 2)

        data = snapshot["data"]
        # None fields are stripped so a snapshot can't overwrite a
        # populated field already merged in the browser's quote map.
        assert "price" not in data
        assert data["bid_price"] == 100.4
        assert data["ask_price"] == 100.6

    def test_snapshot_only_for_accepted_tickers(self, fake_manager, monkeypatch):
        from app.schemas import QuoteData

        async def fake_read(ticker):
            return QuoteData(ticker=ticker, price=1.0, timestamp=1700000000)

        monkeypatch.setattr(ws_router, "read_redis", fake_read)
        # Manager accepted AAPL but dropped MSFT (e.g. per-connection cap).
        self._auth(monkeypatch, fake_manager, {"AAPL"})

        with client.websocket_connect("/api/ws") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good"}))
            ws.send_text(
                json.dumps({"type": "subscribe", "tickers": ["AAPL", "MSFT"]})
            )
            _ack, snapshot = self._read_n(ws, 2)

        assert snapshot["type"] == "quote"
        assert snapshot["ticker"] == "AAPL"
