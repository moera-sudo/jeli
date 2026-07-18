# Роутер фичи user: профиль текущего пользователя, публичный профиль другого пользователя, редактирование.
import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.user import service as user_service
from src.features.user.models import User
from src.features.user.schemas import ProfileCreateRequest, ProfileUpdateRequest, UserMe, UserPublic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/profile/me",
    response_model=UserMe,
    summary="Получить полный профиль текущего пользователя",
    description=(
        "Возвращает всю информацию о текущем авторизованном пользователе, включая email, "
        "но без хэша пароля. Требует Bearer access-токен."
    ),
)
async def get_my_profile(current_user: User = Depends(get_user)) -> UserMe:
    return UserMe.model_validate(current_user)


@router.get(
    "/profile/{id}",
    response_model=UserPublic,
    summary="Получить публичный профиль пользователя по ID",
    description=(
        "Возвращает публичные данные другого пользователя (email и пароль скрыты). Полезно для "
        "поиска родственников по геоданным и родовым признакам. Требует авторизации. "
        "Возвращает 404, если пользователь не найден."
    ),
)
async def get_public_profile(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserPublic:
    user = await user_service.get_by_id_or_404(db, id)
    return UserPublic.model_validate(user)


@router.patch(
    "/profile/edit",
    response_model=UserMe,
    summary="Частично обновить профиль текущего пользователя",
    description=(
        "Позволяет обновить любые профильные поля (ФИО, аватар, гео, родовые признаки, био) "
        "текущего пользователя. Все поля опциональны — передаются только те, что нужно изменить. "
        "Email и пароль через этот эндпоинт не редактируются. Нужен для редактирования информации в профиле"
    ),
)
async def edit_my_profile(
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    data = payload.model_dump(exclude_unset=True)
    updated = await user_service.update_profile(db, current_user, data)
    return UserMe.model_validate(updated)


@router.post(
    "/create",
    response_model=UserMe,
    summary="Заполнить дополнительные данные профиля",
    description=(
        "Позволяет текущему пользователю дозаполнить профильные данные (гео, дата и место рождения, "
        "родовые признаки, био, аватар) без изменения ФИО. Не выдаёт новых токенов — это не auth-эндпоинт. auth/register + user/create = альтернатива register/with-info. Выбирай какой тебе больше нравится"
    ),
)
async def create_profile_details(
    payload: ProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    data = payload.model_dump(exclude_unset=True)
    updated = await user_service.update_profile(db, current_user, data)
    return UserMe.model_validate(updated)
