# Бизнес-логика фичи family: одна общая markdown-история на ГРАФ (ключ — владелец графа).
# Любой участник графа (владелец, коллаборатор или привязанный к узлу член семьи) правит
# одну и ту же запись, и итоговая версия видна всем членам семьи.
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
    # * Общая история привязана к владельцу графа. Определяем граф текущего пользователя
    # * по его узлу: owner_user_id узла = владелец графа. Если узла ещё нет — историей
    # * владеет он сам (это его будущий собственный граф).
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
    # ** История общая на весь граф — пишем под ВЛАДЕЛЬЦА графа, а не под автора правки.
    # ** Любой член семьи (в т.ч. рядовой участник, не только владелец/коллаборатор) правит
    # ** одну и ту же запись, итог виден всем. Право на запись = принадлежность графу:
    # ** owner резолвится по узлу самого пользователя, поэтому он всегда участник своего графа.
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
