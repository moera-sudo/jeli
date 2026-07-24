# Aggregator of ORM models from all features — imported by Alembic (alembic/env.py) for autogenerate.
# Base is defined in src.config.database; each feature registers its models
# via the import below so they end up in Base.metadata.
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
