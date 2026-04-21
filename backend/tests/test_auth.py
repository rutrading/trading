"""Tests for app.auth.verify_token.

Covers the JWT decode path including the new verify_aud=False option (so
tokens with the wrong audience are intentionally accepted), expired tokens,
unknown signing keys, missing/empty tokens, and the SKIP_AUTH bypass.

Strategy: generate an in-test RSA keypair, monkey-patch
app.auth.jwks_client.get_signing_key_from_jwt to return the public key,
then sign tokens with the matching private key.
"""

import os

os.environ["SKIP_AUTH"] = "false"

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app import auth as auth_module


def _gen_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def _sign(payload: dict, private_key) -> str:
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return jwt.encode(payload, pem, algorithm="RS256")


@pytest.fixture
def keypair_and_patch(monkeypatch):
    """Generate a keypair, install the public key as the JWKS signing key."""
    private_key, public_key = _gen_keypair()

    class FakeKey:
        key = public_key

    monkeypatch.setattr(
        auth_module.jwks_client,
        "get_signing_key_from_jwt",
        lambda token: FakeKey(),
    )
    # Also force SKIP_AUTH to False at module level (other tests may have
    # set it differently if they monkeypatched).
    monkeypatch.setattr(auth_module, "SKIP_AUTH", False)
    return private_key, public_key


class TestVerifyToken:
    def test_valid_token_returns_payload(self, keypair_and_patch):
        private_key, _ = keypair_and_patch
        token = _sign(
            {
                "sub": "user-123",
                "email": "test@example.com",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            private_key,
        )
        payload = auth_module.verify_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["email"] == "test@example.com"

    def test_expired_token_returns_none(self, keypair_and_patch):
        private_key, _ = keypair_and_patch
        token = _sign(
            {
                "sub": "user-123",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            },
            private_key,
        )
        assert auth_module.verify_token(token) is None

    def test_token_signed_by_unknown_key_returns_none(self, keypair_and_patch, monkeypatch):
        # Sign with a DIFFERENT key — JWKS will return our patched public key,
        # the signature won't match, decode raises InvalidTokenError → None
        bogus_private, _ = _gen_keypair()
        token = _sign(
            {"sub": "user-123", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            bogus_private,
        )
        assert auth_module.verify_token(token) is None

    def test_token_with_wrong_audience_is_accepted(self, keypair_and_patch):
        """The verify_aud=False flag was added on feat/order-ui to make Better
        Auth tokens decode without strict audience matching. This test locks
        that intent in: a token with aud='something-wrong' must NOT be
        rejected. Removing the flag would flip this assertion to None and
        break login.
        """
        private_key, _ = keypair_and_patch
        token = _sign(
            {
                "sub": "user-123",
                "aud": "something-completely-wrong",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            private_key,
        )
        payload = auth_module.verify_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["aud"] == "something-completely-wrong"

    def test_missing_token_returns_none(self, keypair_and_patch):
        assert auth_module.verify_token(None) is None

    def test_empty_string_token_returns_none(self, keypair_and_patch):
        assert auth_module.verify_token("") is None

    def test_skip_auth_short_circuits_to_dev_user(self, monkeypatch):
        monkeypatch.setattr(auth_module, "SKIP_AUTH", True)
        # Even with garbage input, SKIP_AUTH must return DEV_USER
        assert auth_module.verify_token("any garbage") == auth_module.DEV_USER
        assert auth_module.verify_token(None) == auth_module.DEV_USER

    def test_garbled_token_returns_none(self, keypair_and_patch):
        # Entirely malformed — not even close to a JWT shape
        assert auth_module.verify_token("not.a.jwt") is None
