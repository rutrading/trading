"""Unit tests for app/services/trading.py.

All tests use plain Python objects — no database, no HTTP, no external APIs.
The DB session is replaced with a MagicMock so SQLAlchemy queries can be
controlled via return_value / side_effect.
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import Holding, Order, TradingAccount, Transaction
from app.services.trading import (
    OrderValidationError,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_account(balance: str = "100000", account_id: int = 1) -> TradingAccount:
    account = TradingAccount()
    account.id = account_id
    account.balance = Decimal(balance)
    account.name = "Test Account"
    account.type = "investment"
    account.is_joint = False
    return account


def make_order(
    symbol: str = "AAPL",
    side: str = "buy",
    order_type: str = "market",
    asset_type: str = "stock",
    quantity: str = "10",
    account_id: int = 1,
) -> Order:
    order = Order()
    order.id = 1
    order.trading_account_id = account_id
    order.symbol = symbol
    order.side = side
    order.order_type = order_type
    order.asset_type = asset_type
    order.time_in_force = "day"
    order.quantity = Decimal(quantity)
    order.filled_quantity = Decimal("0")
    order.average_fill_price = None
    order.status = "pending"
    order.rejection_reason = None
    return order


def make_holding(
    symbol: str = "AAPL",
    quantity: str = "10",
    average_cost: str = "150.00",
    account_id: int = 1,
    asset_type: str = "stock",
) -> Holding:
    holding = Holding()
    holding.id = 1
    holding.trading_account_id = account_id
    holding.symbol = symbol
    holding.asset_type = asset_type
    holding.quantity = Decimal(quantity)
    holding.average_cost = Decimal(average_cost)
    return holding


def make_db(holding: Holding | None = None) -> MagicMock:
    """Return a mock DB session whose query chain returns the given holding."""
    db = MagicMock()
    query_chain = db.query.return_value.filter.return_value
    query_chain.first.return_value = holding
    return db


# ---------------------------------------------------------------------------
# validate_order_request — field validation
# ---------------------------------------------------------------------------


class TestValidateOrderRequestFields:
    def test_invalid_asset_type(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid asset_type"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="futures",
                side="buy",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("1"),
                limit_price=None,
                stop_price=None,
            )

    def test_invalid_side(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid side"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="short",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("1"),
                limit_price=None,
                stop_price=None,
            )

    def test_invalid_order_type(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid order_type"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="trailing_stop",
                time_in_force="day",
                quantity=Decimal("1"),
                limit_price=None,
                stop_price=None,
            )

    def test_invalid_time_in_force(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid time_in_force"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="market",
                time_in_force="fok",
                quantity=Decimal("1"),
                limit_price=None,
                stop_price=None,
            )

    def test_zero_quantity_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="Quantity must be greater than 0"
        ):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("0"),
                limit_price=None,
                stop_price=None,
            )

    def test_negative_quantity_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="Quantity must be greater than 0"
        ):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("-5"),
                limit_price=None,
                stop_price=None,
            )

    def test_valid_market_order_passes(self):
        db = make_db()
        account = make_account()
        # should not raise
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="buy",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("10"),
            limit_price=None,
            stop_price=None,
        )


# ---------------------------------------------------------------------------
# validate_order_request — crypto TIF rule
# ---------------------------------------------------------------------------


class TestValidateOrderRequestCryptoTif:
    def test_crypto_day_order_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="gtc"):
            validate_order_request(
                account=account,
                db=db,
                symbol="BTC/USD",
                asset_type="crypto",
                side="buy",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("0.5"),
                limit_price=None,
                stop_price=None,
            )

    def test_crypto_gtc_order_passes(self):
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="BTC/USD",
            asset_type="crypto",
            side="buy",
            order_type="market",
            time_in_force="gtc",
            quantity=Decimal("0.5"),
            limit_price=None,
            stop_price=None,
        )

    def test_stock_day_order_passes(self):
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="buy",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("10"),
            limit_price=None,
            stop_price=None,
        )


# ---------------------------------------------------------------------------
# validate_order_request — limit / stop price rules
# ---------------------------------------------------------------------------


class TestValidateOrderRequestPriceRules:
    def test_limit_order_requires_limit_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is required"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="limit",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=None,
                stop_price=None,
            )

    def test_stop_limit_order_requires_both_prices(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is required"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="stop_limit",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=None,
                stop_price=Decimal("148.00"),
            )

    def test_stop_order_requires_stop_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is required"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="stop",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=None,
                stop_price=None,
            )

    def test_zero_limit_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="limit_price must be greater than 0"
        ):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="limit",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=Decimal("0"),
                stop_price=None,
            )

    def test_zero_stop_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="stop_price must be greater than 0"
        ):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="stop",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=None,
                stop_price=Decimal("0"),
            )

    def test_valid_limit_order_passes(self):
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="buy",
            order_type="limit",
            time_in_force="gtc",
            quantity=Decimal("10"),
            limit_price=Decimal("150.00"),
            stop_price=None,
        )

    def test_valid_stop_limit_order_passes(self):
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="buy",
            order_type="stop_limit",
            time_in_force="gtc",
            quantity=Decimal("10"),
            limit_price=Decimal("148.00"),
            stop_price=Decimal("150.00"),
        )


# ---------------------------------------------------------------------------
# validate_order_request — sell position check
# ---------------------------------------------------------------------------


class TestValidateOrderRequestSellPosition:
    def test_sell_without_holding_rejected(self):
        db = make_db(holding=None)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="sell",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("5"),
                limit_price=None,
                stop_price=None,
            )

    def test_sell_more_than_owned_rejected(self):
        holding = make_holding(quantity="3")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="sell",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("5"),
                limit_price=None,
                stop_price=None,
            )

    def test_sell_exact_quantity_owned_passes(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="sell",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("10"),
            limit_price=None,
            stop_price=None,
        )

    def test_sell_partial_quantity_passes(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="sell",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("5"),
            limit_price=None,
            stop_price=None,
        )


# ---------------------------------------------------------------------------
# validate_buying_power
# ---------------------------------------------------------------------------


class TestValidateBuyingPower:
    def test_insufficient_balance_rejected(self):
        account = make_account(balance="500.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_exact_balance_passes(self):
        account = make_account(balance="1000.00")
        # 10 shares × $100 = $1000 exactly — should pass
        validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_sufficient_balance_passes(self):
        account = make_account(balance="100000.00")
        validate_buying_power(account, "buy", Decimal("10"), Decimal("185.50"))

    def test_sell_side_skips_balance_check(self):
        # sell with zero balance should pass — balance check only applies to buys
        account = make_account(balance="0.00")
        validate_buying_power(account, "sell", Decimal("10"), Decimal("185.50"))

    def test_fractional_crypto_buy(self):
        account = make_account(balance="1000.00")
        # 0.001 BTC × $50000 = $50 — should pass
        validate_buying_power(account, "buy", Decimal("0.001"), Decimal("50000.00"))

    def test_fractional_crypto_buy_insufficient(self):
        account = make_account(balance="10.00")
        # 0.1 BTC × $50000 = $5000 — should fail
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.1"), Decimal("50000.00"))


# ---------------------------------------------------------------------------
# execute_fill — first buy (no existing holding)
# ---------------------------------------------------------------------------


class TestExecuteFillFirstBuy:
    def test_creates_holding_on_first_buy(self):
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("10"),
        )

        db.add.assert_called()
        added = db.add.call_args_list[0][0][0]
        assert isinstance(added, Holding)
        assert added.quantity == Decimal("10")
        assert added.average_cost == Decimal("150.00")
        assert added.symbol == "AAPL"

    def test_balance_deducted_on_first_buy(self):
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("10"),
        )

        # 10 × $150 = $1,500 deducted
        assert account.balance == Decimal("98500.00")

    def test_order_status_filled_on_full_fill(self):
        account = make_account()
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("10"),
        )

        assert order.status == "filled"
        assert order.filled_quantity == Decimal("10")
        assert order.average_fill_price == Decimal("150.00")

    def test_transaction_created_on_fill(self):
        account = make_account()
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        txn = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("10"),
        )

        assert isinstance(txn, Transaction)
        assert txn.quantity == Decimal("10")
        assert txn.price == Decimal("150.00")
        assert txn.total == Decimal("1500.00")
        assert txn.side == "buy"


# ---------------------------------------------------------------------------
# execute_fill — second buy (existing holding, weighted average cost)
# ---------------------------------------------------------------------------


class TestExecuteFillSubsequentBuy:
    def test_weighted_average_cost_calculated(self):
        # own 10 shares at $150, buy 5 more at $180
        # new avg = (10×150 + 5×180) / 15 = 2400/15 = $160
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="5")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("180.00"),
            fill_quantity=Decimal("5"),
        )

        assert holding.quantity == Decimal("15")
        assert holding.average_cost == Decimal("160.00")

    def test_balance_deducted_on_subsequent_buy(self):
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="5")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("180.00"),
            fill_quantity=Decimal("5"),
        )

        # 5 × $180 = $900
        assert account.balance == Decimal("99100.00")

    def test_equal_price_buy_keeps_same_average(self):
        # own 10 at $150, buy 10 more at $150 — average stays $150
        account = make_account()
        order = make_order(side="buy", quantity="10")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("10"),
        )

        assert holding.average_cost == Decimal("150.00")
        assert holding.quantity == Decimal("20")

    def test_fractional_crypto_weighted_average(self):
        # own 0.5 BTC at $40000, buy 0.25 BTC at $44000
        # new avg = (0.5×40000 + 0.25×44000) / 0.75 = 31000/0.75 = $41333.33...
        account = make_account(balance="100000.00")
        order = make_order(
            symbol="BTC/USD", side="buy", quantity="0.25", asset_type="crypto"
        )
        holding = make_holding(
            symbol="BTC/USD",
            quantity="0.5",
            average_cost="40000.00",
            asset_type="crypto",
        )
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("44000.00"),
            fill_quantity=Decimal("0.25"),
        )

        expected_avg = (
            Decimal("0.5") * Decimal("40000") + Decimal("0.25") * Decimal("44000")
        ) / Decimal("0.75")
        assert holding.average_cost == expected_avg
        assert holding.quantity == Decimal("0.75")


# ---------------------------------------------------------------------------
# execute_fill — sell
# ---------------------------------------------------------------------------


class TestExecuteFillSell:
    def test_sell_reduces_holding_quantity(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="3")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        assert holding.quantity == Decimal("7")

    def test_sell_does_not_change_average_cost(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="3")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        assert holding.average_cost == Decimal("150.00")

    def test_sell_credits_balance(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="3")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        # 3 × $170 = $510 added
        assert account.balance == Decimal("10510.00")

    def test_full_sell_deletes_holding(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="10")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("10"),
        )

        db.delete.assert_called_once_with(holding)

    def test_partial_sell_does_not_delete_holding(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="5")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("5"),
        )

        db.delete.assert_not_called()
        assert holding.quantity == Decimal("5")

    def test_sell_transaction_recorded(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="3")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        txn = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        assert txn.side == "sell"
        assert txn.quantity == Decimal("3")
        assert txn.price == Decimal("170.00")
        assert txn.total == Decimal("510.00")


# ---------------------------------------------------------------------------
# execute_fill — partial fill
# ---------------------------------------------------------------------------


class TestExecuteFillPartial:
    def test_partial_fill_sets_partially_filled_status(self):
        account = make_account()
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("6"),
        )

        assert order.status == "partially_filled"
        assert order.filled_quantity == Decimal("6")

    def test_second_partial_fill_reaches_filled(self):
        account = make_account()
        order = make_order(side="buy", quantity="10")
        order.filled_quantity = Decimal("6")
        order.average_fill_price = Decimal("150.00")
        order.status = "partially_filled"
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("155.00"),
            fill_quantity=Decimal("4"),
        )

        assert order.status == "filled"
        assert order.filled_quantity == Decimal("10")

    def test_partial_fill_weighted_average_fill_price(self):
        # first fill: 6 shares at $150
        # second fill: 4 shares at $160
        # expected avg fill price: (6×150 + 4×160) / 10 = $154
        account = make_account()
        order = make_order(side="buy", quantity="10")
        order.filled_quantity = Decimal("6")
        order.average_fill_price = Decimal("150.00")
        order.status = "partially_filled"
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("160.00"),
            fill_quantity=Decimal("4"),
        )

        assert order.average_fill_price == Decimal("154.00")
