from fastapi.testclient import TestClient

from splitshare.main import app


def test_password_authentication_routes_are_not_exposed() -> None:
    """Supabase Auth, not this API, accepts registration and passwords."""

    response = TestClient(app).post(
        "/api/v1/auth/register",
        json={"email": "member@example.test", "name": "Member", "password": "password"},
    )

    assert response.status_code == 404


def test_me_requires_a_valid_supabase_access_token() -> None:
    response = TestClient(app).get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
