"""WebSocket endpoint for browser clients.

Protocol (JSON messages from client):
  { "type": "auth",        "token": "<jwt>" }   ← required first message
  { "type": "ping" }
  { "type": "subscribe",   "tickers": ["AAPL", "MSFT"] }
  { "type": "unsubscribe", "tickers": ["AAPL"] }

Server sends:
  { "type": "pong" }
  { "type": "quote", "ticker": "AAPL", "data": { ... } }
  { "type": "subscribed", "tickers": ["AAPL", "MSFT"] }
  { "type": "unsubscribed", "tickers": ["AAPL"] }
  { "type": "restored", "tickers": ["AAPL", "MSFT"] }
  { "type": "error", "message": "..." }

Authentication:
  Open the connection unauthenticated, then send `{type: "auth", token: <jwt>}`
  as the first frame within AUTH_TIMEOUT_SECONDS. The server closes the
  connection with code 4001 if the frame is missing, malformed, or the token
  fails verification. Putting the JWT in the first frame instead of the
  upgrade URL keeps it out of access logs and the browser's Referer header.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import verify_token

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter()

# How long to wait for the first {type: "auth", token: ...} frame before
# closing as unauthorized. Long enough to absorb a slow client, short enough
# that an attacker can't tie up a connection slot indefinitely.
AUTH_TIMEOUT_SECONDS = 5.0

# set by main.py on startup
_manager: ConnectionManager | None = None


def set_manager(manager: ConnectionManager) -> None:
    """Set the shared ConnectionManager instance at app startup."""
    global _manager
    _manager = manager


async def _send(ws: WebSocket, payload: dict) -> None:
    """Send a JSON payload to the websocket client."""
    await ws.send_text(json.dumps(payload))


def _normalize_tickers(value: object) -> list[str] | None:
    """Validate and normalize incoming ticker array.

    Returns None when input is not an array.
    """
    if not isinstance(value, list):
        return None

    tickers: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        ticker = item.strip().upper()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        tickers.append(ticker)
    return tickers


async def _handle_message(manager: ConnectionManager, ws: WebSocket, msg: dict) -> None:
    """Handle one inbound websocket client message."""
    msg_type = msg.get("type")

    if msg_type == "ping":
        await _send(ws, {"type": "pong"})
        return

    if msg_type not in ("subscribe", "unsubscribe"):
        await _send(
            ws, {"type": "error", "message": f"Unknown message type: {msg_type}"}
        )
        return

    tickers = _normalize_tickers(msg.get("tickers", []))
    if tickers is None:
        await _send(ws, {"type": "error", "message": "tickers must be an array"})
        return

    if msg_type == "subscribe":
        await manager.subscribe(ws, tickers)
        await _send(ws, {"type": "subscribed", "tickers": tickers})
        return

    await manager.unsubscribe(ws, tickers)
    await _send(ws, {"type": "unsubscribed", "tickers": tickers})


async def _await_auth_token(ws: WebSocket) -> str | None:
    """Wait for the first frame and extract its `token` field.

    Returns the token string when the frame is a valid
    `{type: "auth", token: "<jwt>"}` payload received within
    AUTH_TIMEOUT_SECONDS. Returns None on timeout, malformed JSON,
    wrong-shape payload, or if the client disconnects first.
    """
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
    except (TimeoutError, WebSocketDisconnect):
        return None

    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(msg, dict):
        return None
    if msg.get("type") != "auth":
        return None
    token = msg.get("token")
    return token if isinstance(token, str) and token else None


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Main websocket endpoint for quote subscriptions."""
    manager = _manager
    if manager is None:
        # accept first so the browser receives a structured close instead of
        # a network-level upgrade failure (which surfaces as a generic
        # WebSocket error in devtools without a code).
        await ws.accept()
        await ws.close(code=1011, reason="Server not ready")
        return

    # Accept the connection unauthenticated, then require the first frame
    # to be `{type: "auth", token: "<jwt>"}`. Keeps the JWT out of the
    # request URL (and therefore out of access logs and Referer headers).
    await ws.accept()
    token = await _await_auth_token(ws)
    payload = verify_token(token) if token else None
    if payload is None:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id = payload.get("sub", "unknown")
    await manager.connect(ws, user_id, already_accepted=True)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(ws, {"type": "error", "message": "Invalid JSON"})
                continue

            await _handle_message(manager, ws, msg)

    except WebSocketDisconnect:
        logger.info("User %s left (WebSocket closed by client)", user_id)
    except Exception:
        logger.exception("WebSocket error for user %s", user_id)
    finally:
        await manager.disconnect(ws)
