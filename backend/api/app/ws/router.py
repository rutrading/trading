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
    global _manager
    _manager = manager


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    if _manager is None:
        await ws.close(code=1011, reason="Server not ready")
        return

    # authenticate via query param token
    token = ws.query_params.get("token")
    payload = verify_token(token)
    if payload is None:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id = payload.get("sub", "unknown")
    await _manager.connect(ws, user_id)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(
                    json.dumps({"type": "error", "message": "Invalid JSON"})
                )
                continue

            msg_type = msg.get("type")
            tickers = msg.get("tickers", [])

            if not isinstance(tickers, list):
                await ws.send_text(
                    json.dumps({"type": "error", "message": "tickers must be an array"})
                )
                continue

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "subscribe":
                await _manager.subscribe(ws, tickers)
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "subscribed",
                            "tickers": [t.upper() for t in tickers],
                        }
                    )
                )

            elif msg_type == "unsubscribe":
                await _manager.unsubscribe(ws, tickers)
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "unsubscribed",
                            "tickers": [t.upper() for t in tickers],
                        }
                    )
                )

            else:
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": f"Unknown message type: {msg_type}",
                        }
                    )
                )

    except WebSocketDisconnect:
        logger.info("User %s left (WebSocket closed by client)", user_id)
    except Exception:
        logger.exception("WebSocket error for user %s", user_id)
    finally:
        await _manager.disconnect(ws)
