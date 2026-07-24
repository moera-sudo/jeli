# ORM model of the user: account + personal profile (not a graph node, see the graph feature in Stage 4).
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base
from src.features.user.constants import DEFAULT_AVATAR_URL


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # * Nullable at the DB level, since old records are backfilled empty (see migration 0006) — the requirement
    # * for last_name/first_name on NEW records is enforced at the schema level (RegisterRequest, etc.).
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(1024), nullable=False, default=DEFAULT_AVATAR_URL)
    # * Nullable — not collected at registration, filled in later via the profile. Needed for
    # * creating the root Person (Person.gender is required), see graph.service.create_root_person_for_user.
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)

    current_city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birth_country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ru: Mapped[str | None] = mapped_column(String(255), nullable=True)
    zhuz: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tribe: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # * Pass-through for the graph feature (Stage 4): code for joining an existing graph.
    # TODO(graph): Stage 4 will read this field on first entry into the graph and likely clear it after use.
    graph_invite_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
