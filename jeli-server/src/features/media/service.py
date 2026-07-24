# Business logic for the media feature: saving uploaded files to disk + metadata in the DB.
import logging
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import get_settings
from src.features.media.constants import ALLOWED_IMAGE_CONTENT_TYPES, MAX_UPLOAD_SIZE_BYTES
from src.features.media.exceptions import FileTooLargeError, MediaNotFoundError, UnsupportedFileTypeError
from src.features.media.models import Media

logger = logging.getLogger(__name__)
settings = get_settings()


def _upload_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _file_path(media_id: uuid.UUID) -> Path:
    return _upload_dir() / str(media_id)


async def save_upload(db: AsyncSession, file: UploadFile) -> Media:
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise UnsupportedFileTypeError()
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise FileTooLargeError()

    media = Media(content_type=file.content_type)
    db.add(media)
    await db.commit()
    await db.refresh(media)

    _file_path(media.id).write_bytes(content)
    logger.info("Media uploaded: %s (content_type=%s, size=%d)", media.id, file.content_type, len(content))
    return media


async def get_media_or_404(db: AsyncSession, media_id: uuid.UUID) -> Media:
    result = await db.execute(select(Media).where(Media.id == media_id))
    media = result.scalar_one_or_none()
    if media is None:
        raise MediaNotFoundError()
    return media


def get_file_bytes(media_id: uuid.UUID) -> bytes:
    path = _file_path(media_id)
    if not path.is_file():
        raise MediaNotFoundError()
    return path.read_bytes()
