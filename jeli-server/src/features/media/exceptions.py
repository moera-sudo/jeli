# Исключения фичи media — наследники глобальных из src.exceptions.
from src.exceptions import AppException, NotFoundError


class UnsupportedFileTypeError(AppException):
    message = "Unsupported file type"


class FileTooLargeError(AppException):
    message = "File exceeds maximum allowed size"


class MediaNotFoundError(NotFoundError):
    message = "Media file not found"
