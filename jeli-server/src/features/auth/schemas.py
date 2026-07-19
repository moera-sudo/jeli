# Pydantic-схемы фичи auth: запросы регистрации/логина/рефреша и ответы с токенами.
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from src.features.user.schemas import OptionalProfileFields, UserMe

Gender = Literal["male", "female"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    # * Используется только для создания корневого узла графа (Person.gender) — в Users не хранится.
    gender: Gender
    graph_invite_code: str | None = None


class RegisterWithInfoRequest(RegisterRequest, OptionalProfileFields):
    # * Те же обязательные поля, что RegisterRequest, плюс все опциональные профильные поля.
    avatar_url: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(TokenPair):
    # * Ответ register/register-with-info/login: токены + базовая информация о пользователе.
    user: UserMe
