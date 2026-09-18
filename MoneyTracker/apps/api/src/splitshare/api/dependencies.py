from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.api.errors import api_error
from splitshare.config import get_settings
from splitshare.db.models.user import User
from splitshare.db.session import get_db_session
from splitshare.security.supabase_jwt import (
    InvalidSupabaseTokenError,
    fetch_supabase_identity,
    verify_supabase_access_token,
)

bearer_scheme = HTTPBearer(auto_error=False)
DatabaseSession = Annotated[AsyncSession, Depends(get_db_session)]


async def get_current_user(
    session: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise api_error(401, "AUTHENTICATION_REQUIRED", "Authentication is required.")
    try:
        settings = get_settings()
        identity = (
            verify_supabase_access_token(credentials.credentials)
            if settings.supabase_jwt_secret
            else await fetch_supabase_identity(credentials.credentials)
        )
    except InvalidSupabaseTokenError:
        raise api_error(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.")
    user = await session.get(User, identity.user_id)
    if user is None:
        # Supabase Auth is the identity source. The local users table is an
        # application profile, created on the first authenticated request.
        user = User(
            id=identity.user_id,
            email=identity.email,
            email_normalized=identity.email,
            name=identity.name,
        )
        session.add(user)
        await session.commit()
    if user is None or user.status != "active" or user.deleted_at is not None:
        raise api_error(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
