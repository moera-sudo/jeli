# Базовые классы исключений приложения и регистрация обработчиков FastAPI.
# Сообщения (message), возвращаемые клиенту, и логи — на английском языке.
import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppException(Exception):
    # * Базовое исключение приложения.
    status_code: int = status.HTTP_400_BAD_REQUEST
    message: str = "An error occurred"

    def __init__(self, message: str | None = None, status_code: int | None = None) -> None:
        self.message = message or self.message
        self.status_code = status_code or self.status_code
        super().__init__(self.message)


class NotFoundError(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    message = "Resource not found"


class ConflictError(AppException):
    status_code = status.HTTP_409_CONFLICT
    message = "Conflicting data"


class PermissionDeniedError(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    message = "Permission denied"


class UnauthorizedError(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    message = "Authentication required"


def register_exception_handlers(app: FastAPI) -> None:
    # * Регистрирует обработчики AppException и непредвиденных исключений.

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        logger.warning(
            "Handled AppException: %s (status=%s, path=%s)",
            type(exc).__name__,
            exc.status_code,
            request.url.path,
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        # ! Неожиданное исключение — логируем со стектрейсом, клиенту отдаём общий текст
        logger.error("Unhandled exception on %s", request.url.path, exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )
