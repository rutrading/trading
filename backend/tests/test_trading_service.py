from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.db.models import Holding, Order, TradingAccount, Transaction
from app.services.trading import (
    OrderValidationError,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)


def make_account(balance: str = "100000", account_id: int = 1) -> TradingAccount:
    account = TradingAccount()
    account.id = account_id
    account.balance = Decimal(balance)
    account.name = "Test Account"
    account.type = "investment"
    account.is_joint = False
    return account


def make_order(
    ticker: str = "AAPL",
    side: str = "buy",
    order_type: str = "market",
    asset_class: str = "us_equity",
    quantity: str = "10",
    account_id: int = 1,
) -> Order:
    order = Order()
    order.id = 1
    order.trading_account_id = account_id
    order.ticker = ticker
    order.side = side
    order.order_type = order_type
    order.asset_class = asset_class
    order.time_in_force = "day"
    order.quantity = Decimal(quantity)
    order.filled_quantity = Decimal("0")
    order.average_fill_price = None
    order.status = "pending"
    order.rejection_reason = None
    return order


def make_holding(
    ticker: str = "AAPL",
    quantity: str = "10",
    average_cost: str = "150.00",
    account_id: int = 1,
    asset_class: str = "us_equity",
) -> Holding:
    holding = Holding()
    holding.id = 1
    holding.trading_account_id = account_id
    holding.ticker = ticker
    holding.asset_class = asset_class
    holding.quantity = Decimal(quantity)
    holding.average_cost = Decimal(average_cost)
    return holding


def make_db(holding: Holding | None = None) -> MagicMock:
    db = MagicMock()
    query_chain = db.query.return_value.filter.return_value
    query_chain.first.return_value = holding
    return db


def _validate(
    account,
    db,
    ticker="AAPL",
    asset_class="us_equity",
    side="buy",
    order_type="market",
    time_in_force="day",
    quantity=Decimal("1"),
    limit_price=None,
    stop_price=None,
):
    return validate_order_request(
        account=account,
        db=db,
        ticker=ticker,
        asset_class=asset_class,
        side=side,
        order_type=order_type,
        time_in_force=time_in_force,
        quantity=quantity,
        limit_price=limit_price,
        stop_price=stop_price,
    )


class TestValidateOrderRequestFields:
    def test_invalid_asset_class(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid asset_class"):
            _validate(account, db, asset_class="futures")

    def test_invalid_side(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid side"):
            _validate(account, db, side="short")

    def test_invalid_order_type(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid order_type"):
            _validate(account, db, order_type="trailing_stop")

    def test_invalid_time_in_force(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="Invalid time_in_force"):
            _validate(account, db, time_in_force="fok")

    def test_zero_quantity_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="Quantity must be greater than 0"
        ):
            _validate(account, db, quantity=Decimal("0"))

    def test_negative_quantity_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="Quantity must be greater than 0"
        ):
            _validate(account, db, quantity=Decimal("-5"))

    def test_valid_market_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(account, db, quantity=Decimal("10"))

    def test_us_equity_day_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account, db, ticker="SPY", asset_class="us_equity", quantity=Decimal("5")
        )

    def test_us_equity_gtc_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            ticker="QQQ",
            asset_class="us_equity",
            time_in_force="gtc",
            quantity=Decimal("2"),
        )


class TestValidateOrderRequestCryptoTif:
    def test_crypto_day_order_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="gtc"):
            _validate(
                account,
                db,
                ticker="BTC/USD",
                asset_class="crypto",
                time_in_force="day",
                quantity=Decimal("0.5"),
            )

    def test_crypto_gtc_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            ticker="BTC/USD",
            asset_class="crypto",
            time_in_force="gtc",
            quantity=Decimal("0.5"),
        )

    def test_stock_day_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            ticker="AAPL",
            asset_class="us_equity",
            time_in_force="day",
            quantity=Decimal("10"),
        )

    def test_crypto_sell_day_order_rejected(self):
        db = make_db(
            holding=make_holding(ticker="ETH/USD", quantity="2", asset_class="crypto")
        )
        account = make_account()
        with pytest.raises(OrderValidationError, match="gtc"):
            _validate(
                account,
                db,
                ticker="ETH/USD",
                asset_class="crypto",
                side="sell",
                time_in_force="day",
                quantity=Decimal("1"),
            )


class TestValidateOrderRequestPriceRules:
    def test_limit_order_requires_limit_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is required"):
            _validate(account, db, order_type="limit", quantity=Decimal("10"))

    def test_stop_limit_requires_limit_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is required"):
            _validate(
                account,
                db,
                order_type="stop_limit",
                quantity=Decimal("10"),
                stop_price=Decimal("148.00"),
            )

    def test_stop_limit_requires_stop_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is required"):
            _validate(
                account,
                db,
                order_type="stop_limit",
                quantity=Decimal("10"),
                limit_price=Decimal("148.00"),
            )

    def test_stop_order_requires_stop_price(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is required"):
            _validate(account, db, order_type="stop", quantity=Decimal("10"))

    def test_zero_limit_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="limit_price must be greater than 0"
        ):
            _validate(
                account,
                db,
                order_type="limit",
                quantity=Decimal("10"),
                limit_price=Decimal("0"),
            )

    def test_negative_limit_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="limit_price must be greater than 0"
        ):
            _validate(
                account,
                db,
                order_type="limit",
                quantity=Decimal("10"),
                limit_price=Decimal("-10.00"),
            )

    def test_zero_stop_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="stop_price must be greater than 0"
        ):
            _validate(
                account,
                db,
                order_type="stop",
                quantity=Decimal("10"),
                stop_price=Decimal("0"),
            )

    def test_negative_stop_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(
            OrderValidationError, match="stop_price must be greater than 0"
        ):
            _validate(
                account,
                db,
                order_type="stop",
                quantity=Decimal("10"),
                stop_price=Decimal("-5.00"),
            )

    def test_valid_limit_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            order_type="limit",
            time_in_force="gtc",
            quantity=Decimal("10"),
            limit_price=Decimal("150.00"),
        )

    def test_valid_stop_limit_order_passes(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            time_in_force="gtc",
            quantity=Decimal("10"),
            limit_price=Decimal("148.00"),
            stop_price=Decimal("150.00"),
        )

    def test_valid_stop_order_passes(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(
            account,
            db,
            side="sell",
            order_type="stop",
            time_in_force="gtc",
            quantity=Decimal("5"),
            stop_price=Decimal("140.00"),
        )


class TestValidateOrderRequestSellPosition:
    def test_sell_without_holding_rejected(self):
        db = make_db(holding=None)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            _validate(account, db, side="sell", quantity=Decimal("5"))

    def test_sell_more_than_owned_rejected(self):
        holding = make_holding(quantity="3")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            _validate(account, db, side="sell", quantity=Decimal("5"))

    def test_sell_exact_quantity_owned_passes(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", quantity=Decimal("10"))

    def test_sell_partial_quantity_passes(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", quantity=Decimal("5"))

    def test_sell_fractional_crypto_passes(self):
        holding = make_holding(
            ticker="BTC/USD",
            quantity="0.5",
            average_cost="40000.00",
            asset_class="crypto",
        )
        db = make_db(holding=holding)
        account = make_account()
        _validate(
            account,
            db,
            ticker="BTC/USD",
            asset_class="crypto",
            side="sell",
            time_in_force="gtc",
            quantity=Decimal("0.25"),
        )

    def test_sell_fractional_crypto_oversell_rejected(self):
        holding = make_holding(
            ticker="BTC/USD",
            quantity="0.1",
            average_cost="40000.00",
            asset_class="crypto",
        )
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            _validate(
                account,
                db,
                ticker="BTC/USD",
                asset_class="crypto",
                side="sell",
                time_in_force="gtc",
                quantity=Decimal("0.5"),
            )


class TestValidateBuyingPower:
    def test_insufficient_balance_rejected(self):
        account = make_account(balance="500.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_exact_balance_passes(self):
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_sufficient_balance_passes(self):
        account = make_account(balance="100000.00")
        validate_buying_power(account, "buy", Decimal("10"), Decimal("185.50"))

    def test_sell_side_skips_balance_check(self):
        account = make_account(balance="0.00")
        validate_buying_power(account, "sell", Decimal("10"), Decimal("185.50"))

    def test_fractional_crypto_buy_passes(self):
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("0.001"), Decimal("50000.00"))

    def test_fractional_crypto_buy_insufficient(self):
        account = make_account(balance="10.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.1"), Decimal("50000.00"))

    def test_fractional_stock_buy_passes(self):
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("0.5"), Decimal("200.00"))

    def test_fractional_stock_buy_insufficient(self):
        account = make_account(balance="50.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.5"), Decimal("200.00"))

    def test_balance_one_cent_short_rejected(self):
        account = make_account(balance="999.99")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))


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
        assert added.ticker == "AAPL"

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

    def test_transaction_linked_to_order_and_account(self):
        account = make_account(account_id=7)
        order = make_order(side="buy", quantity="5", account_id=7)
        db = make_db(holding=None)

        txn = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("100.00"),
            fill_quantity=Decimal("5"),
        )

        assert txn.order_id == order.id
        assert txn.trading_account_id == account.id

    def test_first_buy_tiny_fractional_quantity(self):
        account = make_account(balance="100000.00")
        order = make_order(
            ticker="BTC/USD", side="buy", quantity="0.00000001", asset_class="crypto"
        )
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("50000.00"),
            fill_quantity=Decimal("0.00000001"),
        )

        added = db.add.call_args_list[0][0][0]
        assert added.quantity == Decimal("0.00000001")
        assert added.average_cost == Decimal("50000.00")


class TestExecuteFillSubsequentBuy:
    def test_weighted_average_cost_calculated(self):
        # own 10 shares at $150, buy 5 more at $180
        # new avg = (10×150 + 5×180) / 15 = $160
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

        assert account.balance == Decimal("99100.00")

    def test_equal_price_buy_keeps_same_average(self):
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

    def test_buy_below_average_cost_lowers_average(self):
        # own 10 at $200, buy 10 at $100 → new avg = $150
        account = make_account()
        order = make_order(side="buy", quantity="10")
        holding = make_holding(quantity="10", average_cost="200.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("100.00"),
            fill_quantity=Decimal("10"),
        )

        assert holding.average_cost == Decimal("150.00")
        assert holding.quantity == Decimal("20")

    def test_fractional_crypto_weighted_average(self):
        # own 0.5 BTC at $40k, buy 0.25 at $44k → new avg ≈ $41,333.33
        account = make_account(balance="100000.00")
        order = make_order(
            ticker="BTC/USD", side="buy", quantity="0.25", asset_class="crypto"
        )
        holding = make_holding(
            ticker="BTC/USD",
            quantity="0.5",
            average_cost="40000.00",
            asset_class="crypto",
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

        assert account.balance == Decimal("10510.00")

    def test_sell_at_a_loss_still_credits_balance(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="5")
        holding = make_holding(quantity="10", average_cost="200.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("5"),
        )

        assert account.balance == Decimal("10750.00")

    def test_sell_at_breakeven_credits_balance(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="5")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("5"),
        )

        assert account.balance == Decimal("10750.00")

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
        # first fill: 6 @ $150, second fill: 4 @ $160 → avg = $154
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

    def test_partial_fill_balance_deducted_for_partial_quantity_only(self):
        # 6 shares × $150 = $900 deducted, not 10 × $150
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("6"),
        )

        assert account.balance == Decimal("99100.00")
