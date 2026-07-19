# ORM-модель пользователя: аккаунт + личный профиль (не узел графа, см. фичу graph в Этапе 4).
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
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str] = mapped_column(String(1024), nullable=False, default=DEFAULT_AVATAR_URL)
    # * Nullable — не собирается на регистрации, заполняется позже через профиль. Нужен для
    # * создания root-Person (Person.gender обязателен), см. graph.service.create_root_person_for_user.
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

    # * Pass-through для фичи graph (Этап 4): код присоединения к существующему графу.
    # TODO(graph): Этап 4 прочитает это поле при первом входе в граф и, вероятно, обнулит после использования.
    graph_invite_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
