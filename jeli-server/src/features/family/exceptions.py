# Исключения фичи family — наследники глобальных из src.exceptions.
from src.exceptions import NotFoundError


class FamilyNotFoundError(NotFoundError):
    message = "Family history not found"
