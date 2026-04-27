from unittest.mock import AsyncMock, MagicMock

from app.ws.feeds.alpaca import AlpacaFeed


def make_feed() -> AlpacaFeed:
    """Build an AlpacaFeed with the upstream redis/manager dependencies mocked.

    Tests only exercise the per-message handlers (`_handle_trade`,
    `_handle_quote_tick`), so the WS connect / drain / poll loops never run.
    """
    manager = MagicMock()
    manager.broadcast = AsyncMock()
    config = MagicMock()
    feed = AlpacaFeed(manager, config)

    redis = MagicMock()
    redis.hset = AsyncMock()
    redis.hget = AsyncMock(return_value=None)
    redis.sadd = AsyncMock()
    feed._redis = AsyncMock(return_value=redis)
    return feed


class TestHandleQuoteTick:
    async def test_quote_tick_broadcasts_bid_and_ask(self):
        feed = make_feed()
        await feed._handle_quote_tick({"S": "BTC/USD", "bp": 100.5, "ap": 100.7})

        feed._manager.broadcast.assert_awaited_once()
        ticker, payload = feed._manager.broadcast.await_args.args
        assert ticker == "BTC/USD"
        assert payload["bid_price"] == 100.5
        assert payload["ask_price"] == 100.7
        assert payload["source"] == "alpaca_ws"
        assert isinstance(payload["timestamp"], int)

    async def test_quote_tick_with_only_bid_still_broadcasts(self):
        feed = make_feed()
        await feed._handle_quote_tick({"S": "AAPL", "bp": 150.0})

        feed._manager.broadcast.assert_awaited_once()
        _, payload = feed._manager.broadcast.await_args.args
        assert payload["bid_price"] == 150.0
        assert "ask_price" not in payload

    async def test_quote_tick_without_prices_is_noop(self):
        feed = make_feed()
        await feed._handle_quote_tick({"S": "AAPL"})
        feed._manager.broadcast.assert_not_awaited()

    async def test_quote_tick_without_ticker_is_noop(self):
        feed = make_feed()
        await feed._handle_quote_tick({"bp": 100.0, "ap": 100.5})
        feed._manager.broadcast.assert_not_awaited()


class TestHandleTrade:
    async def test_trade_broadcasts_price(self):
        """Sanity-check that _handle_trade still broadcasts — the same
        broadcast pipeline _handle_quote_tick now uses."""
        feed = make_feed()
        await feed._handle_trade({"S": "BTC/USD", "p": 77500.0})

        feed._manager.broadcast.assert_awaited_once()
        ticker, payload = feed._manager.broadcast.await_args.args
        assert ticker == "BTC/USD"
        assert payload["price"] == 77500.0
        assert payload["source"] == "alpaca_ws"
