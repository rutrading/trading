"""Async REST client for the Kalshi trade API.

The client is small but every wire detail is load-bearing: signature scope,
fixed-point string serialization, repeated-key query params, subaccount
inclusion rules, and rate-limiter ordering. These tests pin each one and
also guarantee that importing the module never opens a network client or
loads a private key.
"""

import asyncio
import base64
import json
import sys
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

import app.rate_limit as rate_limit_module


_KEY_CACHE: dict = {}


def _generate_keypair() -> tuple[str, "rsa.RSAPublicKey", "rsa.RSAPrivateKey"]:
    if "private" not in _KEY_CACHE:
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        _KEY_CACHE["private"] = private
        _KEY_CACHE["pem"] = private.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("ascii")
    private = _KEY_CACHE["private"]
    return _KEY_CACHE["pem"], private.public_key(), private


@pytest.fixture
def kalshi_creds(monkeypatch):
    pem, public, _ = _generate_keypair()
    monkeypatch.setenv("KALSHI_API_KEY_ID", "test-key-id")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PEM", pem)
    rate_limit_module._kalshi_limiter = None
    yield public
    rate_limit_module._kalshi_limiter = None


def _verify(public_key, signature_b64: str, message: bytes) -> None:
    public_key.verify(
        base64.b64decode(signature_b64),
        message,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=hashes.SHA256.digest_size,
        ),
        hashes.SHA256(),
    )


def _patch_httpx(monkeypatch, handler) -> list[httpx.Request]:
    """Wire kalshi_rest's AsyncClient to a MockTransport.

    Returns a list that the wrapper appends each Request to so tests can
    inspect what was sent on the wire.
    """
    captured: list[httpx.Request] = []

    def transport_handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return handler(request)

    transport = httpx.MockTransport(transport_handler)

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return httpx.AsyncClient(*args, **kwargs)

    from app.services import kalshi_rest as kr

    fake = SimpleNamespace(
        AsyncClient=factory,
        HTTPStatusError=httpx.HTTPStatusError,
    )
    monkeypatch.setattr(kr, "httpx", fake)
    return captured


def test_request_signs_full_prefixed_path(monkeypatch, kalshi_creds):
    public = kalshi_creds
    captured = _patch_httpx(
        monkeypatch,
        lambda req: httpx.Response(200, json={"subaccount_number": 1}),
    )

    from app.services import kalshi_rest as kr

    asyncio.run(kr.create_subaccount())

    assert len(captured) == 1
    req = captured[0]
    ts = req.headers["KALSHI-ACCESS-TIMESTAMP"]
    sig = req.headers["KALSHI-ACCESS-SIGNATURE"]
    expected = f"{ts}POST/trade-api/v2/portfolio/subaccounts".encode("utf-8")
    _verify(public, sig, expected)


def test_request_strips_query_from_signature(monkeypatch, kalshi_creds):
    public = kalshi_creds
    captured = _patch_httpx(
        monkeypatch, lambda req: httpx.Response(200, json={"markets": []})
    )

    from app.services import kalshi_rest as kr

    asyncio.run(kr.list_btc_hourly_markets())

    assert len(captured) == 1
    req = captured[0]
    assert b"series_ticker=KXBTCD" in req.url.query
    ts = req.headers["KALSHI-ACCESS-TIMESTAMP"]
    sig = req.headers["KALSHI-ACCESS-SIGNATURE"]
    _verify(public, sig, f"{ts}GET/trade-api/v2/markets".encode("utf-8"))
    with pytest.raises(Exception):
        _verify(
            public,
            sig,
            f"{ts}GET/trade-api/v2/markets?{req.url.query.decode()}".encode(
                "utf-8"
            ),
        )


def test_request_acquires_rate_limiter(monkeypatch, kalshi_creds):
    _patch_httpx(
        monkeypatch, lambda req: httpx.Response(200, json={"markets": []})
    )

    from app.services import kalshi_rest as kr

    fake_limiter = SimpleNamespace(acquire=AsyncMock())
    monkeypatch.setattr(kr, "get_kalshi_limiter", lambda: fake_limiter)

    asyncio.run(kr.list_btc_hourly_markets())
    assert fake_limiter.acquire.await_count == 1


def test_missing_credentials_raises_KalshiMissingCredentials(monkeypatch):
    monkeypatch.delenv("KALSHI_API_KEY_ID", raising=False)
    monkeypatch.delenv("KALSHI_PRIVATE_KEY_PEM", raising=False)
    rate_limit_module._kalshi_limiter = None

    from app.services import kalshi_rest as kr

    with pytest.raises(kr.KalshiMissingCredentials):
        asyncio.run(kr.list_btc_hourly_markets())

    rate_limit_module._kalshi_limiter = None


def test_404_raises_KalshiNotFound(monkeypatch, kalshi_creds):
    _patch_httpx(
        monkeypatch,
        lambda req: httpx.Response(404, json={"error": "not found"}),
    )

    from app.services import kalshi_rest as kr

    with pytest.raises(kr.KalshiNotFound):
        asyncio.run(kr.get_orderbook("KXBTCD-XYZ"))


def test_429_raises_KalshiRateLimited(monkeypatch, kalshi_creds):
    _patch_httpx(
        monkeypatch,
        lambda req: httpx.Response(429, json={"error": "throttled"}),
    )

    from app.services import kalshi_rest as kr

    with pytest.raises(kr.KalshiRateLimited):
        asyncio.run(kr.list_btc_hourly_markets())


def _post_handler(captured_bodies: list[dict]):
    def handler(req: httpx.Request) -> httpx.Response:
        if req.content:
            captured_bodies.append(json.loads(req.content))
        else:
            captured_bodies.append({})
        return httpx.Response(200, json={"order": {"order_id": "abc"}})

    return handler


def test_place_order_serializes_count_fp_as_string(monkeypatch, kalshi_creds):
    bodies: list[dict] = []
    _patch_httpx(monkeypatch, _post_handler(bodies))

    from app.services import kalshi_rest as kr

    asyncio.run(
        kr.place_order(
            client_order_id="cid-1",
            ticker="KXBTCD-XYZ",
            side="yes",
            action="buy",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.500000"),
            time_in_force="immediate_or_cancel",
            subaccount_number=None,
        )
    )

    assert len(bodies) == 1
    assert bodies[0]["count_fp"] == "1.00"
    assert isinstance(bodies[0]["count_fp"], str)


def test_place_order_yes_side_uses_yes_price_dollars_only(
    monkeypatch, kalshi_creds
):
    bodies: list[dict] = []
    _patch_httpx(monkeypatch, _post_handler(bodies))

    from app.services import kalshi_rest as kr

    asyncio.run(
        kr.place_order(
            client_order_id="cid-1",
            ticker="KXBTCD-XYZ",
            side="yes",
            action="buy",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.42"),
            time_in_force="immediate_or_cancel",
            subaccount_number=None,
        )
    )

    body = bodies[0]
    assert body["yes_price_dollars"] == "0.42"
    assert "no_price_dollars" not in body


def test_place_order_no_side_uses_no_price_dollars_only(
    monkeypatch, kalshi_creds
):
    bodies: list[dict] = []
    _patch_httpx(monkeypatch, _post_handler(bodies))

    from app.services import kalshi_rest as kr

    asyncio.run(
        kr.place_order(
            client_order_id="cid-1",
            ticker="KXBTCD-XYZ",
            side="no",
            action="buy",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.42"),
            time_in_force="immediate_or_cancel",
            subaccount_number=None,
        )
    )

    body = bodies[0]
    assert body["no_price_dollars"] == "0.42"
    assert "yes_price_dollars" not in body


def test_place_order_includes_subaccount_when_provided(
    monkeypatch, kalshi_creds
):
    bodies: list[dict] = []
    _patch_httpx(monkeypatch, _post_handler(bodies))

    from app.services import kalshi_rest as kr

    asyncio.run(
        kr.place_order(
            client_order_id="cid-1",
            ticker="KXBTCD-XYZ",
            side="yes",
            action="buy",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.42"),
            time_in_force="immediate_or_cancel",
            subaccount_number=5,
        )
    )

    assert bodies[0]["subaccount"] == 5


def test_place_order_omits_subaccount_when_none(monkeypatch, kalshi_creds):
    bodies: list[dict] = []
    _patch_httpx(monkeypatch, _post_handler(bodies))

    from app.services import kalshi_rest as kr

    asyncio.run(
        kr.place_order(
            client_order_id="cid-1",
            ticker="KXBTCD-XYZ",
            side="yes",
            action="buy",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.42"),
            time_in_force="immediate_or_cancel",
            subaccount_number=None,
        )
    )

    assert "subaccount" not in bodies[0]


def test_get_orderbooks_chunks_into_100_per_request(monkeypatch, kalshi_creds):
    captured = _patch_httpx(
        monkeypatch, lambda req: httpx.Response(200, json={"orderbooks": []})
    )

    from app.services import kalshi_rest as kr

    tickers = [f"KXBTCD-{i}" for i in range(250)]
    asyncio.run(kr.get_orderbooks(tickers))

    assert len(captured) == 3
    chunk_sizes = [
        len([v for k, v in req.url.params.multi_items() if k == "tickers"])
        for req in captured
    ]
    assert chunk_sizes == [100, 100, 50]


def test_get_orderbooks_uses_repeated_tickers_query_param(
    monkeypatch, kalshi_creds
):
    captured = _patch_httpx(
        monkeypatch, lambda req: httpx.Response(200, json={"orderbooks": []})
    )

    from app.services import kalshi_rest as kr

    asyncio.run(kr.get_orderbooks(["A", "B", "C"]))
    raw_query = captured[0].url.query.decode()
    assert "tickers=A&tickers=B&tickers=C" in raw_query
    assert "tickers=A%2CB%2CC" not in raw_query


def test_get_orders_includes_subaccount_query_param(monkeypatch, kalshi_creds):
    captured = _patch_httpx(
        monkeypatch, lambda req: httpx.Response(200, json={"orders": []})
    )

    from app.services import kalshi_rest as kr

    asyncio.run(kr.get_orders(subaccount_number=5, status="resting"))
    params = dict(captured[0].url.params.multi_items())
    assert params["subaccount"] == "5"
    assert params["status"] == "resting"


def test_create_subaccount_parses_subaccount_number(monkeypatch, kalshi_creds):
    _patch_httpx(
        monkeypatch,
        lambda req: httpx.Response(
            200, json={"subaccount_number": 7, "name": "primary"}
        ),
    )

    from app.services import kalshi_rest as kr

    result = asyncio.run(kr.create_subaccount())
    assert result["subaccount_number"] == 7


def test_get_subaccount_balances_reads_subaccount_balances_wrapper_key(
    monkeypatch, kalshi_creds
):
    # Live demo Kalshi returns `{"subaccount_balances": [...]}`, not `{"balances": [...]}`.
    # An earlier draft read the shorter key and the bot's _update_balance silently
    # no-op'd every cycle, leaving kalshi_account.last_balance_dollars NULL forever.
    _patch_httpx(
        monkeypatch,
        lambda req: httpx.Response(
            200,
            json={
                "subaccount_balances": [
                    {
                        "subaccount_number": 0,
                        "balance": "100.0000",
                        "updated_ts": 1777265847,
                    },
                    {
                        "subaccount_number": 5,
                        "balance": "0.0000",
                        "updated_ts": 1777493463,
                    },
                ]
            },
        ),
    )

    from app.services import kalshi_rest as kr

    result = asyncio.run(kr.get_subaccount_balances())
    assert len(result) == 2
    assert result[1]["subaccount_number"] == 5
    assert result[1]["balance"] == "0.0000"


def test_no_module_level_network_or_key_load(monkeypatch):
    """Importing kalshi_rest must not open a client or load a private key."""
    network_calls: list = []
    key_loads: list = []

    original_async_client = httpx.AsyncClient

    def trap_async_client(*args, **kwargs):
        network_calls.append(("AsyncClient", args, kwargs))
        return original_async_client(*args, **kwargs)

    from app.services import kalshi_auth

    original_load = kalshi_auth.load_private_key

    def trap_load(pem):
        key_loads.append(pem)
        return original_load(pem)

    monkeypatch.setattr(httpx, "AsyncClient", trap_async_client)
    monkeypatch.setattr(kalshi_auth, "load_private_key", trap_load)

    sys.modules.pop("app.services.kalshi_rest", None)
    import app.services.kalshi_rest  # noqa: F401

    assert network_calls == []
    assert key_loads == []
