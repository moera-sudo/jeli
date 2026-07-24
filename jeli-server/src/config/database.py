# Async SQLAlchemy engine, session factory, and base class for ORM models.
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.config.settings import get_settings

settings = get_settings()

# * pool_size/max_overflow raised from the default 5/10 — recompute fixes now schedule matching
# * recalculation for BOTH sides on create_person/insert_person_between/create_graph/join_graph,
# * which roughly doubles the number of background BackgroundTasks DB sessions during intensive tree building.
engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    # * Base class for all application ORM models, used by Alembic for autogenerate.
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    # * FastAPI dependency that provides an async DB session for the duration of the request.
    async with AsyncSessionLocal() as session:
        yield session
