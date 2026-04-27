"""Kalshi PSS-SHA256 signing helpers.

The signature is the only thing standing between us and a 401 from Kalshi,
so the format is pinned hard: full prefixed path, query stripped, three
headers with the exact KALSHI-* names.
"""

import base64

import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.services.kalshi_auth import (
    build_auth_headers,
    load_private_key,
    sign_request,
)


@pytest.fixture(scope="module")
def keypair() -> tuple:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private, private.public_key()


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


def test_signature_verifies_with_public_key(keypair) -> None:
    private, public = keypair
    sig = sign_request(private, 1700000000000, "GET", "/trade-api/v2/markets")
    _verify(public, sig, b"1700000000000GET/trade-api/v2/markets")


def test_signature_strips_query_string(keypair) -> None:
    private, public = keypair
    sig = sign_request(
        private, 1700000000000, "GET", "/trade-api/v2/markets?foo=bar"
    )
    _verify(public, sig, b"1700000000000GET/trade-api/v2/markets")
    with pytest.raises(InvalidSignature):
        _verify(public, sig, b"1700000000000GET/trade-api/v2/markets?foo=bar")


def test_signature_includes_trade_api_v2_prefix(keypair) -> None:
    private, public = keypair
    sig = sign_request(private, 1700000000000, "GET", "/trade-api/v2/markets")
    with pytest.raises(InvalidSignature):
        _verify(public, sig, b"1700000000000GET/markets")


def _generate_pem() -> str:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")


def test_load_private_key_with_literal_newlines() -> None:
    pem = _generate_pem()
    escaped = pem.replace("\n", "\\n")
    assert "\\n" in escaped and "\n" not in escaped
    key = load_private_key(escaped)
    assert key.key_size == 2048


def test_load_private_key_with_real_newlines() -> None:
    pem = _generate_pem()
    key = load_private_key(pem)
    assert key.key_size == 2048


def test_build_auth_headers_returns_three_keys(keypair) -> None:
    private, _ = keypair
    headers = build_auth_headers(
        "key-id-123", private, "GET", "/trade-api/v2/markets", now_ms=1700000000000
    )
    assert set(headers.keys()) == {
        "KALSHI-ACCESS-KEY",
        "KALSHI-ACCESS-TIMESTAMP",
        "KALSHI-ACCESS-SIGNATURE",
    }
    assert headers["KALSHI-ACCESS-KEY"] == "key-id-123"
    assert headers["KALSHI-ACCESS-TIMESTAMP"] == "1700000000000"
    base64.b64decode(headers["KALSHI-ACCESS-SIGNATURE"])
