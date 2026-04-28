"""Threshold-drift strategy.

Educational heuristic: estimates a fair YES probability from realized
log-return volatility under a lognormal terminal-price assumption, then
buys whichever side is mispriced by at least DEFAULT_THRESHOLD_DOLLARS
versus its ask. Not real alpha — illustrative only.
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

DEFAULT_THRESHOLD_DOLLARS = Decimal("0.05")
MIN_HISTORY = 30
MIN_SECONDS_TO_CLOSE = 120


class ThresholdDriftStrategy:
    name = "threshold_drift"

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
        sigma = self._realized_vol(history)
        if sigma <= 0:
            return None
        fair_yes = self._lognormal_yes_prob(
            float(btc_price), float(strike), sigma, seconds_to_close
        )
        fair_dollars = Decimal(str(round(fair_yes, 4)))

        if market.yes_ask_dollars is not None:
            edge = fair_dollars - market.yes_ask_dollars
            if edge >= DEFAULT_THRESHOLD_DOLLARS:
                return OrderIntent(
                    market_ticker=market.ticker,
                    side="yes",
                    action="buy",
                    count_fp=Decimal("1.00"),
                    limit_price_dollars=market.yes_ask_dollars,
                    rationale={
                        "strategy": self.name,
                        "fair": str(fair_dollars),
                        "edge": str(edge),
                        "sigma": sigma,
                    },
                )

        if market.no_ask_dollars is not None:
            edge = (Decimal("1") - fair_dollars) - market.no_ask_dollars
            if edge >= DEFAULT_THRESHOLD_DOLLARS:
                return OrderIntent(
                    market_ticker=market.ticker,
                    side="no",
                    action="buy",
                    count_fp=Decimal("1.00"),
                    limit_price_dollars=market.no_ask_dollars,
                    rationale={
                        "strategy": self.name,
                        "fair_no": str(Decimal("1") - fair_dollars),
                        "edge": str(edge),
                        "sigma": sigma,
                    },
                )
        return None

    def _realized_vol(self, closes: list[Decimal]) -> float:
        rets: list[float] = []
        prev = float(closes[0])
        for c in closes[1:]:
            cur = float(c)
            if prev > 0 and cur > 0:
                rets.append(math.log(cur / prev))
            prev = cur
        if len(rets) < 2:
            return 0.0
        mean = sum(rets) / len(rets)
        var = sum((r - mean) ** 2 for r in rets) / len(rets)
        return math.sqrt(var)

    def _lognormal_yes_prob(
        self,
        spot: float,
        strike: float,
        sigma_per_step: float,
        seconds_to_close: float,
    ) -> float:
        steps = max(1.0, seconds_to_close / 60.0)
        sigma_total = sigma_per_step * math.sqrt(steps)
        if sigma_total <= 0 or spot <= 0 or strike <= 0:
            return 0.5
        z = math.log(strike / spot) / sigma_total
        return 0.5 * (1 - math.erf(z / math.sqrt(2)))


register(ThresholdDriftStrategy())
