# Global FastAPI dependencies shared across several features at once.
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

# * auto_error=False — we build the 401 ourselves in a unified {"detail": ...} format via UnauthorizedError.
bearer_scheme = HTTPBearer(auto_error=False)


async def get_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # * Universal authorization dependency — reused across all protected routes in the project.
    # ! Raises UnauthorizedError (401) for a missing/invalid/expired token or a missing user.
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
    # * WS version of authorization: token in the ?token=... query parameter, NOT the Authorization header
    # ! Never raises an exception — WS routes don't go through the HTTP exception handler in
    # ! src/exceptions.py, so the endpoint itself decides what to do with None (close the connection before accept()).
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
