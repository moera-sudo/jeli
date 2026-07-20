# Бизнес-логика фичи family: одна markdown-строка + заголовок истории семьи на владельца графа.
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


async def get_my_family(db: AsyncSession, owner_user_id: uuid.UUID) -> Family | None:
    result = await db.execute(select(Family).where(Family.owner_user_id == owner_user_id))
    return result.scalar_one_or_none()


async def get_family_or_404(db: AsyncSession, owner_user_id: uuid.UUID) -> Family:
    family = await get_my_family(db, owner_user_id)
    if family is None:
        raise FamilyNotFoundError()
    return family


async def upsert_family(db: AsyncSession, current_user: User, data: FamilyUpsertRequest) -> Family:
    # * can_edit_graph(owner=current_user.id) — True для самого владельца и для его коллабораторов.
    await graph_service.can_edit_graph(db, current_user.id, current_user.id)

    family = await get_my_family(db, current_user.id)
    if family is None:
        family = Family(owner_user_id=current_user.id, title=data.title, content=data.content)
        db.add(family)
        logger.info("Family history created for owner %s", current_user.id)
    else:
        family.title = data.title
        family.content = data.content
        logger.info("Family history updated for owner %s", current_user.id)

    await db.commit()
    await db.refresh(family)
    return family
