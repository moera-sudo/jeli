# Exceptions for the messenger feature — subclasses of the global ones from src.exceptions.
from src.exceptions import ConflictError, NotFoundError, PermissionDeniedError


class ChatNotFoundError(NotFoundError):
    message = "Chat not found"


class NotChatParticipantError(PermissionDeniedError):
    message = "You are not a participant of this chat"


class TargetNotLinkedError(ConflictError):
    message = "This person is not linked to a registered account"


class CannotChatWithSelfError(ConflictError):
    message = "You cannot start a chat with yourself"
