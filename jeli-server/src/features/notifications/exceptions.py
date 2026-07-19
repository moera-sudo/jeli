# Исключения фичи notifications — наследники глобальных из src.exceptions.
from src.exceptions import NotFoundError


class NotificationNotFoundError(NotFoundError):
    message = "Notification not found"
