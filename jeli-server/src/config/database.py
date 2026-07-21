# Асинхронный движок SQLAlchemy, фабрика сессий и базовый класс ORM-моделей.
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.config.settings import get_settings

settings = get_settings()

# * pool_size/max_overflow подняты с дефолтных 5/10 — recompute-фиксы теперь планируют пересчёт
# * мэтчинга для ОБЕИХ сторон на create_person/insert_person_between/create_graph/join_graph, что
# * примерно удваивает число фоновых BackgroundTasks-сессий БД при интенсивном построении дерева.
engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    # * Базовый класс для всех ORM-моделей приложения, используется Alembic для autogenerate.
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    # * FastAPI-зависимость, отдающая асинхронную сессию БД на время запроса.
    async with AsyncSessionLocal() as session:
        yield session
