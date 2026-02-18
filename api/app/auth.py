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


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if SKIP_AUTH:
        return DEV_USER

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    token = credentials.credentials
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token, signing_key.key, algorithms=["RS256", "ES256", "EdDSA"]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
