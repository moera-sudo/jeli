# Роутер фичи search: поиск профилей пользователей по ФИО.
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.search import service as search_service
from src.features.search.constants import DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT
from src.features.user.models import User
from src.features.user.schemas import UserPublic

router = APIRouter(tags=["search"])


@router.get(
    "/search",
    response_model=list[UserPublic],
    summary="Поиск профилей по ФИО",
    description=(
        "Ищет других пользователей по вхождению q в фамилию/имя/отчество (без учёта регистра). "
        "Себя самого в результатах не будет. person_id заполнен, только если найденный человек уже "
        "создал/присоединился к дереву — по нему можно сразу вызвать POST /chats, чтобы написать ему."
    ),
)
async def search_profiles(
    q: str = Query(..., min_length=1, max_length=255, description="Подстрока для поиска по ФИО"),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT, description="Максимум результатов"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[UserPublic]:
    users = await search_service.search_users(db, q, current_user.id, limit)
    person_ids_by_user = await search_service.get_linked_person_ids(db, [u.id for u in users])
    return [
        UserPublic.model_validate(u).model_copy(update={"person_id": person_ids_by_user.get(u.id)}) for u in users
    ]
