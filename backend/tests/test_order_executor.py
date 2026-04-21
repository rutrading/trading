"""Unit tests for order executor fill/expire/window logic.

Tests the pure helper functions directly — no DB or asyncio required.
"""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

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
    asset_class: str = "us_equity",
    created_at: datetime | None = None,
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
    order.asset_class = asset_class
    # default: placed 2024-01-15 at 9:00 AM ET — before all same-day boundaries
    order.created_at = created_at or datetime(2024, 1, 15, 9, 0, tzinfo=ET)
    return order


def et_time(hour: int, minute: int, second: int = 0) -> datetime:
    # 2024-01-15 is a Monday — safe for market-hours checks
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


class TestShouldFillNoneGuards:
    def test_limit_order_with_no_limit_price_returns_false(self):
        # corrupt order — limit_price is None; must not raise TypeError
        order = make_exec_order("limit", "buy", limit_price=None)
        assert _should_fill(order, Decimal("100.00"), et_time(10, 0)) is False

    def test_stop_order_with_no_stop_price_returns_false(self):
        order = make_exec_order("stop", "buy", stop_price=None)
        assert _should_fill(order, Decimal("100.00"), et_time(10, 0)) is False

    def test_stop_limit_order_with_no_stop_price_returns_false(self):
        order = make_exec_order("stop_limit", "buy", limit_price="110.00", stop_price=None)
        assert _should_fill(order, Decimal("100.00"), et_time(10, 0)) is False

    def test_stop_limit_order_with_no_limit_price_returns_false(self):
        order = make_exec_order("stop_limit", "buy", limit_price=None, stop_price="100.00")
        assert _should_fill(order, Decimal("105.00"), et_time(10, 0)) is False


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

    def test_opg_limit_buy_does_not_fill_when_price_above_limit_during_window(self):
        # price condition must still be respected during the opg window
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        # 9:32 AM ET — inside window, but opening price is above limit
        assert _should_fill(order, Decimal("155.00"), et_time(9, 32)) is False

    def test_opg_limit_buy_fills_when_price_at_or_below_limit_during_window(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        assert _should_fill(order, Decimal("148.00"), et_time(9, 32)) is True

    def test_cls_limit_sell_does_not_fill_when_price_below_limit_during_window(self):
        # price condition must still be respected during the cls window
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        # 4:02 PM ET — inside window, but closing price is below limit
        assert _should_fill(order, Decimal("145.00"), et_time(16, 2)) is False

    def test_cls_limit_sell_fills_when_price_at_or_above_limit_during_window(self):
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        assert _should_fill(order, Decimal("152.00"), et_time(16, 2)) is True


# ---------------------------------------------------------------------------
# _should_expire
# ---------------------------------------------------------------------------


class TestShouldExpire:
    def test_day_order_expires_at_market_close(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="day")
        # 4:01 PM ET — past 16:00 close boundary
        assert _should_expire(order, et_time(16, 1)) is True

    def test_day_order_does_not_expire_before_market_close(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="day")
        # 3:59 PM ET — before market close
        assert _should_expire(order, et_time(15, 59)) is False

    def test_gtc_order_never_expires(self):
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="gtc")
        # 5:00 PM ET — well after close, but GTC doesn't expire
        assert _should_expire(order, et_time(17, 0)) is False

    def test_opg_order_expires_after_open_window(self):
        # opg must cancel at 9:36 (past end of 9:30–9:35 fill window), not wait for 4pm
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        assert _should_expire(order, et_time(9, 36)) is True

    def test_opg_order_does_not_expire_inside_open_window(self):
        # 9:32 is inside the opg fill window — must keep trying to fill
        order = make_exec_order("limit", "buy", limit_price="150.00", tif="opg")
        assert _should_expire(order, et_time(9, 32)) is False

    def test_opg_order_placed_after_window_waits_for_next_day(self):
        # placed at 10am today — today's 9:35 boundary was before placement,
        # so the order waits for tomorrow's fill window and must not expire same day
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="opg",
            created_at=datetime(2024, 1, 15, 10, 0, tzinfo=ET),
        )
        assert _should_expire(order, et_time(15, 0)) is False

    def test_cls_order_does_not_expire_inside_close_window(self):
        # 16:01 is inside the cls fill window (15:55–16:05) — must not expire yet
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        assert _should_expire(order, et_time(16, 1)) is False

    def test_cls_order_expires_after_close_window(self):
        # 16:06 is past end of cls fill window → cancel
        order = make_exec_order("limit", "sell", limit_price="150.00", tif="cls")
        assert _should_expire(order, et_time(16, 6)) is True


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


# ---------------------------------------------------------------------------
# Stock off-hours guard — prevents fills against stale after-hours quotes
# ---------------------------------------------------------------------------


class TestStockOffHoursGuard:
    def test_stock_gtc_limit_does_not_fill_after_hours(self):
        # limit buy at $150, quote at $140 — would fill during hours, but
        # 9pm quote is stale from 4pm close, so executor must skip
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="us_equity"
        )
        assert _should_fill(order, Decimal("140.00"), et_time(21, 0)) is False

    def test_stock_gtc_limit_fills_during_market_hours(self):
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="us_equity"
        )
        assert _should_fill(order, Decimal("140.00"), et_time(10, 0)) is True

    def test_stock_gtc_does_not_fill_on_weekend(self):
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="us_equity"
        )
        # 2024-01-13 is a Saturday
        saturday_10am = datetime(2024, 1, 13, 10, 0, tzinfo=ET)
        assert _should_fill(order, Decimal("140.00"), saturday_10am) is False

    def test_crypto_gtc_fills_off_hours(self):
        # crypto trades 24/7 — market-hours guard must not apply
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="crypto"
        )
        assert _should_fill(order, Decimal("140.00"), et_time(21, 0)) is True

    def test_stock_opg_still_fills_in_window(self):
        # opg/cls are exempt from the off-hours guard — they fill in their window
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="opg", asset_class="us_equity"
        )
        assert _should_fill(order, Decimal("148.00"), et_time(9, 32)) is True

    def test_stock_gtc_does_not_fill_on_nyse_holiday(self):
        # 2025-12-25 is Christmas — markets closed even though it's a Thursday
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="us_equity"
        )
        christmas_10am = datetime(2025, 12, 25, 10, 0, tzinfo=ET)
        assert _should_fill(order, Decimal("140.00"), christmas_10am) is False

    def test_crypto_still_fills_on_nyse_holiday(self):
        # crypto is 24/7 including NYSE holidays
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="gtc", asset_class="crypto"
        )
        christmas_10am = datetime(2025, 12, 25, 10, 0, tzinfo=ET)
        assert _should_fill(order, Decimal("140.00"), christmas_10am) is True

    @pytest.mark.xfail(
        reason="BUG: opg/cls TIFs are exempt from the holiday/weekend guard at "
        "order_executor.py:226. An opg buy that survives to Christmas morning "
        "would fill at 9:32 ET against whatever stale Wed-close quote is in "
        "Redis. The guard needs to also check is_stock_market_open before the "
        "opg/cls window check. Owned by trading-logic fixer.",
        strict=True,
    )
    def test_stock_opg_does_not_fill_on_nyse_holiday(self):
        # opg buy on Christmas — market is closed, even though 9:32 falls
        # inside the 5-min "open window"
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="opg", asset_class="us_equity"
        )
        christmas_open = datetime(2025, 12, 25, 9, 32, tzinfo=ET)
        assert _should_fill(order, Decimal("148.00"), christmas_open) is False

    @pytest.mark.xfail(
        reason="BUG: same as test_stock_opg_does_not_fill_on_nyse_holiday but "
        "for cls (market-on-close). Owned by trading-logic fixer.",
        strict=True,
    )
    def test_stock_cls_does_not_fill_on_nyse_holiday(self):
        order = make_exec_order(
            "limit", "sell", limit_price="150.00", tif="cls", asset_class="us_equity"
        )
        christmas_close = datetime(2025, 12, 25, 16, 2, tzinfo=ET)
        assert _should_fill(order, Decimal("152.00"), christmas_close) is False

    @pytest.mark.xfail(
        reason="BUG: opg/cls also bypass the weekend guard. An opg order placed "
        "Friday afternoon and not cancelled before Saturday could be considered "
        "fillable Saturday at 9:32 ET. Owned by trading-logic fixer.",
        strict=True,
    )
    def test_stock_opg_does_not_fill_on_weekend(self):
        order = make_exec_order(
            "limit", "buy", limit_price="150.00", tif="opg", asset_class="us_equity"
        )
        # 2024-01-13 is a Saturday
        saturday_open = datetime(2024, 1, 13, 9, 32, tzinfo=ET)
        assert _should_fill(order, Decimal("148.00"), saturday_open) is False
