"""Unit tests for order executor fill/expire/window logic.

Tests the pure helper functions directly — no DB or asyncio required.
"""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.db.models import Order
from app.tasks.order_executor import (
    VOLUME_FILL_RATE,
    _compute_fill_quantity,
    _in_window,
    _should_expire,
    _should_fill,
)

ET = ZoneInfo("America/New_York")


def make_exec_order(
    order_type: str,
    side: str,
    limit_price: str | None = None,
    stop_price: str | None = None,
    tif: str = "gtc",
    reserved_per_share: str | None = None,
    quantity: str = "10",
    filled_quantity: str = "0",
) -> Order:
    order = Order()
    order.order_type = order_type
    order.side = side
    order.limit_price = Decimal(limit_price) if limit_price else None
    order.stop_price = Decimal(stop_price) if stop_price else None
    order.time_in_force = tif
    order.reserved_per_share = Decimal(reserved_per_share) if reserved_per_share else None
    order.quantity = Decimal(quantity)
    order.filled_quantity = Decimal(filled_quantity)
    return order


def et_time(hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(2024, 1, 15, hour, minute, second, tzinfo=ET)


# ---------------------------------------------------------------------------
# _compute_fill_quantity
# ---------------------------------------------------------------------------


class TestComputeFillQuantity:
    def test_fills_all_remaining_when_no_volume_data(self):
        # no daily bar for this ticker — fall back to full fill
        assert _compute_fill_quantity(Decimal("100"), None) == Decimal("100")

    def test_fills_all_remaining_when_volume_is_zero(self):
        assert _compute_fill_quantity(Decimal("100"), Decimal("0")) == Decimal("100")

    def test_caps_fill_at_volume_rate_when_remaining_exceeds_fillable(self):
        # 2,000,000 shares/day × 0.05% = 1,000 fillable; remaining=5,000 → fill 1,000
        daily_volume = Decimal("2000000")
        fillable = (daily_volume * VOLUME_FILL_RATE).quantize(Decimal("0.000001"))
        result = _compute_fill_quantity(Decimal("5000"), daily_volume)
        assert result == fillable

    def test_fills_all_remaining_when_remaining_is_less_than_fillable(self):
        # 2,000,000 shares/day → 1,000 fillable; remaining=10 → fill 10
        result = _compute_fill_quantity(Decimal("10"), Decimal("2000000"))
        assert result == Decimal("10")

    def test_floors_at_one_unit_for_very_low_volume_tickers(self):
        # 1,000 shares/day × 0.05% = 0.5 → floored to 1
        result = _compute_fill_quantity(Decimal("50"), Decimal("1000"))
        assert result == Decimal("1")

    def test_fills_remaining_when_remaining_less_than_floor(self):
        # remaining=0.3 (fractional crypto position), fillable=0.5 → min(0.3, max(1, 0.5))
        # max(1, 0.5)=1, min(0.3, 1)=0.3 → fills remaining
        result = _compute_fill_quantity(Decimal("0.3"), Decimal("1000"))
        assert result == Decimal("0.3")

    def test_remaining_exactly_equals_fillable(self):
        # remaining == fillable → should fill everything in one cycle
        daily_volume = Decimal("2000000")
        fillable = (daily_volume * VOLUME_FILL_RATE).quantize(Decimal("0.000001"))
        result = _compute_fill_quantity(fillable, daily_volume)
        assert result == fillable


# ---------------------------------------------------------------------------
# _should_fill — limit orders
# ---------------------------------------------------------------------------


class TestShouldFillMarket:
    def test_market_order_returns_false(self):
        # market orders are filled at placement time — executor must never attempt to fill them
        order = make_exec_order("market", "buy")
        assert _should_fill(order, Decimal("100.00"), et_time(10, 0)) is False


class TestShouldFillLimit:
    def test_limit_buy_fills_when_price_at_or_below_limit(self):
        order = make_exec_order("limit", "buy", limit_price="150.00")
        assert _should_fill(order, Decimal("140.00"), et_time(10, 0)) is True

    def test_limit_buy_fills_at_exact_limit_price(self):
        order = make_exec_order("limit", "buy", limit_price="150.00")
        assert _should_fill(order, Decimal("150.00"), et_time(10, 0)) is True

    def test_limit_buy_does_not_fill_above_limit(self):
        order = make_exec_order("limit", "buy", limit_price="150.00")
        assert _should_fill(order, Decimal("160.00"), et_time(10, 0)) is False

    def test_limit_sell_fills_when_price_at_or_above_limit(self):
        order = make_exec_order("limit", "sell", limit_price="150.00")
        assert _should_fill(order, Decimal("160.00"), et_time(10, 0)) is True

    def test_limit_sell_fills_at_exact_limit_price(self):
        order = make_exec_order("limit", "sell", limit_price="150.00")
        assert _should_fill(order, Decimal("150.00"), et_time(10, 0)) is True

    def test_limit_sell_does_not_fill_below_limit(self):
        order = make_exec_order("limit", "sell", limit_price="150.00")
        assert _should_fill(order, Decimal("140.00"), et_time(10, 0)) is False


# ---------------------------------------------------------------------------
# _should_fill — stop orders
# ---------------------------------------------------------------------------


class TestShouldFillStop:
    def test_stop_buy_fills_when_price_at_or_above_stop(self):
        order = make_exec_order("stop", "buy", stop_price="150.00")
        assert _should_fill(order, Decimal("160.00"), et_time(10, 0)) is True

    def test_stop_buy_fills_at_exact_stop_price(self):
        order = make_exec_order("stop", "buy", stop_price="150.00")
        assert _should_fill(order, Decimal("150.00"), et_time(10, 0)) is True

    def test_stop_buy_does_not_fill_below_stop(self):
        order = make_exec_order("stop", "buy", stop_price="150.00")
        assert _should_fill(order, Decimal("140.00"), et_time(10, 0)) is False

    def test_stop_sell_fills_when_price_at_or_below_stop(self):
        order = make_exec_order("stop", "sell", stop_price="150.00")
        assert _should_fill(order, Decimal("140.00"), et_time(10, 0)) is True

    def test_stop_sell_fills_at_exact_stop_price(self):
        order = make_exec_order("stop", "sell", stop_price="150.00")
        assert _should_fill(order, Decimal("150.00"), et_time(10, 0)) is True

    def test_stop_sell_does_not_fill_above_stop(self):
        order = make_exec_order("stop", "sell", stop_price="150.00")
        assert _should_fill(order, Decimal("160.00"), et_time(10, 0)) is False


# ---------------------------------------------------------------------------
# _should_fill — stop_limit orders
# ---------------------------------------------------------------------------


class TestShouldFillStopLimit:
    def test_stop_limit_buy_fills_when_both_conditions_met(self):
        # stop=$150 triggered (price=$155 >= stop), limit=$160 ok (price <= limit)
        order = make_exec_order("stop_limit", "buy", limit_price="160.00", stop_price="150.00")
        assert _should_fill(order, Decimal("155.00"), et_time(10, 0)) is True

    def test_stop_limit_buy_does_not_fill_when_stop_triggered_but_price_above_limit(self):
        # stop=$150 triggered (price=$165 >= stop), but price=$165 > limit=$160
        order = make_exec_order("stop_limit", "buy", limit_price="160.00", stop_price="150.00")
        assert _should_fill(order, Decimal("165.00"), et_time(10, 0)) is False

    def test_stop_limit_buy_does_not_fill_when_stop_not_triggered(self):
        # price=$145 < stop=$150 — stop hasn't triggered yet
        order = make_exec_order("stop_limit", "buy", limit_price="160.00", stop_price="150.00")
        assert _should_fill(order, Decimal("145.00"), et_time(10, 0)) is False

    def test_stop_limit_sell_fills_when_both_conditions_met(self):
        # stop=$150 triggered (price=$145 <= stop), limit=$140 ok (price >= limit)
        order = make_exec_order("stop_limit", "sell", limit_price="140.00", stop_price="150.00")
        assert _should_fill(order, Decimal("145.00"), et_time(10, 0)) is True

    def test_stop_limit_sell_does_not_fill_when_stop_triggered_but_price_below_limit(self):
        # stop=$150 triggered (price=$135 <= stop), but price=$135 < limit=$140
        order = make_exec_order("stop_limit", "sell", limit_price="140.00", stop_price="150.00")
        assert _should_fill(order, Decimal("135.00"), et_time(10, 0)) is False

    def test_stop_limit_sell_does_not_fill_when_stop_not_triggered(self):
        # price=$155 > stop=$150 — stop hasn't triggered yet for a sell
        order = make_exec_order("stop_limit", "sell", limit_price="140.00", stop_price="150.00")
        assert _should_fill(order, Decimal("155.00"), et_time(10, 0)) is False


# ---------------------------------------------------------------------------
# _should_fill — opg / cls TIF
# ---------------------------------------------------------------------------


class TestShouldFillOpgCls:
    def test_opg_fills_within_window_of_market_open(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        # 9:32 AM ET — 2 minutes after open, within the 5-min window
        assert _should_fill(order, Decimal("150.00"), et_time(9, 32)) is True

    def test_opg_does_not_fill_outside_window(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        # 11:00 AM ET — well outside the 5-min window around 9:30
        assert _should_fill(order, Decimal("150.00"), et_time(11, 0)) is False

    def test_cls_fills_within_window_of_market_close(self):
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        # 4:02 PM ET — 2 minutes after close, within the 5-min window
        assert _should_fill(order, Decimal("150.00"), et_time(16, 2)) is True

    def test_cls_does_not_fill_outside_window(self):
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        # 2:00 PM ET — well outside the 5-min window around 4:00 PM
        assert _should_fill(order, Decimal("150.00"), et_time(14, 0)) is False


# ---------------------------------------------------------------------------
# _should_expire
# ---------------------------------------------------------------------------


class TestShouldExpire:
    def test_day_order_expires_at_market_close(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="day")
        # 4:01 PM ET — past market close
        assert _should_expire(order, et_time(16, 1)) is True

    def test_day_order_does_not_expire_before_market_close(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="day")
        # 3:59 PM ET — before market close
        assert _should_expire(order, et_time(15, 59)) is False

    def test_gtc_order_never_expires(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="gtc")
        # 5:00 PM ET — well after close, but GTC doesn't expire
        assert _should_expire(order, et_time(17, 0)) is False


# ---------------------------------------------------------------------------
# _in_window
# ---------------------------------------------------------------------------


class TestInWindow:
    def test_time_within_window_returns_true(self):
        # 9:32 AM — 2 minutes after target 9:30, within 5-min window
        assert _in_window(et_time(9, 32), (9, 30)) is True

    def test_time_outside_window_returns_false(self):
        # 9:40 AM — 10 minutes after target 9:30, outside 5-min window
        assert _in_window(et_time(9, 40), (9, 30)) is False
