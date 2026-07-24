# Exceptions for the family feature — subclass the global ones from src.exceptions.
from src.exceptions import NotFoundError


class FamilyNotFoundError(NotFoundError):
    message = "Family history not found"
