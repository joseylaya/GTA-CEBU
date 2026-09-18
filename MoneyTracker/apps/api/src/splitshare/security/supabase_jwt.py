from dataclasses import dataclass
from uuid import UUID

import httpx
import jwt
from jwt import InvalidTokenError

from splitshare.config import get_settings


@dataclass(frozen=True)
class SupabaseIdentity:
    user_id: UUID
    email: str
    name: str


class InvalidSupabaseTokenError(Exception):
    pass


def verify_supabase_access_token(token: str) -> SupabaseIdentity:
    """Verify a Supabase Auth HS256 access token and extract a safe identity."""

    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise InvalidSupabaseTokenError
    options = {"verify_aud": bool(settings.supabase_jwt_audience)}
    kwargs: dict[str, object] = {
        "algorithms": ["HS256"],
        "audience": settings.supabase_jwt_audience,
        "options": options,
    }
    if settings.supabase_jwt_issuer:
        kwargs["issuer"] = settings.supabase_jwt_issuer
    try:
        claims = jwt.decode(token, settings.supabase_jwt_secret, **kwargs)
        user_id = UUID(str(claims["sub"]))
        email = str(claims["email"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as error:
        raise InvalidSupabaseTokenError from error
    metadata = claims.get("user_metadata") or {}
    name = str(metadata.get("name") or metadata.get("full_name") or email.split("@", 1)[0])
    return SupabaseIdentity(user_id=user_id, email=email.lower(), name=name[:150])


async def fetch_supabase_identity(token: str) -> SupabaseIdentity:
    """Ask Supabase Auth to validate a token when no private JWT secret is held.

    This is appropriate for staging and avoids copying a Supabase JWT secret
    into the API environment. Production can use the verified-JWT path above.
    """

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise InvalidSupabaseTokenError
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {token}",
                },
            )
        response.raise_for_status()
        profile = response.json()
        user_id = UUID(str(profile["id"]))
        email = str(profile["email"])
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise InvalidSupabaseTokenError from error
    metadata = profile.get("user_metadata") or {}
    name = str(metadata.get("name") or metadata.get("full_name") or email.split("@", 1)[0])
    return SupabaseIdentity(user_id=user_id, email=email.lower(), name=name[:150])
