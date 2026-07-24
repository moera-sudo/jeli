# Pydantic schemas for the auth feature: registration/login/refresh requests and token responses.
from pydantic import BaseModel, EmailStr, Field

from src.features.user.schemas import OptionalProfileFields, UserMe


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    last_name: str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=255)
    patronymic: str | None = None
    # * Best-effort linking to an existing graph node (see graph.service.link_existing_person_by_invite_code).
    # * A tree is no longer created automatically on registration — see POST /graph/create, /graph/join.
    graph_invite_code: str | None = None


class RegisterWithInfoRequest(RegisterRequest, OptionalProfileFields):
    # * Same required fields as RegisterRequest, plus all optional profile fields.
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
    # * Response for register/register-with-info/login: tokens + basic information about the user.
    user: UserMe
