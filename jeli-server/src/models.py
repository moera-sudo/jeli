# Агрегатор ORM-моделей всех фич — импортируется Alembic (alembic/env.py) для autogenerate.
# Base определён в src.config.database; каждая фича регистрирует свои модели
# через импорт ниже, чтобы попасть в Base.metadata.
from src.config.database import Base  # noqa: F401
from src.features.user.models import User  # noqa: F401
from src.features.graph.models import (  # noqa: F401
    GraphCollaborator,
    GraphLink,
    MatchCandidate,
    Person,
    PersonEditLog,
    Relationship,
    RelationshipProposal,
)
from src.features.notifications.models import Notification  # noqa: F401
from src.features.media.models import Media  # noqa: F401
from src.features.messenger.models import Chat, Message  # noqa: F401
from src.features.family.models import Family  # noqa: F401
