# Глобальные FastAPI-зависимости, используемые несколькими фичами одновременно.
import logging
import uuid

from fastapi import Depends, WebSocket
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import AsyncSessionLocal, get_db
from src.exceptions import UnauthorizedError
from src.features.auth.constants import TOKEN_TYPE_ACCESS
from src.features.auth.exceptions import InvalidTokenError
from src.features.auth.service import decode_token
from src.features.user import service as user_service
from src.features.user.models import User

logger = logging.getLogger(__name__)

# * auto_error=False — сами формируем 401 в едином формате {"detail": ...} через UnauthorizedError.
bearer_scheme = HTTPBearer(auto_error=False)


async def get_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # * Универсальная зависимость авторизации — переиспользуется во всех защищённых роутах проекта.
    # ! Кидает UnauthorizedError (401) на отсутствующий/невалидный/просроченный токен или юзера.
    if credentials is None:
        logger.info("Authorization failed: missing Bearer token")
        raise UnauthorizedError(message="Authentication required")

    try:
        user_id: uuid.UUID = decode_token(credentials.credentials, expected_type=TOKEN_TYPE_ACCESS)
    except InvalidTokenError as exc:
        logger.info("Authorization failed: invalid access token")
        raise UnauthorizedError(message=exc.message) from exc

    user = await user_service.get_by_id(db, user_id)
    if user is None:
        logger.info("Authorization failed: user %s not found", user_id)
        raise UnauthorizedError(message="User not found")

    return user


async def get_user_ws(websocket: WebSocket) -> User | None:
    # * WS-версия авторизации: токен в query-параметре ?token=..., НЕ заголовок Authorization
    # ! Никогда не бросает исключение — WS-роуты не проходят через HTTP exception handler из
    # ! src/exceptions.py, поэтому эндпоинт сам решает, что делать с None (закрыть соединение до accept()).
    token = websocket.query_params.get("token")
    if not token:
        logger.info("WS authorization failed: missing token query param")
        return None
    try:
        user_id: uuid.UUID = decode_token(token, expected_type=TOKEN_TYPE_ACCESS)
    except InvalidTokenError:
        logger.info("WS authorization failed: invalid access token")
        return None
    async with AsyncSessionLocal() as db:
        user = await user_service.get_by_id(db, user_id)
    if user is None:
        logger.info("WS authorization failed: user %s not found", user_id)
    return user
