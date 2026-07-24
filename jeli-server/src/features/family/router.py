# Router for the family feature: markdown family history, one record per graph owner.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.family import service as family_service
from src.features.family.schemas import FamilyRead, FamilyUpsertRequest
from src.features.user.models import User

router = APIRouter(prefix="/family", tags=["family"])


@router.get(
    "",
    response_model=FamilyRead,
    summary="Get the shared history of your own family",
    description=(
        "One shared markdown history for the entire graph (keyed by graph owner). Returns the history of the "
        "graph that the current user belongs to (determined by their node). It is visible to and editable by "
        "all family members. Returns 404 if it hasn't been created yet — use PUT /family."
    ),
)
async def get_my_family(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    owner_user_id = await family_service.resolve_graph_owner_id(db, current_user)
    family = await family_service.get_family_or_404(db, owner_user_id)
    return FamilyRead.model_validate(family)


@router.get(
    "/{owner_user_id}",
    response_model=FamilyRead,
    summary="Get another user's family history",
    description="Public read access — consistent with the graph data being open for relative-matching search.",
)
async def get_family(
    owner_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    family = await family_service.get_family_or_404(db, owner_user_id)
    return FamilyRead.model_validate(family)


@router.put(
    "",
    response_model=FamilyRead,
    summary="Create or fully update the shared family history",
    description=(
        "The resource is unique for the entire graph (keyed by graph owner). ANY family member belonging to "
        "the graph edits the same shared history — the edit is written under the graph owner, not under the "
        "editor, so the result is visible to everyone. Creates the record if it doesn't exist yet, otherwise "
        "fully overwrites title and content. Photos are inserted into content as markdown links to "
        "/api/media/{id} obtained via POST /media."
    ),
)
async def upsert_family(
    payload: FamilyUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> FamilyRead:
    family = await family_service.upsert_family(db, current_user, payload)
    return FamilyRead.model_validate(family)
