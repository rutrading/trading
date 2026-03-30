from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.db.models import Holding, Order, TradingAccount, Transaction
from app.services.trading import (
    MARKET_BASE_SLIPPAGE,
    MARKET_IMPACT_FACTOR,
    OrderValidationError,
    compute_market_fill_price,
    compute_stop_reservation_per_share,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)


def make_account(balance: str = "100000", account_id: int = 1, reserved_balance: str = "0") -> TradingAccount:
    account = TradingAccount()
    account.id = account_id
    account.balance = Decimal(balance)
    account.reserved_balance = Decimal(reserved_balance)
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
    order.reserved_per_share = None
    return order


def make_holding(
    ticker: str = "AAPL",
    quantity: str = "10",
    reserved_quantity: str = "0",
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
    holding.reserved_quantity = Decimal(reserved_quantity)
    holding.average_cost = Decimal(average_cost)
    return holding


def make_db(holding: Holding | None = None, account: TradingAccount | None = None) -> MagicMock:
    db = MagicMock()

    def query_side_effect(model):
        mock_query = MagicMock()
        if model is TradingAccount:
            mock_query.filter.return_value.with_for_update.return_value.first.return_value = account
            mock_query.filter.return_value.first.return_value = account
        else:
            # Holding and any other model — both locked and unlocked paths return holding
            mock_query.filter.return_value.with_for_update.return_value.first.return_value = holding
            mock_query.filter.return_value.first.return_value = holding
        return mock_query

    db.query.side_effect = query_side_effect
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
        # Buy stop-limit: stop triggers at $150, limit caps buy at $155 (stop <= limit)
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            time_in_force="gtc",
            quantity=Decimal("10"),
            stop_price=Decimal("150.00"),
            limit_price=Decimal("155.00"),
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

    def test_fractional_crypto_buy_passes(self):
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("0.001"), Decimal("50000.00"))

    def test_fractional_crypto_buy_insufficient(self):
        account = make_account(balance="10.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.1"), Decimal("50000.00"))

    def test_balance_one_cent_short_rejected(self):
        account = make_account(balance="999.99")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))


class TestExecuteFillFirstBuy:
    def test_creates_holding_on_first_buy(self):
        account = make_account(balance="100000.00")
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

        txn = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("100.00"),
            fill_quantity=Decimal("5"),
        )

        assert txn is not None
        assert txn.order_id == order.id
        assert txn.trading_account_id == account.id

    def test_first_buy_tiny_fractional_quantity(self):
        account = make_account(balance="100000.00")
        order = make_order(
            ticker="BTC/USD", side="buy", quantity="0.00000001", asset_class="crypto"
        )
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

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
        db = make_db(holding=holding, account=account)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("5"),
        )

        db.delete.assert_not_called()
        assert holding.quantity == Decimal("5")

    def test_partial_sell_sets_partially_filled_status(self):
        # fill 3 of 10 shares on a sell → status should be partially_filled
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="10")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding, account=account)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        assert order.status == "partially_filled"
        assert order.filled_quantity == Decimal("3")

    def test_sell_transaction_recorded(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", quantity="3")
        holding = make_holding(quantity="10", average_cost="150.00")
        db = make_db(holding=holding, account=account)

        txn = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("170.00"),
            fill_quantity=Decimal("3"),
        )

        assert txn is not None
        assert txn.side == "sell"
        assert txn.quantity == Decimal("3")
        assert txn.price == Decimal("170.00")
        assert txn.total == Decimal("510.00")


class TestExecuteFillPartial:
    def test_partial_fill_sets_partially_filled_status(self):
        account = make_account()
        order = make_order(side="buy", quantity="10")
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

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
        db = make_db(holding=None, account=account)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("150.00"),
            fill_quantity=Decimal("6"),
        )

        assert account.balance == Decimal("99100.00")


# ---------------------------------------------------------------------------
# Time-in-force: opg / cls
# ---------------------------------------------------------------------------


class TestValidateOrderRequestTifOpenClose:
    def test_opg_accepted_for_us_equity(self):
        db = make_db()
        account = make_account()
        _validate(account, db, asset_class="us_equity", time_in_force="opg", quantity=Decimal("5"))

    def test_cls_accepted_for_us_equity(self):
        db = make_db()
        account = make_account()
        _validate(account, db, asset_class="us_equity", time_in_force="cls", quantity=Decimal("5"))

    def test_opg_rejected_for_crypto(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="opg"):
            _validate(
                account,
                db,
                ticker="BTC/USD",
                asset_class="crypto",
                time_in_force="opg",
                quantity=Decimal("0.1"),
            )

    def test_cls_rejected_for_crypto(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="cls"):
            _validate(
                account,
                db,
                ticker="ETH/USD",
                asset_class="crypto",
                time_in_force="cls",
                quantity=Decimal("1"),
            )

    def test_opg_accepted_for_us_equity_sell(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", asset_class="us_equity", time_in_force="opg", quantity=Decimal("5"))

    def test_cls_accepted_for_us_equity_sell(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", asset_class="us_equity", time_in_force="cls", quantity=Decimal("5"))


# ---------------------------------------------------------------------------
# Stop-limit price relationship
# ---------------------------------------------------------------------------


class TestValidateStopLimitPriceRelationship:
    def test_buy_stop_limit_stop_above_limit_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price must be <= limit_price"):
            _validate(
                account,
                db,
                order_type="stop_limit",
                side="buy",
                time_in_force="gtc",
                quantity=Decimal("10"),
                stop_price=Decimal("160.00"),
                limit_price=Decimal("155.00"),
            )

    def test_buy_stop_limit_stop_equal_limit_accepted(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            side="buy",
            time_in_force="gtc",
            quantity=Decimal("10"),
            stop_price=Decimal("155.00"),
            limit_price=Decimal("155.00"),
        )

    def test_buy_stop_limit_stop_below_limit_accepted(self):
        db = make_db()
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            side="buy",
            time_in_force="gtc",
            quantity=Decimal("10"),
            stop_price=Decimal("150.00"),
            limit_price=Decimal("155.00"),
        )

    def test_sell_stop_limit_stop_below_limit_rejected(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price must be >= limit_price"):
            _validate(
                account,
                db,
                order_type="stop_limit",
                side="sell",
                time_in_force="gtc",
                quantity=Decimal("5"),
                stop_price=Decimal("140.00"),
                limit_price=Decimal("145.00"),
            )

    def test_sell_stop_limit_stop_equal_limit_accepted(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            side="sell",
            time_in_force="gtc",
            quantity=Decimal("5"),
            stop_price=Decimal("145.00"),
            limit_price=Decimal("145.00"),
        )

    def test_sell_stop_limit_stop_above_limit_accepted(self):
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        _validate(
            account,
            db,
            order_type="stop_limit",
            side="sell",
            time_in_force="gtc",
            quantity=Decimal("5"),
            stop_price=Decimal("148.00"),
            limit_price=Decimal("145.00"),
        )


# ---------------------------------------------------------------------------
# Stop reservation per-share equation
# ---------------------------------------------------------------------------


class TestStopOrderBuyingPowerMustUseRps:
    def test_rps_always_exceeds_stop_price(self):
        # even with zero ATR the flat 2% buffer makes rps > stop_price
        rps = compute_stop_reservation_per_share(Decimal("100"), Decimal("0"))
        assert rps > Decimal("100")

    def test_barely_enough_at_stop_price_passes_but_fails_at_rps(self):
        # balance=$1010, qty=10, stop=$100 → needs $1000 at stop_price (passes)
        # rps = max(100×1.02, 100+1.5×5) = max($102, $107.50) = $107.50 → needs $1075 (fails)
        # this is the exact scenario the bug allowed through: check was against stop_price
        stop_price = Decimal("100")
        atr = Decimal("5")
        rps = compute_stop_reservation_per_share(stop_price, atr)
        qty = Decimal("10")
        account = make_account(balance="1010.00")

        validate_buying_power(account, "buy", qty, stop_price)  # incorrectly passed before fix

        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", qty, rps)  # correct check after fix


class TestMarketOrderBuyingPowerMustUseSlippagePrice:
    def test_fill_price_always_exceeds_quote_for_buys(self):
        fill = compute_market_fill_price(Decimal("100"), "buy", Decimal("10"), Decimal("1000000"))
        assert fill > Decimal("100")

    def test_barely_enough_at_quote_passes_but_fails_at_fill_price(self):
        # balance=$1000.01, qty=10, quote=$100 → needs $1000 at quote (passes)
        # fill_price = $100 × (1 + ~0.05%) = ~$100.05 → needs ~$1000.50 (fails)
        # this is the exact scenario the bug allowed through: check was against market_price
        quote = Decimal("100")
        qty = Decimal("10")
        volume = Decimal("1000000")
        fill_price = compute_market_fill_price(quote, "buy", qty, volume)
        account = make_account(balance=str(qty * quote + Decimal("0.01")))  # $1000.01

        validate_buying_power(account, "buy", qty, quote)  # incorrectly passed before fix

        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", qty, fill_price)  # correct check after fix


class TestComputeMarketFillPrice:
    def test_base_slippage_applied_when_no_volume_data(self):
        # without volume data only base slippage applies
        fill = compute_market_fill_price(Decimal("100"), "buy", Decimal("10"), None)
        expected = Decimal("100") * (1 + MARKET_BASE_SLIPPAGE)
        assert fill == expected

    def test_large_order_relative_to_volume_increases_slippage(self):
        # bigger order as share of daily volume → more market impact → higher slippage
        small_fill = compute_market_fill_price(Decimal("100"), "buy", Decimal("100"), Decimal("2000000"))
        large_fill = compute_market_fill_price(Decimal("100"), "buy", Decimal("50000"), Decimal("2000000"))
        assert large_fill > small_fill

    def test_market_impact_formula_is_correct(self):
        quote = Decimal("200")
        qty = Decimal("1000")
        volume = Decimal("1000000")
        expected_slippage = MARKET_BASE_SLIPPAGE + (qty / volume) * MARKET_IMPACT_FACTOR
        expected_fill = quote * (1 + expected_slippage)
        fill = compute_market_fill_price(quote, "buy", qty, volume)
        assert fill == expected_fill

    def test_zero_volume_falls_back_to_base_slippage(self):
        fill = compute_market_fill_price(Decimal("100"), "buy", Decimal("10"), Decimal("0"))
        expected = Decimal("100") * (1 + MARKET_BASE_SLIPPAGE)
        assert fill == expected

    def test_sell_formula_exact_value(self):
        # sell fill = quote × (1 - slippage), verify exact value not just direction
        quote = Decimal("200")
        qty = Decimal("1000")
        volume = Decimal("1000000")
        expected_slippage = MARKET_BASE_SLIPPAGE + (qty / volume) * MARKET_IMPACT_FACTOR
        expected_fill = quote * (1 - expected_slippage)
        fill = compute_market_fill_price(quote, "sell", qty, volume)
        assert fill == expected_fill


class TestComputeStopReservationPerShare:
    def test_atr_term_dominates_when_atr_is_high(self):
        # stop=$200, ATR=$10 → option_b = 200 + 1.5×10 = $215 > option_a = 200×1.02 = $204
        result = compute_stop_reservation_per_share(Decimal("200"), Decimal("10"))
        assert result == Decimal("215.0")

    def test_percentage_term_dominates_when_atr_is_low(self):
        # stop=$200, ATR=$0.50 → option_a = 200×1.02 = $204 > option_b = 200 + 1.5×0.5 = $200.75
        result = compute_stop_reservation_per_share(Decimal("200"), Decimal("0.50"))
        assert result == Decimal("204.00")

    def test_zero_atr_falls_back_to_percentage_only(self):
        # ATR=0 → option_b = stop + 0 = stop; option_a = stop×1.02 wins
        result = compute_stop_reservation_per_share(Decimal("100"), Decimal("0"))
        assert result == Decimal("102.00")

    def test_exact_boundary_where_both_terms_equal(self):
        # want option_a == option_b: stop×1.02 = stop + 1.5×ATR → ATR = stop×0.02/1.5
        # stop=$150 → ATR = 150×0.02/1.5 = $2 → both = 150×1.02 = $153
        result = compute_stop_reservation_per_share(Decimal("150"), Decimal("2"))
        assert result == Decimal("153.00")


# ---------------------------------------------------------------------------
# Buying power — uses account.reserved_balance directly
# ---------------------------------------------------------------------------


class TestValidateBuyingPowerWithReservation:
    def test_second_order_rejected_when_reserved_blocks_balance(self):
        # balance $1000, already reserved $900, new order needs $200 → blocked
        account = make_account(balance="1000.00", reserved_balance="900.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("2"), Decimal("100.00"))

    def test_second_order_passes_when_balance_sufficient(self):
        # balance $1000, reserved $500, new order needs $400 → ok
        account = make_account(balance="1000.00", reserved_balance="500.00")
        validate_buying_power(account, "buy", Decimal("4"), Decimal("100.00"))

    def test_sell_side_ignores_reserved(self):
        account = make_account(balance="0.00", reserved_balance="999999")
        # Should not raise even with huge reserved value
        validate_buying_power(account, "sell", Decimal("10"), Decimal("100.00"))

    def test_exact_available_balance_passes(self):
        # balance=$1000, reserved=$600, need=$400 exactly → should pass (not raise)
        account = make_account(balance="1000.00", reserved_balance="600.00")
        validate_buying_power(account, "buy", Decimal("4"), Decimal("100.00"))


# ---------------------------------------------------------------------------
# execute_fill — reserved balance release and pre-fill check
# ---------------------------------------------------------------------------


class TestExecuteFillReleasesReservedBalance:
    def test_full_fill_releases_full_reservation(self):
        # 10 shares at $2/share reserved = $20 total; fill releases all $20
        account = make_account(balance="10000.00", reserved_balance="20.00")
        order = make_order(side="buy", quantity="10")
        order.reserved_per_share = Decimal("2.00")
        db = make_db(holding=None, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("1.50"), fill_quantity=Decimal("10"))

        assert account.reserved_balance == Decimal("0.00")

    def test_partial_fill_releases_proportional_reservation(self):
        # 10 shares at $2/share reserved = $20; fill 4 shares → release $8
        account = make_account(balance="10000.00", reserved_balance="20.00")
        order = make_order(side="buy", quantity="10")
        order.reserved_per_share = Decimal("2.00")
        db = make_db(holding=None, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("1.50"), fill_quantity=Decimal("4"))

        assert account.reserved_balance == Decimal("12.00")  # 20 - 4×2

    def test_no_reserved_per_share_does_not_change_reserved_balance(self):
        # market order: reserved_per_share is None → reserved_balance unchanged
        account = make_account(balance="10000.00", reserved_balance="500.00")
        order = make_order(side="buy", quantity="5")
        order.reserved_per_share = None
        db = make_db(holding=None, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("100.00"), fill_quantity=Decimal("5"))

        assert account.reserved_balance == Decimal("500.00")

    def test_reserved_balance_cannot_go_below_zero(self):
        # reserved_balance=$10 but release would be 10×$5=$50 — floors at $0
        # this guards against rounding or race conditions in production
        account = make_account(balance="10000.00", reserved_balance="10.00")
        order = make_order(side="buy", quantity="10")
        order.reserved_per_share = Decimal("5.00")
        db = make_db(holding=None, account=account)

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("3.00"),
            fill_quantity=Decimal("10"),
        )

        assert account.reserved_balance == Decimal("0")

    def test_sell_fill_does_not_touch_reserved_balance(self):
        account = make_account(balance="0.00", reserved_balance="200.00")
        order = make_order(side="sell", quantity="5")
        order.reserved_per_share = None
        holding = make_holding(ticker="AAPL", quantity="10")
        db = make_db(holding=holding, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("100.00"), fill_quantity=Decimal("5"))

        assert account.reserved_balance == Decimal("200.00")


class TestExecuteFillInsufficientFundsAtFillTime:
    def test_returns_none_when_balance_insufficient(self):
        # account has $100 balance but other reservations are $90
        # this order reserved $50/share for 2 shares (=$100 reserved)
        # other_reserved = 100 - 2×50 = 0, available = 100 - 0 = $100
        # fill cost = 2 × $80 = $160 > $100 → rejected
        account = make_account(balance="100.00", reserved_balance="100.00")
        order = make_order(side="buy", quantity="2")
        order.reserved_per_share = Decimal("50.00")
        db = make_db(holding=None, account=account)

        result = execute_fill(db=db, order=order, account=account, fill_price=Decimal("80.00"), fill_quantity=Decimal("2"))

        assert result is None
        assert order.status == "cancelled"
        assert order.rejection_reason is not None

    def test_reserved_balance_released_on_rejection(self):
        # same setup: fill rejected, reservation should be cleared
        account = make_account(balance="100.00", reserved_balance="100.00")
        order = make_order(side="buy", quantity="2")
        order.reserved_per_share = Decimal("50.00")
        db = make_db(holding=None, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("80.00"), fill_quantity=Decimal("2"))

        # reserved_balance should decrease by remaining × reserved_per_share = 2×50 = $100
        assert account.reserved_balance == Decimal("0.00")

    def test_pre_fill_check_with_partially_filled_order_rejected(self):
        # order: 10 shares total, 4 already filled, remaining=6
        # reserved_per_share=$50, reserved_balance=6×$50=$300
        # other_reserved = 300 - 6×50 = $0, available = $200
        # fill cost = 6 × $60 = $360 > $200 → rejected
        account = make_account(balance="200.00", reserved_balance="300.00")
        order = make_order(side="buy", quantity="10")
        order.filled_quantity = Decimal("4")
        order.average_fill_price = Decimal("55.00")
        order.status = "partially_filled"
        order.reserved_per_share = Decimal("50.00")
        db = make_db(holding=None, account=account)

        result = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("60.00"),
            fill_quantity=Decimal("6"),
        )

        assert result is None
        assert order.status == "cancelled"

    def test_pre_fill_check_with_partially_filled_order_passes(self):
        # same order shape, but balance is sufficient
        account = make_account(balance="500.00", reserved_balance="300.00")
        order = make_order(side="buy", quantity="10")
        order.filled_quantity = Decimal("4")
        order.average_fill_price = Decimal("55.00")
        order.status = "partially_filled"
        order.reserved_per_share = Decimal("50.00")
        db = make_db(holding=None, account=account)

        result = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=Decimal("60.00"),
            fill_quantity=Decimal("6"),
        )

        assert result is not None
        assert order.status == "filled"

    def test_sufficient_funds_returns_transaction(self):
        # balance=$10000, reserved=$100 (this order's reservation), fill $50 per share × 2 = $100
        account = make_account(balance="10000.00", reserved_balance="100.00")
        order = make_order(side="buy", quantity="2")
        order.reserved_per_share = Decimal("50.00")
        db = make_db(holding=None, account=account)

        result = execute_fill(db=db, order=order, account=account, fill_price=Decimal("50.00"), fill_quantity=Decimal("2"))

        assert result is not None
        assert order.status == "filled"


# ---------------------------------------------------------------------------
# Gap 1 — Extraneous price fields
# ---------------------------------------------------------------------------


class TestValidateOrderRequestForbiddenPriceFields:
    def test_market_order_with_limit_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is not valid for market orders"):
            _validate(account, db, order_type="market", limit_price=Decimal("150.00"))

    def test_market_order_with_stop_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is not valid for market orders"):
            _validate(account, db, order_type="market", stop_price=Decimal("145.00"))

    def test_limit_order_with_stop_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is not valid for limit orders"):
            _validate(
                account, db,
                order_type="limit",
                time_in_force="gtc",
                limit_price=Decimal("150.00"),
                stop_price=Decimal("145.00"),
            )

    def test_stop_order_with_limit_price_rejected(self):
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="limit_price is not valid for stop orders"):
            _validate(
                account, db,
                order_type="stop",
                time_in_force="gtc",
                stop_price=Decimal("145.00"),
                limit_price=Decimal("150.00"),
            )

    def test_stop_limit_order_with_both_prices_passes(self):
        # stop_limit requires both — neither is forbidden
        db = make_db()
        account = make_account()
        _validate(
            account, db,
            order_type="stop_limit",
            time_in_force="gtc",
            stop_price=Decimal("148.00"),
            limit_price=Decimal("150.00"),
        )

    def test_market_order_with_no_price_fields_passes(self):
        db = make_db()
        account = make_account()
        _validate(account, db, order_type="market")


# ---------------------------------------------------------------------------
# Gap 2 — Double-sell / reserved_quantity validation
# ---------------------------------------------------------------------------


class TestValidateOrderRequestSellReservedQuantity:
    def test_sell_passes_when_no_shares_reserved(self):
        holding = make_holding(quantity="10", reserved_quantity="0")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", quantity=Decimal("10"))

    def test_sell_rejected_when_all_shares_reserved(self):
        # all 10 shares committed to an existing open sell order
        holding = make_holding(quantity="10", reserved_quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="available to sell"):
            _validate(account, db, side="sell", quantity=Decimal("1"))

    def test_sell_rejected_when_partial_reservation_leaves_insufficient(self):
        # 8 shares reserved, only 2 available — trying to sell 5
        holding = make_holding(quantity="10", reserved_quantity="8")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="available to sell"):
            _validate(account, db, side="sell", quantity=Decimal("5"))

    def test_sell_passes_when_enough_unreserved_shares_remain(self):
        # 5 reserved, 5 available — selling 5 is fine
        holding = make_holding(quantity="10", reserved_quantity="5")
        db = make_db(holding=holding)
        account = make_account()
        _validate(account, db, side="sell", quantity=Decimal("5"))

    def test_market_sell_also_checks_reserved_quantity(self):
        # market sells fill immediately but must still respect reserved_quantity
        holding = make_holding(quantity="10", reserved_quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="available to sell"):
            _validate(account, db, side="sell", order_type="market", quantity=Decimal("1"))


# ---------------------------------------------------------------------------
# Gap 2 — reserved_quantity released at fill
# ---------------------------------------------------------------------------


class TestExecuteFillReleasesReservedQuantity:
    def test_non_market_sell_fill_releases_reserved_quantity(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="limit", quantity="10")
        holding = make_holding(quantity="10", reserved_quantity="10")
        db = make_db(holding=holding, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("10"))

        assert holding.reserved_quantity == Decimal("0")

    def test_partial_sell_fill_releases_proportional_reserved_quantity(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="limit", quantity="10")
        holding = make_holding(quantity="10", reserved_quantity="10")
        db = make_db(holding=holding, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("4"))

        assert holding.reserved_quantity == Decimal("6")

    def test_market_sell_fill_does_not_touch_reserved_quantity(self):
        # market sells never had a reservation — reserved_quantity must stay unchanged
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="market", quantity="5")
        holding = make_holding(quantity="10", reserved_quantity="5")
        db = make_db(holding=holding, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("5"))

        assert holding.reserved_quantity == Decimal("5")

    def test_reserved_quantity_cannot_go_below_zero(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="limit", quantity="10")
        holding = make_holding(quantity="10", reserved_quantity="3")
        db = make_db(holding=holding, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("10"))

        assert holding.reserved_quantity == Decimal("0")


# ---------------------------------------------------------------------------
# Gap 2 — ghost-fill protection: sell fill with no holding cancels the order
# ---------------------------------------------------------------------------


class TestExecuteFillSellWithNoHolding:
    def test_sell_fill_returns_none_when_holding_missing(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="limit", quantity="5")
        db = make_db(holding=None, account=account)

        result = execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("5"))

        assert result is None
        assert order.status == "cancelled"
        assert order.rejection_reason is not None

    def test_sell_fill_does_not_credit_balance_when_holding_missing(self):
        account = make_account(balance="10000.00")
        order = make_order(side="sell", order_type="limit", quantity="5")
        db = make_db(holding=None, account=account)

        execute_fill(db=db, order=order, account=account, fill_price=Decimal("150.00"), fill_quantity=Decimal("5"))

        assert account.balance == Decimal("10000.00")
