"""Kalshi request signing.

Kalshi requires every authenticated REST call to carry three headers:
KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP, KALSHI-ACCESS-SIGNATURE. The
signature is RSA-PSS-SHA256 over `{timestamp_ms}{METHOD}{full_path}` where
`full_path` is the path including the `/trade-api/v2` prefix and with the
query string stripped.
"""

import base64
import time

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey


def load_private_key(pem: str) -> RSAPrivateKey:
    """Parse a PEM string into an RSA private key.

    Tolerates literal '\\n' escape sequences so the PEM can come from a
    single-line .env value.
    """
    if "\\n" in pem and "\n" not in pem:
        pem = pem.replace("\\n", "\n")
    key = serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
    if not isinstance(key, RSAPrivateKey):
        raise ValueError("Kalshi private key must be RSA")
    return key


def sign_request(
    private_key: RSAPrivateKey,
    timestamp_ms: int,
    method: str,
    full_path: str,
) -> str:
    """Return base64 PSS-SHA256 signature over `{ts}{METHOD}{full_path}`.

    `full_path` must include the `/trade-api/v2` prefix. Any query string is
    stripped here so callers can pass the raw URL path without worrying.
    """
    path_no_query = full_path.split("?", 1)[0]
    message = f"{timestamp_ms}{method.upper()}{path_no_query}".encode("utf-8")
    signature = private_key.sign(
        message,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=hashes.SHA256.digest_size,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("ascii")


def build_auth_headers(
    api_key_id: str,
    private_key: RSAPrivateKey,
    method: str,
    full_path: str,
    now_ms: int | None = None,
) -> dict[str, str]:
    """Return the three KALSHI-* headers for a request."""
    ts = now_ms if now_ms is not None else int(time.time() * 1000)
    return {
        "KALSHI-ACCESS-KEY": api_key_id,
        "KALSHI-ACCESS-TIMESTAMP": str(ts),
        "KALSHI-ACCESS-SIGNATURE": sign_request(
            private_key, ts, method, full_path
        ),
    }
