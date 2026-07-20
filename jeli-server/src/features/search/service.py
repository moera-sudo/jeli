# Бизнес-логика фичи search: поиск профилей пользователей по ФИО + батч-обогащение person_id.
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.graph.models import Person
from src.features.user.models import User


def _escape_like(value: str) -> str:
    # * Экранирует спецсимволы LIKE/ILIKE, чтобы пользовательский ввод не менял семантику паттерна.
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_users(db: AsyncSession, query: str, exclude_user_id: uuid.UUID, limit: int) -> list[User]:
    # * Поиск по ФИО (без учёта регистра). Пустой/пробельный query — намеренно [] без похода в БД,
    # * чтобы не отдавать случайный "топ пользователей" по пустому запросу.
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
    # * Батч-версия graph_service.get_linked_person — избегает N+1 при обогащении списка результатов
    # * поиска person_id (один запрос вместо одного на каждого найденного пользователя).
    if not user_ids:
        return {}
    result = await db.execute(select(Person.linked_user_id, Person.id).where(Person.linked_user_id.in_(user_ids)))
    return {linked_user_id: person_id for linked_user_id, person_id in result.all()}
