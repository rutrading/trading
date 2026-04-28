from sqlalchemy.orm import Session

from app.db.models import KalshiSignal
from app.strategies.kalshi.base import OrderIntent


def write_signal(
    db: Session,
    *,
    trading_account_id: int,
    strategy: str,
    decision: str,
    market_ticker: str | None = None,
    intent: OrderIntent | None = None,
    reason: str | None = None,
    snapshot: dict | None = None,
) -> KalshiSignal:
    """Insert a kalshi_signal row, flush so the autoincrement id is populated,
    and return it. The caller still owns the surrounding commit."""
    row = KalshiSignal(
        trading_account_id=trading_account_id,
        market_ticker=market_ticker or (intent.market_ticker if intent else None),
        strategy=strategy,
        side=intent.side if intent else None,
        action=intent.action if intent else None,
        count_fp=intent.count_fp if intent else None,
        limit_price_dollars=intent.limit_price_dollars if intent else None,
        decision=decision,
        reason=reason,
        snapshot=snapshot or (intent.rationale if intent else None),
    )
    db.add(row)
    db.flush()
    return row
