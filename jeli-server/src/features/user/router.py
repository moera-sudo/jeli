# Router for the user feature: current user's profile, another user's public profile, editing.
import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.graph import service as graph_service
from src.features.user import service as user_service
from src.features.user.models import User
from src.features.user.schemas import ProfileCreateRequest, ProfileUpdateRequest, UserMe, UserPublic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/profile/me",
    response_model=UserMe,
    summary="Get the full profile of the current user",
    description=(
        "Returns all information about the currently authenticated user, including email, "
        "but without the password hash. Requires a Bearer access token."
    ),
)
async def get_my_profile(current_user: User = Depends(get_user)) -> UserMe:
    return UserMe.model_validate(current_user)


@router.get(
    "/profile/{id}",
    response_model=UserPublic,
    summary="Get a user's public profile by ID",
    description=(
        "Returns another user's public data (email and password are hidden). Useful for "
        "finding relatives by geographic data and lineage attributes. Requires authorization. "
        "Returns 404 if the user is not found."
    ),
)
async def get_public_profile(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserPublic:
    user = await user_service.get_by_id_or_404(db, id)
    person = await graph_service.get_linked_person(db, id)
    return UserPublic.model_validate(user).model_copy(update={"person_id": person.id if person else None})


@router.patch(
    "/profile/edit",
    response_model=UserMe,
    summary="Partially update the current user's profile",
    description=(
        "Allows updating any profile fields (last name/first name/patronymic, avatar, geo, lineage attributes, bio) "
        "of the current user. All fields are optional — only the ones that need to change are passed. "
        "Email and password are not edited through this endpoint. Needed for editing profile information"
    ),
)
async def edit_my_profile(
    payload: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    data = payload.model_dump(exclude_unset=True)
    updated = await user_service.update_profile(db, current_user, data)
    return UserMe.model_validate(updated)


@router.post(
    "/create",
    response_model=UserMe,
    summary="Fill in additional profile data",
    description=(
        "Allows the current user to fill in additional profile data (geo, date and place of birth, "
        "lineage attributes, bio, avatar) without changing the last name/first name/patronymic. Does not issue new tokens — this is not an auth endpoint. auth/register + user/create = an alternative to register/with-info. Choose whichever you prefer"
    ),
)
async def create_profile_details(
    payload: ProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> UserMe:
    data = payload.model_dump(exclude_unset=True)
    updated = await user_service.update_profile(db, current_user, data)
    return UserMe.model_validate(updated)

@router.delete(
    "/delete",
    status_code=204,
    summary="Delete a user account",
    description=(
        "Completely deletes the account (login, profile). If the linked graph node belongs to "
        "ANOTHER owner — the node is only unlinked (linked_user_id becomes null), all data and "
        "connections are preserved. If the user themselves owns the graph and it has other registered "
        "participants or collaborators — ownership must be transferred to them via new_owner_user_id (see "
        "GET /graph/successor-candidates), otherwise an error is returned. If the user is the sole "
        "owner and there is no one to transfer to — the entire graph is deleted along with the account."
    ),
)
async def delete_account(
    new_owner_user_id: uuid.UUID | None = Query(
        None, description="Who to transfer graph ownership to, if the user is its sole owner"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    await graph_service.handle_account_deletion(db, current_user, new_owner_user_id)
    await user_service.delete_user(db, current_user)