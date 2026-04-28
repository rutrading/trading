"""Momentum strategy.

Educational heuristic: EMA(5) vs EMA(20) crossover on recent BTC closes.
When momentum aligns with the spot-vs-strike direction and the relevant ask
is at or below MAX_ENTRY_PRICE, emit a 1-contract buy at that ask.
"""

from datetime import datetime
from decimal import Decimal

from app.strategies.kalshi.base import (
    MarketSnapshot,
    OrderIntent,
    derive_strike,
    register,
)

MIN_HISTORY = 20
EMA_FAST = 5
EMA_SLOW = 20
MIN_SECONDS_TO_CLOSE = 120
MAX_ENTRY_PRICE = Decimal("0.80")


def _ema(values: list[Decimal], period: int) -> float:
    alpha = 2.0 / (period + 1)
    ema = float(values[0])
    for v in values[1:]:
        ema = alpha * float(v) + (1 - alpha) * ema
    return ema


class MomentumStrategy:
    name = "momentum"

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
        ema_fast = _ema(history, EMA_FAST)
        ema_slow = _ema(history, EMA_SLOW)
        if ema_fast == ema_slow:
            return None

        if ema_fast > ema_slow and btc_price > strike:
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
                    "ema_fast": ema_fast,
                    "ema_slow": ema_slow,
                },
            )

        if ema_fast < ema_slow and btc_price < strike:
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
                    "ema_fast": ema_fast,
                    "ema_slow": ema_slow,
                },
            )
        return None


register(MomentumStrategy())
