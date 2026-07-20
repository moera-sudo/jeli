# Бизнес-логика фичи auth: хэширование паролей, выпуск/проверка JWT, регистрация, логин, рефреш.
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import get_settings
from src.features.auth.constants import (
    CLAIM_EXP,
    CLAIM_IAT,
    CLAIM_SUB,
    CLAIM_TYPE,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
)
from src.features.auth.exceptions import InvalidCredentialsError, InvalidTokenError, UserAlreadyExistsError
from src.features.auth.schemas import LoginRequest, RegisterRequest, RegisterWithInfoRequest
from src.features.graph import service as graph_service
from src.features.user import service as user_service
from src.features.user.models import User
from src.features.user.schemas import OptionalProfileFields

logger = logging.getLogger(__name__)
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _create_token(user_id: uuid.UUID, token_type: str, expires_delta: timedelta) -> str:
    # * Общий билдер JWT для access и refresh — отличаются только claim "type" и TTL.
    now = datetime.now(timezone.utc)
    payload = {
        CLAIM_SUB: str(user_id),
        CLAIM_TYPE: token_type,
        CLAIM_IAT: now,
        CLAIM_EXP: now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, TOKEN_TYPE_ACCESS, timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(user_id: uuid.UUID) -> str:
    return _create_token(user_id, TOKEN_TYPE_REFRESH, timedelta(days=settings.refresh_token_expire_days))


def create_token_pair(user_id: uuid.UUID) -> tuple[str, str]:
    return create_access_token(user_id), create_refresh_token(user_id)


def decode_token(token: str, expected_type: str) -> uuid.UUID:
    # * Декодирует и валидирует JWT: подпись, срок действия (проверяет pyjwt), claim "type".
    # ! Кидает InvalidTokenError на любую ошибку (просрочен/подпись неверна/type не совпал/sub не UUID)
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        logger.info("Token expired")
        raise InvalidTokenError()
    except jwt.InvalidTokenError:
        logger.warning("Token decode failed: invalid token")
        raise InvalidTokenError()

    if payload.get(CLAIM_TYPE) != expected_type:
        logger.warning("Token type mismatch: expected %s", expected_type)
        raise InvalidTokenError()

    try:
        return uuid.UUID(payload[CLAIM_SUB])
    except (KeyError, ValueError, TypeError):
        logger.warning("Token subject claim is missing or malformed")
        raise InvalidTokenError()


async def _try_link_invite_code(db: AsyncSession, user: User, graph_invite_code: str | None) -> None:
    # * Best-effort: если передан код приглашения — пробуем привязать существующий узел.
    # * Дерево при регистрации больше НЕ создаётся автоматически (см. POST /graph/create, /graph/join) —
    # * если код невалиден/уже занят, просто ничего не происходит, без ошибки.
    if graph_invite_code:
        await graph_service.link_existing_person_by_invite_code(db, user, graph_invite_code)


async def register(db: AsyncSession, data: RegisterRequest) -> tuple[User, str, str]:
    existing = await user_service.get_by_email(db, data.email)
    if existing is not None:
        logger.info("Registration conflict: email already exists")
        raise UserAlreadyExistsError()

    user = await user_service.create_user(
        db,
        email=data.email,
        hashed_password=hash_password(data.password),
        last_name=data.last_name,
        first_name=data.first_name,
        patronymic=data.patronymic,
        graph_invite_code=data.graph_invite_code,
    )
    await _try_link_invite_code(db, user, data.graph_invite_code)
    access_token, refresh_token = create_token_pair(user.id)
    logger.info("User registered: %s", user.id)
    return user, access_token, refresh_token


async def register_with_info(db: AsyncSession, data: RegisterWithInfoRequest) -> tuple[User, str, str]:
    existing = await user_service.get_by_email(db, data.email)
    if existing is not None:
        logger.info("Registration conflict: email already exists")
        raise UserAlreadyExistsError()

    profile_fields = OptionalProfileFields(**data.model_dump(include=set(OptionalProfileFields.model_fields)))
    user = await user_service.create_user(
        db,
        email=data.email,
        hashed_password=hash_password(data.password),
        last_name=data.last_name,
        first_name=data.first_name,
        patronymic=data.patronymic,
        graph_invite_code=data.graph_invite_code,
        profile_fields=profile_fields,
    )
    if data.avatar_url:
        user.avatar_url = data.avatar_url
        await db.commit()
        await db.refresh(user)

    await _try_link_invite_code(db, user, data.graph_invite_code)
    access_token, refresh_token = create_token_pair(user.id)
    logger.info("User registered with full profile info: %s", user.id)
    return user, access_token, refresh_token


async def login(db: AsyncSession, data: LoginRequest) -> tuple[User, str, str]:
    user = await user_service.get_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.hashed_password):
        logger.info("Login failed: invalid credentials")
        raise InvalidCredentialsError()

    access_token, refresh_token = create_token_pair(user.id)
    logger.info("User logged in: %s", user.id)
    return user, access_token, refresh_token


async def refresh(db: AsyncSession, refresh_token: str) -> tuple[str, str]:
    # * Ротация refresh-токена: старый не отзывается (stateless, БД не хранит токены — принятый риск).
    user_id = decode_token(refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    user = await user_service.get_by_id(db, user_id)
    if user is None:
        logger.info("Refresh failed: user not found for token subject")
        raise InvalidTokenError()

    new_access, new_refresh = create_token_pair(user.id)
    logger.info("Token refreshed for user: %s", user.id)
    return new_access, new_refresh
