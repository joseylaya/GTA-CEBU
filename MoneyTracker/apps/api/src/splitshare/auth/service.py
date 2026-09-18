import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from splitshare.config import get_settings
from splitshare.db.models.refresh_session import RefreshSession
from splitshare.db.models.user import User
from splitshare.schemas.auth import TokenResponse, UserResponse
from splitshare.security.passwords import hash_password, verify_password
from splitshare.security.tokens import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    parse_refresh_session_id,
    utc_now,
)


class AuthenticationError(Exception):
    pass


class DuplicateEmailError(Exception):
    pass


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, name=user.name)


async def register_user(
    session: AsyncSession, *, email: str, name: str, password: str
) -> TokenResponse:
    existing = await session.scalar(select(User.id).where(User.email_normalized == email))
    if existing is not None:
        raise DuplicateEmailError

    now = utc_now()
    user = User(
        email=email,
        email_normalized=email,
        name=name,
        password_hash=hash_password(password),
        password_changed_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    await session.flush()
    response = await _create_tokens(session, user=user, now=now)
    await session.commit()
    return response


async def login_user(session: AsyncSession, *, email: str, password: str) -> TokenResponse:
    user = await session.scalar(
        select(User).where(
            User.email_normalized == email,
            User.status == "active",
            User.deleted_at.is_(None),
        )
    )
    if user is None or not verify_password(password, user.password_hash):
        raise AuthenticationError

    now = utc_now()
    user.last_login_at = now
    user.updated_at = now
    response = await _create_tokens(session, user=user, now=now)
    await session.commit()
    return response


async def refresh_authentication(session: AsyncSession, *, refresh_token: str) -> TokenResponse:
    refresh_session = await _active_refresh_session(session, refresh_token)
    if refresh_session is None:
        raise AuthenticationError

    user = await session.get(User, refresh_session.user_id)
    if user is None or user.status != "active" or user.deleted_at is not None:
        raise AuthenticationError

    now = utc_now()
    refresh_session.revoked_at = now
    refresh_session.last_used_at = now
    refresh_session.updated_at = now
    response = await _create_tokens(session, user=user, now=now)
    await session.commit()
    return response


async def revoke_refresh_session(session: AsyncSession, *, refresh_token: str) -> None:
    refresh_session = await _active_refresh_session(session, refresh_token)
    if refresh_session is None:
        raise AuthenticationError
    now = utc_now()
    refresh_session.revoked_at = now
    refresh_session.updated_at = now
    await session.commit()


async def _create_tokens(session: AsyncSession, *, user: User, now) -> TokenResponse:
    refresh_session = RefreshSession(
        user_id=user.id,
        token_hash="pending",
        issued_at=now,
        expires_at=now + timedelta(days=get_settings().refresh_token_ttl_days),
        created_at=now,
        updated_at=now,
    )
    session.add(refresh_session)
    await session.flush()
    refresh_token, refresh_session.token_hash = create_refresh_token(refresh_session.id)
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        user=_user_response(user),
    )


async def _active_refresh_session(session: AsyncSession, token: str) -> RefreshSession | None:
    session_id = parse_refresh_session_id(token)
    if session_id is None:
        return None
    refresh_session = await session.get(RefreshSession, session_id)
    if (
        refresh_session is None
        or refresh_session.revoked_at is not None
        or refresh_session.expires_at <= utc_now()
        or not secrets.compare_digest(refresh_session.token_hash, hash_refresh_token(token))
    ):
        return None
    return refresh_session
