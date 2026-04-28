"""Authentication helpers.

This module is responsible for identity only:
- decode/verify JWT
- return current authenticated user payload

Account-level authorization lives in dependencies.py.
"""

import os
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

AUTH_SERVER_URL = os.environ.get("AUTH_SERVER_URL", "http://localhost:3000")
JWKS_URL = f"{AUTH_SERVER_URL}/api/auth/jwks"
SKIP_AUTH = os.environ.get("SKIP_AUTH", "").lower() in ("1", "true")

# Better-auth's JWT plugin (see web/node_modules/better-auth/dist/plugins/jwt/sign.mjs)
# sets both `aud` and `iss` to the better-auth baseURL by default, which matches
# AUTH_SERVER_URL in our config. Allow operators to override via env if they
# configure `jwt.audience` / `jwt.issuer` differently.
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", AUTH_SERVER_URL)
JWT_ISSUER = os.environ.get("JWT_ISSUER", AUTH_SERVER_URL)

jwks_client = PyJWKClient(JWKS_URL)
bearer_scheme = HTTPBearer(auto_error=not SKIP_AUTH)

DEV_USER = {
    "sub": "dev",
    "name": "Dev User",
    "email": "dev@localhost",
}


def verify_token(token: str | None) -> dict | None:
    """Validate a raw JWT string and return the decoded payload.
    Returns None if the token is missing or invalid.
    Used by the WS endpoint where Depends() isn't available."""
    if SKIP_AUTH:
        return DEV_USER

    if not token:
        return None

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256", "EdDSA"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if SKIP_AUTH:
        return DEV_USER

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    return payload
