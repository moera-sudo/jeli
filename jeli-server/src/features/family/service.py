# Business logic for the family feature: one shared markdown history per GRAPH (keyed by graph owner).
# Any graph participant (owner, collaborator, or a family member linked to a node) edits the
# same record, and the resulting version is visible to all family members.
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.family.exceptions import FamilyNotFoundError
from src.features.family.models import Family
from src.features.family.schemas import FamilyUpsertRequest
from src.features.graph import service as graph_service
from src.features.user.models import User

logger = logging.getLogger(__name__)


async def resolve_graph_owner_id(db: AsyncSession, user: User) -> uuid.UUID:
    # * The shared history is keyed to the graph owner. We determine the current user's graph
    # * via their node: the node's owner_user_id is the graph owner. If there's no node yet, the
    # * history is owned by the user themselves (this will be their own future graph).
    person = await graph_service.get_linked_person(db, user.id)
    return person.owner_user_id if person is not None else user.id


async def get_family(db: AsyncSession, owner_user_id: uuid.UUID) -> Family | None:
    result = await db.execute(select(Family).where(Family.owner_user_id == owner_user_id))
    return result.scalar_one_or_none()


async def get_family_or_404(db: AsyncSession, owner_user_id: uuid.UUID) -> Family:
    family = await get_family(db, owner_user_id)
    if family is None:
        raise FamilyNotFoundError()
    return family


async def upsert_family(db: AsyncSession, current_user: User, data: FamilyUpsertRequest) -> Family:
    # ** The history is shared across the whole graph — we write under the graph OWNER, not the editor.
    # ** Any family member (including a regular participant, not just owner/collaborator) edits the
    # ** same record, and the result is visible to everyone. The right to write = graph membership:
    # ** owner is resolved via the user's own node, so they are always a member of their own graph.
    owner_user_id = await resolve_graph_owner_id(db, current_user)

    family = await get_family(db, owner_user_id)
    if family is None:
        family = Family(owner_user_id=owner_user_id, title=data.title, content=data.content)
        db.add(family)
        logger.info("Family history created for graph owner %s by user %s", owner_user_id, current_user.id)
    else:
        family.title = data.title
        family.content = data.content
        logger.info("Family history updated for graph owner %s by user %s", owner_user_id, current_user.id)

    await db.commit()
    await db.refresh(family)
    return family
