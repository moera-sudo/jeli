# Pydantic-схемы фичи user: профиль текущего пользователя, публичный профиль другого пользователя,
# частичное обновление профиля. Переиспользуются фичей auth для ответов на регистрацию/логин.
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class OptionalProfileFields(BaseModel):
    # * Общие необязательные поля профиля — переиспользуются в auth.RegisterWithInfoRequest,
    # * user.ProfileUpdateRequest и user.ProfileCreateRequest.
    current_city: str | None = None
    current_country: str | None = None
    birth_date: date | None = None
    birth_city: str | None = None
    birth_country: str | None = None
    description: str | None = None
    nationality: str | None = None
    ru: str | None = None
    zhuz: str | None = None
    tribe: str | None = None


class UserMe(BaseModel):
    # * Полная информация о текущем пользователе (GET /users/profile/me и ответы auth-эндпоинтов).
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    avatar_url: str
    current_city: str | None
    current_country: str | None
    birth_date: date | None
    birth_city: str | None
    birth_country: str | None
    description: str | None
    nationality: str | None
    ru: str | None
    zhuz: str | None
    tribe: str | None
    graph_invite_code: str | None
    created_at: datetime
    updated_at: datetime


class UserPublic(BaseModel):
    # * Публичный профиль другого пользователя — без email и hashed_password.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    avatar_url: str
    current_city: str | None
    current_country: str | None
    birth_date: date | None
    birth_city: str | None
    birth_country: str | None
    description: str | None
    nationality: str | None
    ru: str | None
    zhuz: str | None
    tribe: str | None
    created_at: datetime


class ProfileCreateRequest(OptionalProfileFields):
    # * POST /users/create — доп.поля профиля без full_name.
    avatar_url: str | None = None


class ProfileUpdateRequest(OptionalProfileFields):
    # * PATCH /users/profile/edit — то же самое плюс full_name.
    full_name: str | None = None
    avatar_url: str | None = None
