# Business logic for the search feature: searching user profiles by full name + batch enrichment with person_id.
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.graph.models import Person
from src.features.user.models import User


def _escape_like(value: str) -> str:
    # * Escapes LIKE/ILIKE special characters so user input can't alter the pattern's semantics.
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_users(db: AsyncSession, query: str, exclude_user_id: uuid.UUID, limit: int) -> list[User]:
    # * Search by full name (case-insensitive). An empty/whitespace-only query intentionally returns
    # * [] without hitting the DB, so we don't serve an arbitrary "top users" list on an empty query.
    stripped = query.strip()
    if not stripped:
        return []

    pattern = f"%{_escape_like(stripped)}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != exclude_user_id,
            or_(
                User.last_name.ilike(pattern, escape="\\"),
                User.first_name.ilike(pattern, escape="\\"),
                User.patronymic.ilike(pattern, escape="\\"),
            ),
        )
        .limit(limit)
    )
    return list(result.scalars())


async def get_linked_person_ids(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, uuid.UUID]:
    # * Batch version of graph_service.get_linked_person — avoids N+1 when enriching the search
    # * results list with person_id (one query instead of one per found user).
    if not user_ids:
        return {}
    result = await db.execute(select(Person.linked_user_id, Person.id).where(Person.linked_user_id.in_(user_ids)))
    return {linked_user_id: person_id for linked_user_id, person_id in result.all()}
