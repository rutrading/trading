"""Tests for the /api/ws WebSocket endpoint authentication.

Covers Should-fix item 10 in the audit: missing/invalid token close codes,
and that a valid token routes through to manager.connect with the right
user_id.
"""

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
    """Replace the WS manager with a MagicMock that drives the connect/disconnect
    flow without actually maintaining state.

    The real ConnectionManager.connect() calls ws.accept() — without that,
    Starlette's TestClient blocks forever waiting on the handshake. We forward
    that one call through.
    """
    fake = MagicMock()

    async def fake_connect(ws, user_id):
        await ws.accept()

    fake.connect = AsyncMock(side_effect=fake_connect)
    fake.disconnect = AsyncMock()
    fake.subscribe = AsyncMock(return_value=[])
    fake.unsubscribe = AsyncMock(return_value=[])
    monkeypatch.setattr(ws_router, "_manager", fake)
    return fake


class TestWebSocketAuth:
    def test_missing_token_closes_with_4001(self, fake_manager):
        # Force SKIP_AUTH off so verify_token actually runs
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(auth_module, "SKIP_AUTH", False)
            with pytest.raises(WebSocketDisconnect) as excinfo:
                with client.websocket_connect("/api/ws") as ws:
                    ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_invalid_token_closes_with_4001(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        # verify_token returns None for tokens that fail JWKS lookup
        monkeypatch.setattr(ws_router, "verify_token", lambda token: None)
        with pytest.raises(WebSocketDisconnect) as excinfo:
            with client.websocket_connect("/api/ws?token=bogus") as ws:
                ws.receive_text()
        assert excinfo.value.code == 4001
        fake_manager.connect.assert_not_called()

    def test_valid_token_calls_manager_connect_with_user_id(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        monkeypatch.setattr(
            ws_router, "verify_token", lambda token: {"sub": "user-xyz"}
        )
        # Connect successfully and immediately close from the client side.
        # The handler's outer `while True: await receive_text()` raises
        # WebSocketDisconnect on the close frame and runs the finally clause.
        with client.websocket_connect("/api/ws?token=good"):
            pass
        fake_manager.connect.assert_awaited_once()
        # connect(ws, user_id) — second positional is the user_id
        called_user_id = fake_manager.connect.await_args.args[1]
        assert called_user_id == "user-xyz"
        fake_manager.disconnect.assert_awaited_once()

    def test_payload_without_sub_uses_unknown(self, fake_manager, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
        monkeypatch.setattr(ws_router, "verify_token", lambda token: {})
        with client.websocket_connect("/api/ws?token=anything"):
            pass
        fake_manager.connect.assert_awaited_once()
        called_user_id = fake_manager.connect.await_args.args[1]
        assert called_user_id == "unknown"
