"""Mean-reversion strategy.

Educational heuristic: z-score of BTC spot against the last 30 minute closes.
When spot is stretched in one direction but the market strike is still on the
opposite side, buy the contract that pays off if BTC reverts past the strike.
"""

import math
from datetime import datetime
from decimal import Decimal

from app.strategies.kalshi.base import (
    MarketSnapshot,
    OrderIntent,
    derive_strike,
    register,
)

MIN_HISTORY = 30
LOOKBACK = 30
Z_THRESHOLD = 1.5
MIN_SECONDS_TO_CLOSE = 120
MAX_ENTRY_PRICE = Decimal("0.80")


class MeanReversionStrategy:
    name = "mean_reversion"

    def evaluate(
        self,
        market: MarketSnapshot,
        btc_price: Decimal,
        history: list[Decimal],
        now: datetime,
    ) -> OrderIntent | None:
        if len(history) < MIN_HISTORY:
            return None
        seconds_to_close = (market.close_time - now).total_seconds()
        if seconds_to_close < MIN_SECONDS_TO_CLOSE:
            return None
        strike = derive_strike(market)
        if strike is None:
            return None
        floats = [float(c) for c in history[-LOOKBACK:]]
        mean = sum(floats) / len(floats)
        var = sum((x - mean) ** 2 for x in floats) / len(floats)
        stdev = math.sqrt(var)
        if stdev <= 0:
            return None
        z = (float(btc_price) - mean) / stdev

        if z > Z_THRESHOLD and btc_price > strike:
            ask = market.no_ask_dollars
            if ask is None or ask > MAX_ENTRY_PRICE:
                return None
            return OrderIntent(
                market_ticker=market.ticker,
                side="no",
                action="buy",
                count_fp=Decimal("1.00"),
                limit_price_dollars=ask,
                rationale={
                    "strategy": self.name,
                    "z": z,
                    "mean": mean,
                    "stdev": stdev,
                },
            )

        if z < -Z_THRESHOLD and btc_price < strike:
            ask = market.yes_ask_dollars
            if ask is None or ask > MAX_ENTRY_PRICE:
                return None
            return OrderIntent(
                market_ticker=market.ticker,
                side="yes",
                action="buy",
                count_fp=Decimal("1.00"),
                limit_price_dollars=ask,
                rationale={
                    "strategy": self.name,
                    "z": z,
                    "mean": mean,
                    "stdev": stdev,
                },
            )
        return None


register(MeanReversionStrategy())
