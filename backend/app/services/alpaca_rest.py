"""Shared Alpaca REST client utilities.

Extracted from `app/routers/quotes.py` so both the HTTP router and the
WebSocket feed's REST-polling fallback can reuse the same snapshot fetcher.
Raises plain exceptions — callers translate them into HTTPException if
they need to.
"""

from datetime import datetime, timezone

import httpx

from app.config import get_config
from app.schemas import QuoteData


class AlpacaMissingCredentials(Exception):
    """Raised when the Alpaca API key/secret are not configured."""


class AlpacaTickerNotFound(Exception):
    """Raised when Alpaca responds 404 for a ticker snapshot."""


class AlpacaRateLimited(Exception):
    """Raised when Alpaca responds 429."""


class AlpacaRequestFailed(Exception):
    """Raised for any other failure talking to Alpaca."""


async def fetch_snapshot(ticker: str) -> QuoteData:
    """Fetch a snapshot from Alpaca REST and return a normalized QuoteData."""
    config = get_config()

    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise AlpacaMissingCredentials("Missing Alpaca API credentials")

    headers = {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }

    # crypto tickers contain a slash (e.g. "BTC/USD")
    is_crypto = "/" in ticker

    try:
        async with httpx.AsyncClient(
            base_url=config.alpaca_data_base_url, timeout=10.0
        ) as client:
            if is_crypto:
                res = await client.get(
                    "/v1beta3/crypto/us/snapshots",
                    params={"symbols": ticker},
                    headers=headers,
                )
            else:
                res = await client.get(
                    f"/v2/stocks/{ticker}/snapshot",
                    params={"feed": config.alpaca_feed},
                    headers=headers,
                )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 404:
            raise AlpacaTickerNotFound(f"Ticker {ticker} not found") from exc
        if status_code == 429:
            raise AlpacaRateLimited("Alpaca rate limit exceeded") from exc
        raise AlpacaRequestFailed(
            f"Alpaca request failed ({status_code})"
        ) from exc
    except Exception as exc:
        raise AlpacaRequestFailed(f"Alpaca request failed: {exc}") from exc

    body = res.json()

    if is_crypto:
        snap = body.get("snapshots", {}).get(ticker, {})
    else:
        snap = body

    latest_trade = snap.get("latestTrade", {})
    latest_quote = snap.get("latestQuote", {})
    daily_bar = snap.get("dailyBar", {})
    prev_daily_bar = snap.get("prevDailyBar", {})

    price = float(latest_trade.get("p", 0))
    prev_close = float(prev_daily_bar.get("c", 0))
    change = price - prev_close if prev_close else 0
    change_pct = (change / prev_close * 100) if prev_close else 0

    now_ts = int(datetime.now(timezone.utc).timestamp())

    return QuoteData(
        ticker=ticker,
        price=price,
        bid_price=float(latest_quote.get("bp", 0)),
        bid_size=float(latest_quote.get("bs", 0)),
        ask_price=float(latest_quote.get("ap", 0)),
        ask_size=float(latest_quote.get("as", 0)),
        open=float(daily_bar.get("o", 0)),
        high=float(daily_bar.get("h", 0)),
        low=float(daily_bar.get("l", 0)),
        close=float(daily_bar.get("c", 0)),
        volume=float(daily_bar.get("v", 0)),
        trade_count=int(daily_bar.get("n", 0)),
        vwap=float(daily_bar.get("vw", 0)),
        previous_close=prev_close,
        change=round(change, 4),
        change_percent=round(change_pct, 4),
        source="alpaca_rest",
        timestamp=now_ts,
    )
