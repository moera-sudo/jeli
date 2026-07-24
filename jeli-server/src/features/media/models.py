# ORM model for Media: metadata of an uploaded file. The file itself lives on disk in settings.upload_dir
# under its id (no extension) — content_type is needed so GET /media/{id} returns the correct header.
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base


class Media(Base):
    __tablename__ = "media"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
