import json
from unittest.mock import AsyncMock, MagicMock

from app.ws import manager as ws_manager
from app.ws.manager import ConnectionManager


def make_ws(user_id: str = "user1") -> MagicMock:
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.send_text = AsyncMock()
    return ws


async def connect(manager: ConnectionManager, ws, user_id: str = "user1"):
    await manager.connect(ws, user_id)


class TestConnect:
    async def test_connect_accepts_websocket(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        ws.accept.assert_called_once()

    async def test_connect_tracks_client(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        assert manager.client_count == 1

    async def test_connect_tracks_user(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        assert manager.user_count == 1

    async def test_multiple_tabs_same_user(self):
        manager = ConnectionManager()
        ws1, ws2 = make_ws(), make_ws()
        await manager.connect(ws1, "user1")
        await manager.connect(ws2, "user1")
        assert manager.client_count == 2
        assert manager.user_count == 1

    async def test_get_user_for_ws(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        assert manager.get_user_for_ws(ws) == "user1"


class TestDisconnect:
    async def test_disconnect_removes_client(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.disconnect(ws)
        assert manager.client_count == 0

    async def test_disconnect_starts_grace_period(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        await manager.disconnect(ws)
        assert "user1" in manager._grace_tickers
        assert "AAPL" in manager._grace_tickers["user1"]

    async def test_disconnect_second_tab_no_grace(self):
        manager = ConnectionManager()
        ws1, ws2 = make_ws(), make_ws()
        await manager.connect(ws1, "user1")
        await manager.connect(ws2, "user1")
        await manager.subscribe(ws1, ["AAPL"])
        await manager.disconnect(ws1)
        assert "user1" not in manager._grace_tickers

    async def test_disconnect_cleans_ticker_when_no_other_subs(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        await manager.disconnect(ws)
        # AAPL held in grace, not immediately removed from ticker_clients
        assert "user1" in manager._grace_tickers


class TestSubscribe:
    async def test_subscribe_adds_ticker(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        assert "AAPL" in manager.active_tickers

    async def test_subscribe_normalises_to_uppercase(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["aapl"])
        assert "AAPL" in manager.active_tickers

    async def test_subscribe_multiple_tickers(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL", "MSFT", "TSLA"])
        assert manager.active_tickers == {"AAPL", "MSFT", "TSLA"}

    async def test_subscribe_returns_newly_tracked(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        added = await manager.subscribe(ws, ["AAPL", "MSFT"])
        assert set(added) == {"AAPL", "MSFT"}

    async def test_subscribe_second_client_same_ticker_not_in_adds(self):
        manager = ConnectionManager()
        ws1, ws2 = make_ws(), make_ws()
        await manager.connect(ws1, "user1")
        await manager.connect(ws2, "user2")
        await manager.subscribe(ws1, ["AAPL"])
        added = await manager.subscribe(ws2, ["AAPL"])
        assert added == []  # already tracked

    async def test_subscribe_unknown_ws_returns_empty(self):
        manager = ConnectionManager()
        ws = make_ws()
        added = await manager.subscribe(ws, ["AAPL"])
        assert added == []


class TestUnsubscribe:
    async def test_unsubscribe_removes_ticker_when_no_subs(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        removed = await manager.unsubscribe(ws, ["AAPL"])
        assert "AAPL" not in manager.active_tickers
        assert "AAPL" in removed

    async def test_unsubscribe_keeps_ticker_when_other_client_subscribed(self):
        manager = ConnectionManager()
        ws1, ws2 = make_ws(), make_ws()
        await manager.connect(ws1, "user1")
        await manager.connect(ws2, "user2")
        await manager.subscribe(ws1, ["AAPL"])
        await manager.subscribe(ws2, ["AAPL"])
        removed = await manager.unsubscribe(ws1, ["AAPL"])
        assert "AAPL" in manager.active_tickers
        assert removed == []

    async def test_unsubscribe_unknown_ws_returns_empty(self):
        manager = ConnectionManager()
        ws = make_ws()
        removed = await manager.unsubscribe(ws, ["AAPL"])
        assert removed == []


class TestBroadcast:
    async def test_broadcast_sends_to_subscribed_clients(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])

        quote = {
            "price": 185.0,
            "change": 1.0,
            "change_percent": 0.54,
            "source": "mock",
        }
        await manager.broadcast("AAPL", quote)

        ws.send_text.assert_called_once()
        payload = json.loads(ws.send_text.call_args[0][0])
        assert payload["type"] == "quote"
        assert payload["ticker"] == "AAPL"
        assert payload["data"]["price"] == 185.0

    async def test_broadcast_only_reaches_subscribed_ticker(self):
        manager = ConnectionManager()
        ws1, ws2 = make_ws(), make_ws()
        await manager.connect(ws1, "user1")
        await manager.connect(ws2, "user2")
        await manager.subscribe(ws1, ["AAPL"])
        await manager.subscribe(ws2, ["MSFT"])

        await manager.broadcast("AAPL", {"price": 185.0})

        ws1.send_text.assert_called_once()
        ws2.send_text.assert_not_called()

    async def test_broadcast_no_subscribers_is_noop(self):
        manager = ConnectionManager()
        await manager.broadcast("AAPL", {"price": 185.0})  # no error

    async def test_broadcast_disconnects_dead_client(self):
        manager = ConnectionManager()
        ws = make_ws()
        ws.send_text.side_effect = Exception("connection closed")
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])

        await manager.broadcast("AAPL", {"price": 185.0})

        assert manager.client_count == 0

    async def test_broadcast_updates_last_active_timestamp(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])

        before = manager._ticker_last_active.get("AAPL", 0.0)
        await manager.broadcast("AAPL", {"price": 185.0})
        after = manager._ticker_last_active.get("AAPL", 0.0)

        assert after >= before


class TestGracePeriod:
    async def test_reconnect_within_grace_restores_tickers(self):
        manager = ConnectionManager()
        ws1 = make_ws()
        await manager.connect(ws1, "user1")
        await manager.subscribe(ws1, ["AAPL", "MSFT"])
        await manager.disconnect(ws1)

        ws2 = make_ws()
        await manager.connect(ws2, "user1")

        restored_msg = ws2.send_text.call_args[0][0]
        payload = json.loads(restored_msg)
        assert payload["type"] == "restored"
        assert set(payload["tickers"]) == {"AAPL", "MSFT"}

    async def test_reconnect_cancels_grace_task(self):
        manager = ConnectionManager()
        ws1 = make_ws()
        await manager.connect(ws1, "user1")
        await manager.subscribe(ws1, ["AAPL"])
        await manager.disconnect(ws1)

        assert "user1" in manager._grace_tasks

        ws2 = make_ws()
        await manager.connect(ws2, "user1")

        assert "user1" not in manager._grace_tasks

    async def test_grace_expire_removes_tickers(self, monkeypatch):
        monkeypatch.setattr(ws_manager, "GRACE_SECONDS", 0)
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        await manager.disconnect(ws)

        # cancel the real grace task, then call expire directly with the saved tickers
        task = manager._grace_tasks.pop("user1", None)
        if task:
            task.cancel()
        saved = manager._grace_tickers.get("user1", set()).copy()
        await manager._grace_expire.__func__(manager, "user1", saved)

        assert "AAPL" not in manager.active_tickers


class TestDrainPending:
    async def test_drain_pending_returns_adds(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL", "MSFT"])

        adds, removes = manager.drain_pending()

        assert set(adds) == {"AAPL", "MSFT"}
        assert removes == []

    async def test_drain_pending_returns_removes(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        manager.drain_pending()  # clear adds

        await manager.unsubscribe(ws, ["AAPL"])
        adds, removes = manager.drain_pending()

        assert adds == []
        assert "AAPL" in removes

    async def test_drain_clears_queue(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])

        manager.drain_pending()
        adds, removes = manager.drain_pending()

        assert adds == []
        assert removes == []


class TestLeastActiveWsTicker:
    async def test_returns_none_when_empty(self):
        manager = ConnectionManager()
        result = manager.least_active_ws_ticker(set())
        assert result is None

    async def test_returns_ticker_with_oldest_timestamp(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])

        manager._ticker_last_active["AAPL"] = 1000.0
        manager._ticker_last_active["MSFT"] = 2000.0
        manager._ticker_last_active["TSLA"] = 3000.0

        result = manager.least_active_ws_ticker({"AAPL", "MSFT", "TSLA"})
        assert result == "AAPL"

    async def test_only_considers_provided_set(self):
        manager = ConnectionManager()
        manager._ticker_last_active["AAPL"] = 1000.0
        manager._ticker_last_active["MSFT"] = 2000.0
        manager._ticker_last_active["TSLA"] = 3000.0

        result = manager.least_active_ws_ticker({"MSFT", "TSLA"})
        assert result == "MSFT"

    async def test_ticker_with_no_timestamp_is_oldest(self):
        manager = ConnectionManager()
        manager._ticker_last_active["MSFT"] = 5000.0

        result = manager.least_active_ws_ticker({"AAPL", "MSFT"})
        assert result == "AAPL"  # no timestamp defaults to 0.0


class TestSystemTickers:
    async def test_sync_adds_new_system_tickers(self):
        manager = ConnectionManager()
        added, removed = manager.sync_system_tickers({"AAPL", "MSFT"})
        assert set(added) == {"AAPL", "MSFT"}
        assert removed == []
        adds, rms = manager.drain_pending()
        assert set(adds) == {"AAPL", "MSFT"}
        assert rms == []

    async def test_sync_removes_dropped_system_tickers(self):
        manager = ConnectionManager()
        manager.sync_system_tickers({"AAPL", "MSFT"})
        manager.drain_pending()  # clear
        added, removed = manager.sync_system_tickers({"AAPL"})
        assert added == []
        assert removed == ["MSFT"]
        adds, rms = manager.drain_pending()
        assert adds == []
        assert rms == ["MSFT"]

    async def test_sync_skips_remove_when_client_still_subscribed(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        manager.drain_pending()  # clear client-driven adds
        manager.sync_system_tickers({"AAPL"})
        added, removed = manager.sync_system_tickers(set())
        assert removed == []  # AAPL still tracked by client
        assert "AAPL" not in manager._system_tickers

    async def test_client_disconnect_keeps_system_ticker_alive(self):
        manager = ConnectionManager()
        manager.sync_system_tickers({"AAPL"})
        manager.drain_pending()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        # client disconnect path that bypasses grace (simulated by directly
        # calling unsubscribe which is the non-grace branch)
        removed = await manager.unsubscribe(ws, ["AAPL"])
        assert removed == []  # system ticker kept alive
        _, rms = manager.drain_pending()
        assert rms == []

    async def test_sync_add_skipped_when_client_already_subscribed(self):
        manager = ConnectionManager()
        ws = make_ws()
        await manager.connect(ws, "user1")
        await manager.subscribe(ws, ["AAPL"])
        manager.drain_pending()
        added, removed = manager.sync_system_tickers({"AAPL"})
        # client already subscribed — no new pending_add needed
        assert added == []
        assert "AAPL" in manager._system_tickers
