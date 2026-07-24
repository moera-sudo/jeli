# Exceptions for the notifications feature — subclasses of the global ones from src.exceptions.
from src.exceptions import NotFoundError


class NotificationNotFoundError(NotFoundError):
    message = "Notification not found"
