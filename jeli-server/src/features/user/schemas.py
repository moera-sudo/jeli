# Pydantic schemas for the user feature: current user's profile, another user's public profile,
# partial profile update. Reused by the auth feature for registration/login responses.
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

Gender = Literal["male", "female"]


class OptionalProfileFields(BaseModel):
    # * Common optional profile fields — reused in auth.RegisterWithInfoRequest,
    # * user.ProfileUpdateRequest, and user.ProfileCreateRequest.
    gender: Gender | None = None
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
    # * Full information about the current user (GET /users/profile/me and auth endpoint responses).
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    last_name: str | None
    first_name: str | None
    patronymic: str | None
    avatar_url: str
    gender: Gender | None
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
    # * Public profile of another user — without email and hashed_password.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # * The graph node linked to this account (see graph_service.get_linked_person) — not an attribute
    # * of User, so it defaults to None here and is set separately via model_copy(update=...) in the router.
    person_id: uuid.UUID | None = None
    last_name: str | None
    first_name: str | None
    patronymic: str | None
    avatar_url: str
    gender: Gender | None
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
    # * POST /users/create — additional profile fields without last_name/first_name/patronymic (set at registration).
    avatar_url: str | None = None


class ProfileUpdateRequest(OptionalProfileFields):
    # * PATCH /users/profile/edit — the same, plus the name.
    last_name: str | None = None
    first_name: str | None = None
    patronymic: str | None = None
    avatar_url: str | None = None
