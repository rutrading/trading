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


class TestValidateOrderRequestFields:
    def test_invalid_asset_type(self):
        # "futures" is not in the allowed set (stock, etf, crypto) and must be rejected
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
        # "short" is not a valid side — only "buy" and "sell" are accepted
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
        # "trailing_stop" is not supported — only market, limit, stop, stop_limit
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
        # "fok" (fill-or-kill) is not supported — only "day" and "gtc"
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
        # quantity of 0 has no economic meaning and must be rejected
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
        # negative quantities are nonsensical and must be rejected
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
        # a well-formed market buy order with all valid fields should not raise
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

    def test_etf_market_order_passes(self):
        # ETF is a valid asset type and should be accepted like a stock
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="SPY",
            asset_type="etf",
            side="buy",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("5"),
            limit_price=None,
            stop_price=None,
        )

    def test_etf_day_order_passes(self):
        # ETFs trade during market hours so time_in_force="day" must be valid for them
        db = make_db()
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="QQQ",
            asset_type="etf",
            side="buy",
            order_type="market",
            time_in_force="day",
            quantity=Decimal("2"),
            limit_price=None,
            stop_price=None,
        )


class TestValidateOrderRequestCryptoTif:
    def test_crypto_day_order_rejected(self):
        # crypto trades 24/7 so "day" orders (which expire at market close) are
        # meaningless — only GTC is allowed for crypto
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
        # GTC is the correct time-in-force for crypto and must be accepted
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
        # stocks have defined market hours so "day" is a valid TIF for them
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

    def test_crypto_sell_day_order_rejected(self):
        # the crypto TIF rule applies to sells as well as buys
        db = make_db(
            holding=make_holding(symbol="ETH/USD", quantity="2", asset_type="crypto")
        )
        account = make_account()
        with pytest.raises(OrderValidationError, match="gtc"):
            validate_order_request(
                account=account,
                db=db,
                symbol="ETH/USD",
                asset_type="crypto",
                side="sell",
                order_type="market",
                time_in_force="day",
                quantity=Decimal("1"),
                limit_price=None,
                stop_price=None,
            )


class TestValidateOrderRequestPriceRules:
    def test_limit_order_requires_limit_price(self):
        # a limit order without a limit_price has no trigger condition and must be rejected
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

    def test_stop_limit_order_requires_limit_price(self):
        # stop_limit needs both prices; providing only stop_price without limit_price must fail
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

    def test_stop_limit_order_requires_stop_price(self):
        # stop_limit needs both prices; providing only limit_price without stop_price must fail
        db = make_db()
        account = make_account()
        with pytest.raises(OrderValidationError, match="stop_price is required"):
            validate_order_request(
                account=account,
                db=db,
                symbol="AAPL",
                asset_type="stock",
                side="buy",
                order_type="stop_limit",
                time_in_force="day",
                quantity=Decimal("10"),
                limit_price=Decimal("148.00"),
                stop_price=None,
            )

    def test_stop_order_requires_stop_price(self):
        # a stop order without a stop_price has no trigger and must be rejected
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
        # a limit price of zero is economically invalid
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

    def test_negative_limit_price_rejected(self):
        # a negative limit price is nonsensical and must be rejected
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
                limit_price=Decimal("-10.00"),
                stop_price=None,
            )

    def test_zero_stop_price_rejected(self):
        # a stop price of zero is economically invalid
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

    def test_negative_stop_price_rejected(self):
        # a negative stop price is nonsensical and must be rejected
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
                stop_price=Decimal("-5.00"),
            )

    def test_valid_limit_order_passes(self):
        # a limit buy with a positive limit_price and GTC should pass
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
        # a stop_limit with both stop_price and limit_price present should pass
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

    def test_valid_stop_order_passes(self):
        # a stop sell order with a positive stop_price and an existing position should pass
        holding = make_holding(quantity="10")
        db = make_db(holding=holding)
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="AAPL",
            asset_type="stock",
            side="sell",
            order_type="stop",
            time_in_force="gtc",
            quantity=Decimal("5"),
            limit_price=None,
            stop_price=Decimal("140.00"),
        )


class TestValidateOrderRequestSellPosition:
    def test_sell_without_holding_rejected(self):
        # user has no position at all in this symbol — short selling is not allowed
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
        # user owns 3 shares but tries to sell 5 — overselling must be rejected
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
        # selling exactly what you own (full liquidation) must be allowed
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
        # selling a portion of an existing position must be allowed
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

    def test_sell_fractional_crypto_quantity_passes(self):
        # fractional sell of a crypto position must be allowed
        holding = make_holding(
            symbol="BTC/USD",
            quantity="0.5",
            average_cost="40000.00",
            asset_type="crypto",
        )
        db = make_db(holding=holding)
        account = make_account()
        validate_order_request(
            account=account,
            db=db,
            symbol="BTC/USD",
            asset_type="crypto",
            side="sell",
            order_type="market",
            time_in_force="gtc",
            quantity=Decimal("0.25"),
            limit_price=None,
            stop_price=None,
        )

    def test_sell_fractional_crypto_oversell_rejected(self):
        # trying to sell more crypto than owned must be rejected
        holding = make_holding(
            symbol="BTC/USD",
            quantity="0.1",
            average_cost="40000.00",
            asset_type="crypto",
        )
        db = make_db(holding=holding)
        account = make_account()
        with pytest.raises(OrderValidationError, match="Insufficient position"):
            validate_order_request(
                account=account,
                db=db,
                symbol="BTC/USD",
                asset_type="crypto",
                side="sell",
                order_type="market",
                time_in_force="gtc",
                quantity=Decimal("0.5"),
                limit_price=None,
                stop_price=None,
            )


class TestValidateBuyingPower:
    def test_insufficient_balance_rejected(self):
        # balance of $500 is not enough to buy 10 shares at $100 ($1,000 needed)
        account = make_account(balance="500.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_exact_balance_passes(self):
        # balance exactly covers the cost (10 × $100 = $1,000) — boundary condition
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))

    def test_sufficient_balance_passes(self):
        # standard case where balance easily covers the purchase
        account = make_account(balance="100000.00")
        validate_buying_power(account, "buy", Decimal("10"), Decimal("185.50"))

    def test_sell_side_skips_balance_check(self):
        # sells add to the balance rather than drawing from it so no check is needed
        account = make_account(balance="0.00")
        validate_buying_power(account, "sell", Decimal("10"), Decimal("185.50"))

    def test_fractional_crypto_buy_passes(self):
        # 0.001 BTC × $50,000 = $50 — well within the $1,000 balance
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("0.001"), Decimal("50000.00"))

    def test_fractional_crypto_buy_insufficient(self):
        # 0.1 BTC × $50,000 = $5,000 — exceeds the $10 balance
        account = make_account(balance="10.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.1"), Decimal("50000.00"))

    def test_fractional_stock_buy_passes(self):
        # 0.5 shares × $200 = $100 — fractional stocks should also be checked correctly
        account = make_account(balance="1000.00")
        validate_buying_power(account, "buy", Decimal("0.5"), Decimal("200.00"))

    def test_fractional_stock_buy_insufficient(self):
        # 0.5 shares × $200 = $100 — fails when balance is only $50
        account = make_account(balance="50.00")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("0.5"), Decimal("200.00"))

    def test_balance_one_cent_short_rejected(self):
        # off-by-one: balance is $999.99 but cost is $1,000.00 — must be rejected
        account = make_account(balance="999.99")
        with pytest.raises(OrderValidationError, match="Insufficient buying power"):
            validate_buying_power(account, "buy", Decimal("10"), Decimal("100.00"))


class TestExecuteFillFirstBuy:
    def test_creates_holding_on_first_buy(self):
        # when no holding exists, a new Holding row must be created with the correct
        # symbol, quantity, and average_cost equal to the fill price
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
        # 10 shares × $150 = $1,500 must be deducted from the account balance
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
        # when fill_quantity equals order quantity the order status must become "filled"
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
        # a Transaction record must be created capturing quantity, price, total, and side
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
        # the transaction must carry both order_id and trading_account_id so it can
        # be traced back to its source without additional joins
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
        # smallest meaningful crypto quantity must create a holding without precision loss
        account = make_account(balance="100000.00")
        order = make_order(
            symbol="BTC/USD", side="buy", quantity="0.00000001", asset_type="crypto"
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
        # 5 shares × $180 = $900 must be deducted regardless of existing position
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
        # buying at the same price as the existing average cost must leave it unchanged
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
        # buying at a lower price than existing average cost must pull the average down
        # own 10 at $200, buy 10 at $100 → new avg = (10×200 + 10×100) / 20 = $150
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
        # own 0.5 BTC at $40,000, buy 0.25 BTC at $44,000
        # new avg = (0.5×40000 + 0.25×44000) / 0.75 ≈ $41,333.33…
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


class TestExecuteFillSell:
    def test_sell_reduces_holding_quantity(self):
        # selling 3 of 10 shares must reduce the holding quantity to 7
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
        # selling shares does not recalculate cost basis — only buys affect average cost
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
        # 3 shares × $170 = $510 must be added to the account balance
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
        # selling below average cost is a realized loss but the proceeds still credit
        # the balance — the sell price (not the cost basis) determines the cash received
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

        # 5 × $150 = $750 credited despite buying at $200
        assert account.balance == Decimal("10750.00")

    def test_sell_at_breakeven_credits_balance(self):
        # selling at exactly the average cost should still credit the balance correctly
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

        # 5 × $150 = $750 credited
        assert account.balance == Decimal("10750.00")

    def test_full_sell_deletes_holding(self):
        # selling all shares must remove the holding row entirely so it does not
        # show as a zero-quantity position in the portfolio
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
        # a partial sell must not remove the holding row — remaining shares still exist
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
        # a sell fill must produce a Transaction with the correct side, quantity,
        # price, and computed total
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
        # filling 6 of 10 ordered shares must move status to "partially_filled"
        # and record filled_quantity as 6, not 10
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
        # a second fill that brings total filled_quantity up to the order quantity
        # must transition status from "partially_filled" to "filled"
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
        # first fill: 6 shares at $150, second fill: 4 shares at $160
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

    def test_partial_fill_balance_deducted_for_partial_quantity_only(self):
        # only the filled portion should be deducted from the balance, not the full order
        # first fill of 6 shares at $150 = $900 deducted, not 10 × $150 = $1,500
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
