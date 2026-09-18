from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "local"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://splitshare:splitshare@localhost:5432/splitshare"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8080"]
    # Supabase owns identities and issues the bearer JWT consumed by this API.
    # DATABASE_URL should be the Supabase Postgres connection string (prefer the
    # pooler URL in deployed environments).
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_issuer: str | None = None
    firebase_service_account_path: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
