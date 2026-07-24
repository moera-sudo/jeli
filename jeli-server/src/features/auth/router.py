# Router for the auth feature: registration (short/full), login, token refresh.
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
    summary="Register a new user (short form)",
    description=(
        "Creates an account using email, password, last name, and first name (patronymic is optional). The rest of the "
        "profile fields can be filled in later via /users/profile/edit or /users/create. Returns a pair of JWT tokens "
        "(access and refresh) and basic information about the user."
    ),
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Register request received")
    user, access_token, refresh_token = await auth_service.register(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/register/with-info",
    response_model=AuthResponse,
    summary="Register a new user with a full profile",
    description=(
        "Creates an account and immediately fills in all additional profile fields (city/country, date and place "
        "of birth, nationality, ru/zhuz/tribe, avatar) in a single request. Returns a pair of JWT tokens "
        "and full information about the user."
    ),
)
async def register_with_info(payload: RegisterWithInfoRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Register with-info request received")
    user, access_token, refresh_token = await auth_service.register_with_info(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
    description="Verifies the credentials and issues a new pair of JWT tokens (access and refresh) along with information about the user.",
)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    logger.info("Login request received")
    user, access_token, refresh_token = await auth_service.login(db, payload)
    return AuthResponse(access_token=access_token, refresh_token=refresh_token, user=UserMe.model_validate(user))


@router.post(
    "/refresh",
    response_model=TokenPair,
    summary="Refresh the token pair using a refresh token",
    description=(
        "Accepts a valid refresh token, checks its type and expiration, and issues a new pair of "
        "access+refresh tokens (rotation). The old refresh token is not revoked anywhere (stateless approach)."
    ),
)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    logger.info("Token refresh request received")
    access_token, refresh_token = await auth_service.refresh(db, payload.refresh_token)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)
