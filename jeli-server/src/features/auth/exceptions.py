# Исключения фичи auth — наследники глобальных из src.exceptions.
from src.exceptions import ConflictError, UnauthorizedError


class UserAlreadyExistsError(ConflictError):
    message = "User with this email already exists"


class InvalidCredentialsError(UnauthorizedError):
    message = "Invalid email or password"


class InvalidTokenError(UnauthorizedError):
    message = "Invalid or expired token"
