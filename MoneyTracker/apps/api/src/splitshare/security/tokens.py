import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from jwt import InvalidTokenError

from splitshare.config import get_settings


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = utc_now()
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def parse_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        return None


def create_refresh_token(session_id: uuid.UUID) -> tuple[str, str]:
    secret = secrets.token_urlsafe(48)
    token = f"{session_id}.{secret}"
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_refresh_session_id(token: str) -> uuid.UUID | None:
    session_id, separator, secret = token.partition(".")
    if not separator or not secret:
        return None
    try:
        return uuid.UUID(session_id)
    except ValueError:
        return None
