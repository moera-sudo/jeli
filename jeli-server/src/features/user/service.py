# Бизнес-логика фичи user: CRUD над таблицей users. Не импортирует ничего из auth.
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import NotFoundError
from src.features.user.constants import DEFAULT_AVATAR_URL
from src.features.user.models import User
from src.features.user.schemas import OptionalProfileFields

logger = logging.getLogger(__name__)


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    # * Возвращает User или None, не кидает исключений — решение о 404 принимает вызывающий код.
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_id_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await get_by_id(db, user_id)
    if user is None:
        logger.info("User not found: %s", user_id)
        raise NotFoundError(message="User not found")
    return user


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    hashed_password: str,
    full_name: str,
    graph_invite_code: str | None = None,
    profile_fields: OptionalProfileFields | None = None,
) -> User:
    # * Создаёт User; profile_fields — опциональный набор доп.полей (используется register/with-info).
    # @param profile_fields: если None — все опциональные поля профиля останутся NULL
    user = User(
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        avatar_url=DEFAULT_AVATAR_URL,
        graph_invite_code=graph_invite_code,
        **(profile_fields.model_dump(exclude_unset=True) if profile_fields else {}),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("User created: %s", user.id)
    return user


async def update_profile(db: AsyncSession, user: User, data: dict) -> User:
    # * Частичное обновление: data — только реально переданные клиентом поля.
    # @param data: dict из model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    logger.info("User profile updated: %s (fields=%s)", user.id, list(data.keys()))
    return user
