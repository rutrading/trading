"""Hand-rolled async REST client for the Kalshi trade API.

Verified Kalshi API facts pinned by branch 01:

* Origin defaults to ``https://demo-api.kalshi.co`` (demo-only in v1, no
  production flip).
* Every authenticated path lives under the ``/trade-api/v2`` prefix.
* Signing is PSS-SHA256 over ``{ts_ms}{METHOD}{full_prefixed_path}`` with the
  query string stripped; three ``KALSHI-*`` headers carry the result.
* Fixed-point dollar fields are six-decimal strings; contract counts are
  two-decimal strings. ``count_fp`` and ``yes_price_dollars`` /
  ``no_price_dollars`` therefore go on the wire as strings, never floats.
* Batch orderbook reads use ``GET /markets/orderbooks?tickers=A&tickers=B``
  with up to 100 ``tickers`` repetitions per call.
* Per-subaccount endpoints (orders, positions, fills, balances) take a
  ``subaccount`` parameter; primary-subaccount calls omit it.

Network clients and the private key load happen inside function bodies, not
at import time, so importing this module is side-effect-free even when no
Kalshi credentials are configured.
"""

from decimal import Decimal

import httpx

from app.config import get_config
from app.rate_limit import get_kalshi_limiter
from app.services.kalshi_auth import build_auth_headers, load_private_key


class KalshiMissingCredentials(Exception):
    """Raised when KALSHI_API_KEY_ID or KALSHI_PRIVATE_KEY_PEM is unset."""


class KalshiNotFound(Exception):
    """Raised on 404 from Kalshi."""


class KalshiRateLimited(Exception):
    """Raised on 429 from Kalshi."""


class KalshiRequestFailed(Exception):
    """Raised on any other Kalshi REST failure."""


_ORDERBOOK_BATCH_SIZE = 100


async def _request(
    method: str,
    path: str,
    *,
    params: list[tuple[str, str]] | None = None,
    json_body: dict | None = None,
) -> dict:
    """Sign and send a Kalshi request, translating HTTP failures.

    ``path`` is the path *without* the ``/trade-api/v2`` prefix. The signing
    helper sees the full prefixed path with query stripped; the wire request
    uses the same prefix as base_url joining.
    """
    config = get_config()
    if not config.kalshi_api_key_id or not config.kalshi_private_key_pem:
        raise KalshiMissingCredentials("Missing Kalshi API credentials")

    private_key = load_private_key(config.kalshi_private_key_pem)
    full_path = f"{config.kalshi_api_prefix}{path}"
    headers = build_auth_headers(
        config.kalshi_api_key_id, private_key, method, full_path
    )

    await get_kalshi_limiter().acquire()

    try:
        async with httpx.AsyncClient(
            base_url=config.kalshi_api_origin, timeout=10.0
        ) as client:
            res = await client.request(
                method,
                full_path,
                params=params,
                json=json_body,
                headers=headers,
            )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 404:
            raise KalshiNotFound(
                f"Kalshi resource not found: {method} {full_path}"
            ) from exc
        if status_code == 429:
            raise KalshiRateLimited("Kalshi rate limit exceeded") from exc
        raise KalshiRequestFailed(
            f"Kalshi request failed ({status_code}): {method} {full_path}"
        ) from exc
    except Exception as exc:
        raise KalshiRequestFailed(f"Kalshi request failed: {exc}") from exc

    return res.json()


async def list_btc_hourly_markets(limit: int = 200) -> list[dict]:
    config = get_config()
    body = await _request(
        "GET",
        "/markets",
        params=[
            ("series_ticker", config.kalshi_btc_series_ticker),
            ("status", "open"),
            ("limit", str(limit)),
        ],
    )
    return body.get("markets", [])


async def get_orderbooks(tickers: list[str]) -> dict[str, dict]:
    """Fetch orderbooks for many tickers, chunked at 100 per HTTP call."""
    merged: dict[str, dict] = {}
    for start in range(0, len(tickers), _ORDERBOOK_BATCH_SIZE):
        chunk = tickers[start : start + _ORDERBOOK_BATCH_SIZE]
        if not chunk:
            continue
        body = await _request(
            "GET",
            "/markets/orderbooks",
            params=[("tickers", t) for t in chunk],
        )
        for entry in body.get("orderbooks", []) or []:
            ticker = entry.get("ticker")
            if ticker:
                merged[ticker] = entry
    return merged


async def get_orderbook(ticker: str) -> dict:
    body = await _request("GET", f"/markets/{ticker}/orderbook")
    return body.get("orderbook", body)


async def place_order(
    *,
    client_order_id: str,
    ticker: str,
    side: str,
    action: str,
    count_fp: Decimal | str,
    limit_price_dollars: Decimal | str,
    time_in_force: str,
    subaccount_number: int | None,
) -> dict:
    if side not in ("yes", "no"):
        raise ValueError(f"Kalshi side must be 'yes' or 'no', got {side!r}")
    body: dict = {
        "client_order_id": client_order_id,
        "ticker": ticker,
        "side": side,
        "action": action,
        "type": "limit",
        "count_fp": str(count_fp),
        "time_in_force": time_in_force,
    }
    price_field = "yes_price_dollars" if side == "yes" else "no_price_dollars"
    body[price_field] = str(limit_price_dollars)
    if subaccount_number is not None:
        body["subaccount"] = subaccount_number
    return await _request("POST", "/portfolio/orders", json_body=body)


def _subaccount_params(
    subaccount_number: int, extra: list[tuple[str, str]] | None = None
) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = [("subaccount", str(subaccount_number))]
    if extra:
        params.extend(extra)
    return params


async def get_orders(
    *,
    subaccount_number: int,
    status: str | None = None,
    ticker: str | None = None,
    limit: int = 200,
) -> list[dict]:
    extra: list[tuple[str, str]] = [("limit", str(limit))]
    if status is not None:
        extra.append(("status", status))
    if ticker is not None:
        extra.append(("ticker", ticker))
    body = await _request(
        "GET",
        "/portfolio/orders",
        params=_subaccount_params(subaccount_number, extra),
    )
    return body.get("orders", [])


async def get_positions(
    *,
    subaccount_number: int,
    ticker: str | None = None,
) -> list[dict]:
    extra: list[tuple[str, str]] | None = (
        [("ticker", ticker)] if ticker is not None else None
    )
    body = await _request(
        "GET",
        "/portfolio/positions",
        params=_subaccount_params(subaccount_number, extra),
    )
    return body.get("market_positions", [])


async def get_fills(
    *,
    subaccount_number: int,
    ticker: str | None = None,
    after_ts: int | None = None,
    limit: int = 200,
) -> list[dict]:
    extra: list[tuple[str, str]] = [("limit", str(limit))]
    if ticker is not None:
        extra.append(("ticker", ticker))
    if after_ts is not None:
        extra.append(("min_ts", str(after_ts)))
    body = await _request(
        "GET",
        "/portfolio/fills",
        params=_subaccount_params(subaccount_number, extra),
    )
    return body.get("fills", [])


async def create_subaccount() -> dict:
    return await _request("POST", "/portfolio/subaccounts", json_body={})


async def get_subaccount_balances() -> list[dict]:
    # Kalshi's response wrapper key is `subaccount_balances`, not `balances`;
    # an earlier draft assumed the shorter form and the bot's _update_balance
    # silently no-op'd every cycle on live demo because the list was empty.
    body = await _request("GET", "/portfolio/subaccounts/balances")
    return body.get("subaccount_balances", [])
