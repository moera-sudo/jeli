# Роутер фичи family: markdown-история семьи, одна запись на владельца графа.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.family import service as family_service
from src.features.family.schemas import FamilyRead, FamilyUpsertRequest
from src.features.user.models import User

router = APIRouter(prefix="/family", tags=["family"])


@router.get(
    "",
    response_model=FamilyRead,
    summary="Получить свою историю семьи",
    description="Markdown-история и заголовок текущего пользователя. 404, если ещё не создана — используйте PUT /family.",
)
async def get_my_family(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    family = await family_service.get_family_or_404(db, current_user.id)
    return FamilyRead.model_validate(family)


@router.get(
    "/{owner_user_id}",
    response_model=FamilyRead,
    summary="Получить историю семьи другого пользователя",
    description="Публичное чтение — консистентно с открытостью данных графа для поиска родственников.",
)
async def get_family(
    owner_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    family = await family_service.get_family_or_404(db, owner_user_id)
    return FamilyRead.model_validate(family)


@router.put(
    "",
    response_model=FamilyRead,
    summary="Создать или полностью обновить историю семьи",
    description=(
        "Ресурс всегда единственный на владельца графа — создаёт запись, если её ещё нет, иначе "
        "полностью перезаписывает title и content. Фото вставляются в content как markdown-ссылки "
        "на /api/media/{id}, полученные через POST /media."
    ),
)
async def upsert_family(
    payload: FamilyUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    family = await family_service.upsert_family(db, current_user, payload)
    return FamilyRead.model_validate(family)
