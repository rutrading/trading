"""WebSocket endpoint for browser clients.

Protocol (JSON messages from client):
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
  Pass JWT as a query parameter: ws://host/api/ws?token=<jwt>
  In dev mode (SKIP_AUTH=true), no token is needed.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import verify_token

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter()

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


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Main websocket endpoint for quote subscriptions."""
    manager = _manager
    if manager is None:
        await ws.close(code=1011, reason="Server not ready")
        return

    # authenticate via query param token
    token = ws.query_params.get("token")
    payload = verify_token(token)
    if payload is None:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id = payload.get("sub", "unknown")
    await manager.connect(ws, user_id)

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
