# Business logic for the user feature: CRUD over the users table. Does not import anything from auth.
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
    # * Returns User or None, does not raise exceptions — the decision about 404 is made by the calling code.
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
    last_name: str,
    first_name: str,
    patronymic: str | None = None,
    graph_invite_code: str | None = None,
    profile_fields: OptionalProfileFields | None = None,
) -> User:
    # * Creates a User; profile_fields — an optional set of additional fields (used by register/with-info).
    # @param profile_fields: if None — all optional profile fields remain NULL
    user = User(
        email=email,
        hashed_password=hashed_password,
        last_name=last_name,
        first_name=first_name,
        patronymic=patronymic,
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
    # * Partial update: data — only the fields actually passed by the client.
    # @param data: dict from model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    logger.info("User profile updated: %s (fields=%s)", user.id, list(data.keys()))
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    # * The graph side (ownership transfer/cascading graph deletion) must already be handled BEFORE this call —
    # * see graph.service.handle_account_deletion, called from user.router before this function.
    user_id = user.id
    await db.delete(user)
    await db.commit()
    logger.info("User account deleted: %s", user_id)
