# Роутер фичи auth: регистрация (кратко/полно), логин, рефреш токенов.
import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.features.auth import service as auth_service
from src.features.auth.schemas import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterWithInfoRequest,
    TokenPair,
)
from src.features.user.schemas import UserMe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthResponse,
    summary="Регистрация нового пользователя (краткая форма)",
    description=(
        "Создаёт аккаунт по email, паролю и ФИО. Остальные поля профиля можно заполнить позже "
        "через /users/profile/edit или /users/create. Возвращает пару JWT-токенов (access и refresh) "
        "и базовую информацию о пользователе."
    ),
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Register request received")
    user, access_token, refresh_token = await auth_service.register(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/register/with-info",
    response_model=AuthResponse,
    summary="Регистрация нового пользователя с полным профилем",
    description=(
        "Создаёт аккаунт и сразу заполняет все дополнительные поля профиля (город/страна, дата и место "
        "рождения, национальность, ru/zhuz/tribe, аватар) за один запрос. Возвращает пару JWT-токенов "
        "и полную информацию о пользователе."
    ),
)
async def register_with_info(payload: RegisterWithInfoRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Register with-info request received")
    user, access_token, refresh_token = await auth_service.register_with_info(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Вход по email и паролю",
    description="Проверяет учётные данные и выдаёт новую пару JWT-токенов (access и refresh) вместе с информацией о пользователе.",
)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Login request received")
    user, access_token, refresh_token = await auth_service.login(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/refresh",
    response_model=TokenPair,
    summary="Обновление пары токенов по refresh-токену",
    description=(
        "Принимает действующий refresh-токен, проверяет его тип и срок действия, выдаёт новую пару "
        "access+refresh токенов (ротация). Старый refresh-токен нигде не отзывается (stateless-подход)."
    ),
)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    logger.info("Token refresh request received")
    access_token, refresh_token = await auth_service.refresh(db, payload.refresh_token)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)
