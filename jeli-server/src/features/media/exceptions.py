# Exceptions for the media feature — subclass the global ones from src.exceptions.
from src.exceptions import AppException, NotFoundError


class UnsupportedFileTypeError(AppException):
    message = "Unsupported file type"


class FileTooLargeError(AppException):
    message = "File exceeds maximum allowed size"


class MediaNotFoundError(NotFoundError):
    message = "Media file not found"
