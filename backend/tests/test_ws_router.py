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
