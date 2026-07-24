# Router for the media feature: generic file upload/serving + dedicated endpoints for profile/person avatars.
import uuid

from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.graph import service as graph_service
from src.features.graph.schemas import PersonDetail
from src.features.media import service as media_service
from src.features.media.schemas import MediaUploadResponse
from src.features.user import service as user_service
from src.features.user.models import User
from src.features.user.schemas import UserMe

router = APIRouter(tags=["media"])


def _media_url(media_id: uuid.UUID) -> str:
    return f"/api/media/{media_id}"


@router.post(
    "/media",
    response_model=MediaUploadResponse,
    summary="Upload a file",
    description=(
        "Generic image upload (JPEG/PNG/WebP/GIF, up to 10MB) — used, for example, to insert photos "
        "into the markdown family history (`PUT /family`). Returns a link of the form `/api/media/{id}`, "
        "which can be substituted as-is (in `![alt](url)` or into any other link field)."
    ),
)
async def upload_media(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> MediaUploadResponse:
    media = await media_service.save_upload(db, file)
    return MediaUploadResponse(url=_media_url(media.id))


@router.get(
    "/media/{id}",
    summary="Get a file",
    description=(
        "Returns the raw bytes of the uploaded file with the correct Content-Type. No authorization — a "
        "plain `<img src=...>` in the browser can't send a Bearer token, so the endpoint is public "
        "(same as the rest of the graph data, which is open for relative-matching search)."
    ),
)
async def get_media(id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Response:
    media = await media_service.get_media_or_404(db, id)
    content = media_service.get_file_bytes(media.id)
    return Response(content=content, media_type=media.content_type)


@router.post(
    "/users/profile/avatar",
    response_model=UserMe,
    summary="Upload a profile avatar",
    description="Saves the file and immediately sets the current user's avatar_url — one call instead of upload+PATCH.",
)
async def upload_profile_avatar(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    media = await media_service.save_upload(db, file)
    updated = await user_service.update_profile(db, current_user, {"avatar_url": _media_url(media.id)})
    return UserMe.model_validate(updated)


@router.post(
    "/persons/{id}/avatar",
    response_model=PersonDetail,
    summary="Upload a graph node avatar",
    description=(
        "Saves the file and immediately sets the node's avatar_url — available to the owner/collaborator/the "
        "living person themselves (see can_edit_person). is_alive has no effect on permissions — an avatar can "
        "also be set for a deceased ancestor if one exists in the family archive."
    ),
)
async def upload_person_avatar(
    id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_person_or_404(db, id)
    media = await media_service.save_upload(db, file)
    await graph_service.update_person(db, person, current_user, {"avatar_url": _media_url(media.id)})
    return await graph_service.get_person_detail(db, id, current_user)
