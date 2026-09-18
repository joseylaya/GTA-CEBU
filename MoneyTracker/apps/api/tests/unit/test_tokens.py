import uuid

import jwt
import pytest

from splitshare.config import get_settings
from splitshare.security.supabase_jwt import (
    InvalidSupabaseTokenError,
    verify_supabase_access_token,
)


def test_supabase_token_returns_only_verified_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-that-is-at-least-32-bytes")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", "https://project.supabase.co/auth/v1")
    get_settings.cache_clear()
    user_id = uuid.uuid4()
    token = jwt.encode(
        {
            "sub": str(user_id),
            "email": "MEMBER@example.test",
            "aud": "authenticated",
            "iss": "https://project.supabase.co/auth/v1",
            "user_metadata": {"name": "Test Member"},
        },
        "test-secret-that-is-at-least-32-bytes",
        algorithm="HS256",
    )

    identity = verify_supabase_access_token(token)

    assert identity.user_id == user_id
    assert identity.email == "member@example.test"
    assert identity.name == "Test Member"


def test_supabase_token_rejects_an_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-that-is-at-least-32-bytes")
    get_settings.cache_clear()
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "email": "member@example.test", "aud": "authenticated"},
        "different-secret-that-is-at-least-32-bytes",
        algorithm="HS256",
    )

    with pytest.raises(InvalidSupabaseTokenError):
        verify_supabase_access_token(token)
