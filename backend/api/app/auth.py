import os

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

load_dotenv()

AUTH_SERVER_URL = os.environ.get("AUTH_SERVER_URL", "http://localhost:3000")
JWKS_URL = f"{AUTH_SERVER_URL}/api/auth/jwks"
SKIP_AUTH = os.environ.get("SKIP_AUTH", "").lower() in ("1", "true")

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
            token, signing_key.key, algorithms=["RS256", "ES256", "EdDSA"]
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
