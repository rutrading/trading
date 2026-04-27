from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal, Protocol


@dataclass(frozen=True)
class MarketSnapshot:
    ticker: str
    floor_strike: Decimal | None
    cap_strike: Decimal | None
    yes_bid_dollars: Decimal | None
    yes_ask_dollars: Decimal | None
    no_bid_dollars: Decimal | None
    no_ask_dollars: Decimal | None
    yes_bid_size_fp: Decimal | None
    no_bid_size_fp: Decimal | None
    close_time: datetime
    price_level_structure: str | None
    fractional_trading_enabled: bool


@dataclass(frozen=True)
class OrderIntent:
    market_ticker: str
    side: Literal["yes", "no"]
    action: Literal["buy", "sell"]
    count_fp: Decimal
    limit_price_dollars: Decimal
    rationale: dict


class Strategy(Protocol):
    name: str

    def evaluate(
        self,
        market: MarketSnapshot,
        btc_price: Decimal,
        history: list[Decimal],
        now: datetime,
    ) -> OrderIntent | None: ...


_REGISTRY: dict[str, Strategy] = {}


def register(strategy: Strategy) -> None:
    _REGISTRY[strategy.name] = strategy


def get_strategy(name: str) -> Strategy:
    if name not in _REGISTRY:
        raise KeyError(f"Unknown strategy: {name}")
    return _REGISTRY[name]


def list_strategies() -> list[str]:
    return sorted(_REGISTRY.keys())


def derive_strike(market: MarketSnapshot) -> Decimal | None:
    if market.floor_strike is not None and market.cap_strike is not None:
        return (market.floor_strike + market.cap_strike) / 2
    return market.floor_strike or market.cap_strike
