# ORM-модель Media: метаданные загруженного файла. Сам файл лежит на диске в settings.upload_dir
# под именем id (без расширения) — content_type нужен, чтобы GET /media/{id} отдавал верный заголовок.
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
