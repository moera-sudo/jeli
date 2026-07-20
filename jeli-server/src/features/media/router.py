# Роутер фичи media: общий аплоад/отдача файлов + отдельные эндпоинты для аватарок профиля/person.
import uuid

from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.graph import service as graph_service
from src.features.graph.schemas import PersonDetail
from src.features.media import service as media_service
from src.features.media.schemas import MediaUploadResponse
from src.features.user import service as user_service
from src.features.user.models import User
from src.features.user.schemas import UserMe

router = APIRouter(tags=["media"])


def _media_url(media_id: uuid.UUID) -> str:
    return f"/api/media/{media_id}"


@router.post(
    "/media",
    response_model=MediaUploadResponse,
    summary="Загрузить файл",
    description=(
        "Общий аплоад изображений (JPEG/PNG/WebP/GIF, до 10МБ) — используется, например, для вставки "
        "фото внутрь markdown семейной истории (`PUT /family`). Возвращает ссылку вида `/api/media/{id}`, "
        "которую можно подставить как есть (в `![alt](url)` или в любое другое поле-ссылку)."
    ),
)
async def upload_media(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> MediaUploadResponse:
    media = await media_service.save_upload(db, file)
    return MediaUploadResponse(url=_media_url(media.id))


@router.get(
    "/media/{id}",
    summary="Получить файл",
    description=(
        "Отдаёт сырые байты загруженного файла с корректным Content-Type. Без авторизации — обычный "
        "`<img src=...>` в браузере не может передать Bearer-токен, поэтому эндпоинт публичный "
        "(как и весь остальной граф данных, который открыт для поиска родственников)."
    ),
)
async def get_media(id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    media = await media_service.get_media_or_404(db, id)
    content = media_service.get_file_bytes(media.id)
    return Response(content=content, media_type=media.content_type)


@router.post(
    "/users/profile/avatar",
    response_model=UserMe,
    summary="Загрузить аватар профиля",
    description="Сохраняет файл и сразу проставляет avatar_url текущего пользователя — один вызов вместо upload+PATCH.",
)
async def upload_profile_avatar(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    media = await media_service.save_upload(db, file)
    updated = await user_service.update_profile(db, current_user, {"avatar_url": _media_url(media.id)})
    return UserMe.model_validate(updated)


@router.post(
    "/persons/{id}/avatar",
    response_model=PersonDetail,
    summary="Загрузить аватар узла графа",
    description=(
        "Сохраняет файл и сразу проставляет avatar_url узла — доступно владельцу/коллаборатору/самому "
        "живому человеку (см. can_edit_person). is_alive никак не влияет на права — аватарку можно "
        "поставить и умершему предку, если она есть в семейном архиве."
    ),
)
async def upload_person_avatar(
    id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_person_or_404(db, id)
    media = await media_service.save_upload(db, file)
    await graph_service.update_person(db, person, current_user, {"avatar_url": _media_url(media.id)})
    return await graph_service.get_person_detail(db, id, current_user)
