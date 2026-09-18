from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from splitshare.config import get_settings

settings = get_settings()
database_url = settings.database_url
# Supabase's dashboard supplies a standard ``postgresql://`` URI. The API uses
# SQLAlchemy's asyncpg driver, so accept that dashboard URI without requiring a
# separate, driver-specific copy in every environment file.
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
engine = create_async_engine(database_url, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide one database session per request."""

    async with async_session_factory() as session:
        yield session
