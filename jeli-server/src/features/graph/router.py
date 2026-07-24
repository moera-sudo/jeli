# Router for the graph feature: tree creation/joining, graph nodes/relationships, marriage between nodes, reading and
# confirming matches, editing-rights delegation. No common prefix (except for the /graph/* endpoints) —
# paths are spelled out explicitly, since some paths (/users/{id}/matches) logically belong to a different API segment.
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.graph import service as graph_service
from src.features.graph.constants import DEFAULT_GRAPH_DEPTH, MAX_GRAPH_DEPTH
from src.features.graph.schemas import (
    CollaboratorGrantRequest,
    CollaboratorRead,
    GraphJoinRequest,
    GraphResponse,
    InviteCodeResponse,
    MarriageProposalCreateRequest,
    MatchCandidateRead,
    PersonCreateRequest,
    PersonDetail,
    PersonInsertBetweenRequest,
    PersonUpdateRequest,
    RelationshipCreateRequest,
    RelationshipProposalRead,
    RelationshipRead,
    RelationshipUpdateRequest,
    RuTaxonomySuggestion,
    SuccessorCandidate,
)
from src.features.graph.ru_taxonomy import derive_tribe_zhuz
from src.features.matching import service as matching_service
from src.features.messenger import service as messenger_service
from src.features.user.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["graph"])


@router.get(
    "/ru-taxonomy",
    response_model=RuTaxonomySuggestion,
    summary="Tribe/zhuz suggestion by ru",
    description=(
        "Given a ru name, returns the presumed tribe and zhuz from the ru_taxonomy reference "
        "(exact match + fuzzy matching). If there are no matches — both fields are null. The frontend uses this "
        "to auto-fill the profile (the user can change the values)."
    ),
)
async def suggest_ru_taxonomy(
    ru: str = Query(..., min_length=1, max_length=255, description="Ru name"),
    current_user: User = Depends(get_user),
) -> RuTaxonomySuggestion:
    derived = derive_tribe_zhuz(ru)
    if derived is None:
        return RuTaxonomySuggestion(tribe=None, zhuz=None)
    tribe, zhuz = derived
    return RuTaxonomySuggestion(tribe=tribe, zhuz=zhuz)


async def _attach_chat_thread_id(db: AsyncSession, detail: PersonDetail, current_user: User) -> PersonDetail:
    # * Read-only — if there's no chat yet, chat_thread_id stays null (created via POST /chats).
    if detail.linked_user_id is not None and detail.linked_user_id != current_user.id:
        detail.chat_thread_id = await messenger_service.get_existing_chat_id(
            db, current_user.id, detail.linked_user_id
        )
    return detail


@router.post(
    "/graph/create",
    response_model=PersonDetail,
    summary="Create your own genealogical tree",
    description=(
        "Creates a root graph node for the current user (uses their gender from the profile — "
        "fill it in via /users/profile/edit if not set yet). A user can only have "
        "one tree — calling this again returns an error."
    ),
)
async def create_graph(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    logger.info("Create graph request received by user %s", current_user.id)
    person = await graph_service.create_root_person_explicit(db, current_user)
    background_tasks.add_task(matching_service.recompute_for_person_task, person.id)
    return await graph_service.get_person_detail(db, person.id, current_user)


@router.post(
    "/graph/join",
    response_model=PersonDetail,
    summary="Join an existing tree by code",
    description=(
        "Explicit joining outside of registration: finds a node by invite code and links it to the "
        "current account. Copies into the profile (gender, ru, tribe, zhuz, birth_country) the fields that "
        "are not yet filled in there. A user can only have one tree."
    ),
)
async def join_graph(
    payload: GraphJoinRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    logger.info("Join graph request received by user %s", current_user.id)
    person = await graph_service.join_graph_by_invite_code(db, current_user, payload.invite_code)
    background_tasks.add_task(matching_service.recompute_for_person_task, person.id)
    return await graph_service.get_person_detail(db, person.id, current_user)


@router.get(
    "/graph/successor-candidates",
    response_model=list[SuccessorCandidate],
    summary="Candidates for handing over graph ownership",
    description=(
        "Living registered users linked to your graph (your own nodes with someone else's linked_user_id "
        "+ existing collaborators) — used when deleting your own node, if the graph needs to be "
        "handed over to someone."
    ),
)
async def get_successor_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[SuccessorCandidate]:
    candidates = await graph_service.get_successor_candidates(db, current_user)
    return [SuccessorCandidate.model_validate(c) for c in candidates]


@router.post(
    "/persons",
    response_model=PersonDetail,
    summary="Add a person to the genealogical tree",
    description=(
        "Creates a new graph node. You can pass the relation field to immediately specify a relationship with "
        "an existing person (parent/child/spouse) — the node and the relationship are created in a single transaction. "
        "If relation.type=spouse and the found person belongs to a different owner — instead of a direct "
        "relationship, a marriage proposal is created, awaiting confirmation from the other side's owner. "
        "description — a free-form story about this person, especially useful for deceased ancestors and "
        "not-yet-registered relatives, who have no profile of their own to tell their story."
    ),
)
async def create_person(
    payload: PersonCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    logger.info("Create person request received by user %s", current_user.id)
    person = await graph_service.create_person(db, current_user, payload)
    background_tasks.add_task(matching_service.recompute_for_person_task, person.id)
    if payload.relation is not None:
        background_tasks.add_task(matching_service.recompute_for_person_task, payload.relation.to_person_id)
    detail = await graph_service.get_person_detail(db, person.id, current_user)
    return await _attach_chat_thread_id(db, detail, current_user)


@router.post(
    "/persons/insert-between",
    response_model=PersonDetail,
    summary="Insert a person between two nodes",
    description=(
        "Inserts a new person between two ALREADY existing directly connected nodes "
        "(child_id --child_of--> parent_id) — the old edge is deleted, two new ones are created through "
        "the new person. Lets you fix a missing generation without the risk of cascading deletion "
        "of descendants that would happen if the node were deleted/recreated."
    ),
)
async def insert_person_between(
    payload: PersonInsertBetweenRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.insert_person_between(db, current_user, payload)
    background_tasks.add_task(matching_service.recompute_for_person_task, person.id)
    background_tasks.add_task(matching_service.recompute_for_person_task, payload.parent_id)
    background_tasks.add_task(matching_service.recompute_for_person_task, payload.child_id)
    detail = await graph_service.get_person_detail(db, person.id, current_user)
    return await _attach_chat_thread_id(db, detail, current_user)


@router.get(
    "/persons/me",
    response_model=PersonDetail,
    summary="Get your own root node",
    description="Returns the graph node linked to the current account (linked_user_id = you).",
)
async def get_my_person(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_linked_person_or_404(db, current_user.id)
    detail = await graph_service.get_person_detail(db, person.id, current_user)
    return await _attach_chat_thread_id(db, detail, current_user)


@router.get(
    "/persons/{id}",
    response_model=PersonDetail,
    summary="Get a detailed person card",
    description=(
        "Returns full information about a graph node: dates, geography, ancestry attributes, degree of kinship "
        "relative to you (relation_to_viewer), top matches (top_matches), and can_edit (whether you can "
        "edit this node). Available to any authorized user — graph data is open "
        "for searching for relatives."
    ),
)
async def get_person(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    detail = await graph_service.get_person_detail(db, id, current_user)
    return await _attach_chat_thread_id(db, detail, current_user)


@router.patch(
    "/persons/{id}",
    response_model=PersonDetail,
    summary="Fill in/correct data about a person",
    description=(
        "Partial update of a node. Available to the graph owner, their collaborator, and also to the living "
        "person themselves, if the node is linked to their account (linked_user_id). description — a free-form "
        "story about this person, especially useful for deceased ancestors and not-yet-registered "
        "relatives, who have no profile of their own to tell their story."
    ),
)
async def update_person(
    id: uuid.UUID,
    payload: PersonUpdateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_person_or_404(db, id)
    data = payload.model_dump(exclude_unset=True)
    await graph_service.update_person(db, person, current_user, data)
    background_tasks.add_task(matching_service.recompute_for_person_task, id)
    detail = await graph_service.get_person_detail(db, id, current_user)
    return await _attach_chat_thread_id(db, detail, current_user)


@router.delete(
    "/persons/{id}",
    status_code=204,
    summary="Delete/unlink a node",
    description=(
        "If a node has a living account linked to it — the node is NOT deleted, it is only unlinked "
        "(linked_user_id = null), all data and relationships are preserved. When unlinking YOUR OWN node, "
        "if other living users are linked to your graph, you need to hand over graph ownership to them via "
        "new_owner_user_id (see GET /graph/successor-candidates) — otherwise an error is returned. A regular node "
        "with no linked account is deleted completely, with cascade."
    ),
)
async def delete_person(
    id: uuid.UUID,
    new_owner_user_id: uuid.UUID | None = Query(
        None, description="Who to hand over graph ownership to when unlinking your own node"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    person = await graph_service.get_person_or_404(db, id)
    await graph_service.delete_person(db, person, current_user, new_owner_user_id)


@router.post(
    "/persons/{id}/invite-code",
    response_model=InviteCodeResponse,
    summary="Generate an invite code for a node",
    description=(
        "Generates a code that can be given to a real relative (manually, via third-party "
        "communication channels) — used both for joining a tree (/graph/join, graph_invite_code at "
        "registration), and as the target of a marriage proposal (/marriage-proposals). The code is not one-time use: "
        "exclusivity of joining is ensured by the fact that a node with an already-linked account cannot be "
        "joined a second time."
    ),
)
async def create_invite_code(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> InviteCodeResponse:
    person = await graph_service.get_person_or_404(db, id)
    code = await graph_service.generate_invite_code_for_person(db, person, current_user)
    return InviteCodeResponse(invite_code=code)


@router.get(
    "/graph",
    response_model=GraphResponse,
    summary="Get a lightweight graph around a node",
    description=(
        "Returns flat persons[]/relationships[] around the focus node (a format for React Flow), "
        "bounded by depth generations up/down. If a node has an active marriage — traversal "
        "continues through the spouse as well (their ancestors/descendants also get into the graph); if the marriage "
        "is dissolved — the spouse is shown only by themselves, without their family. Plus confirmed match bridges."
    ),
)
async def get_graph(
    focus: uuid.UUID = Query(..., description="ID of the node the graph is built around"),
    depth: int = Query(DEFAULT_GRAPH_DEPTH, ge=1, le=MAX_GRAPH_DEPTH, description="Traversal depth in generations"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> GraphResponse:
    return await graph_service.get_graph(db, focus, depth, current_user)


@router.get(
    "/persons/{id}/bloodline",
    response_model=GraphResponse,
    summary="Blood chain of ancestors and descendants",
    description="Only child_of relationships, strictly the direct line, no depth limit — for debugging/standalone display.",
)
async def get_bloodline(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> GraphResponse:
    return await graph_service.get_bloodline(db, id, current_user)


@router.get(
    "/persons/{id}/household-graph",
    response_model=GraphResponse,
    summary="Merged graph for display",
    description=(
        "Blood line + siblings/nephews-nieces (no depth limit) + spouses (for an active marriage — "
        "together with their ancestors/descendants, for a dissolved one — the spouse alone) + confirmed match bridges."
    ),
)
async def get_household_graph(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> GraphResponse:
    return await graph_service.get_household_graph(db, id, current_user)


@router.post(
    "/relationships",
    response_model=RelationshipRead,
    summary="Create a blood relationship between two nodes",
    description=(
        "Creates a child_of edge between two already existing nodes. Requires editing rights on "
        "both nodes — either directly, or (if the nodes are already in one cluster merged by marriage/match) at least "
        "on one of them. For spouse_of use /marriage-proposals."
    ),
)
async def create_relationship(
    payload: RelationshipCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipRead:
    rel = await graph_service.create_relationship(db, current_user, payload.from_person_id, payload.to_person_id)
    background_tasks.add_task(matching_service.recompute_for_person_task, rel.from_person_id)
    background_tasks.add_task(matching_service.recompute_for_person_task, rel.to_person_id)
    return RelationshipRead.model_validate(rel)


@router.patch(
    "/relationships/{id}",
    response_model=RelationshipRead,
    summary="Change the year/reason marriage ended",
    description=(
        "Edits marriage_year/marriage_end_reason on an existing edge WITHOUT deleting it — divorce/widowhood "
        "are preserved as marriage history rather than erased along with the edge."
    ),
)
async def update_relationship(
    id: uuid.UUID,
    payload: RelationshipUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipRead:
    data = payload.model_dump(exclude_unset=True)
    rel = await graph_service.update_relationship(db, id, current_user, data)
    return RelationshipRead.model_validate(rel)


@router.delete(
    "/relationships/{id}",
    status_code=204,
    summary="Delete a relationship",
    description="For an edge that was created entirely by mistake. For divorce/widowhood use PATCH.",
)
async def delete_relationship(
    id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    from_person_id, to_person_id = await graph_service.delete_relationship(db, id, current_user)
    background_tasks.add_task(matching_service.recompute_for_person_task, from_person_id)
    background_tasks.add_task(matching_service.recompute_for_person_task, to_person_id)


@router.post(
    "/marriage-proposals",
    response_model=RelationshipProposalRead,
    summary="Propose marriage between two nodes",
    description=(
        "person_a_id — your known node. target_invite_code — the other side's node code (obtained from "
        "the other graph's owner outside the app — there is no global graph search). If both nodes are "
        "edited by the current user — the marriage is created instantly (status confirmed). If the nodes "
        "belong to different owners — a proposal (pending) is created, awaiting confirmation from "
        "the other side's owner."
    ),
)
async def create_marriage_proposal(
    payload: MarriageProposalCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipProposalRead:
    proposal = await graph_service.create_marriage_proposal(db, current_user, payload)
    return RelationshipProposalRead.model_validate(proposal)


@router.get(
    "/marriage-proposals",
    response_model=list[RelationshipProposalRead],
    summary="List marriage proposals",
    description="Incoming and outgoing proposals where you are the initiator or the owner of one of the sides.",
)
async def list_marriage_proposals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[RelationshipProposalRead]:
    proposals = await graph_service.list_marriage_proposals_for_user(db, current_user)
    return [RelationshipProposalRead.model_validate(p) for p in proposals]


@router.get(
    "/marriage-proposals/{id}",
    response_model=RelationshipProposalRead,
    summary="Marriage proposal details",
    description="Returns the status, participants, and result (if already confirmed/rejected).",
)
async def get_marriage_proposal(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipProposalRead:
    proposal = await graph_service.get_marriage_proposal_or_404(db, id)
    return RelationshipProposalRead.model_validate(proposal)


@router.post(
    "/marriage-proposals/{id}/confirm",
    response_model=RelationshipProposalRead,
    summary="Confirm a marriage proposal",
    description="Available only to the owner (or collaborator) of the other side of the proposal.",
)
async def confirm_marriage_proposal(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipProposalRead:
    proposal = await graph_service.get_marriage_proposal_or_404(db, id)
    proposal = await graph_service.confirm_marriage_proposal(db, proposal, current_user)
    return RelationshipProposalRead.model_validate(proposal)


@router.post(
    "/marriage-proposals/{id}/reject",
    response_model=RelationshipProposalRead,
    summary="Reject a marriage proposal",
    description="Available only to the owner (or collaborator) of the other side of the proposal.",
)
async def reject_marriage_proposal(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipProposalRead:
    proposal = await graph_service.get_marriage_proposal_or_404(db, id)
    proposal = await graph_service.reject_marriage_proposal(db, proposal, current_user)
    return RelationshipProposalRead.model_validate(proposal)


@router.get(
    "/persons/{id}/matches",
    response_model=list[MatchCandidateRead],
    summary="Matches along a node's blood line",
    description="Returns matches found by the matching algorithm with candidates from other people's trees, sorted by score.",
)
async def get_person_matches(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[MatchCandidateRead]:
    matches = await graph_service.get_person_matches(db, id)
    return [graph_service.to_match_read(m) for m in matches]


@router.get(
    "/users/{id}/matches",
    response_model=list[MatchCandidateRead],
    summary="All matches across a user's extended graph",
    description=(
        "The main endpoint for the UI: aggregates matches across the user's entire household graph (blood + "
        "marriages + confirmed matches), found by the matching algorithm."
    ),
)
async def get_user_matches(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[MatchCandidateRead]:
    matches = await graph_service.get_user_matches(db, id)
    return [graph_service.to_match_read(m) for m in matches]


@router.post(
    "/matches/{id}/confirm",
    response_model=MatchCandidateRead,
    summary="Confirm a match from your own side",
    description=(
        "Confirms the match on behalf of the node you edit (owner/collaborator). "
        "On mutual confirmation, a graph_link(match_confirmed) bridge is created, merging the "
        "display of the graphs, without physically merging the records."
    ),
)
async def confirm_match(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> MatchCandidateRead:
    match = await graph_service.get_match_or_404(db, id)
    match = await graph_service.confirm_match(db, match, current_user)
    return graph_service.to_match_read(match)


@router.post(
    "/matches/{id}/reject",
    response_model=MatchCandidateRead,
    summary="Reject a proposed match",
    description="Rejects the match on behalf of the node you edit (owner/collaborator).",
)
async def reject_match(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> MatchCandidateRead:
    match = await graph_service.get_match_or_404(db, id)
    match = await graph_service.reject_match(db, match, current_user)
    return graph_service.to_match_read(match)


@router.post(
    "/graph/collaborators",
    response_model=CollaboratorRead,
    summary="Delegate editing rights to your graph",
    description=(
        "Grants a living registered node of your graph (person_id) the right to edit your entire "
        "graph on equal footing with you. The node must belong to you and be linked to a real account."
    ),
)
async def grant_collaborator(
    payload: CollaboratorGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> CollaboratorRead:
    grant = await graph_service.grant_collaborator(db, current_user, payload.person_id)
    return CollaboratorRead.model_validate(grant)


@router.get(
    "/graph/collaborators",
    response_model=list[CollaboratorRead],
    summary="List collaborators on your graph",
    description="Who you have delegated editing rights to your graph to.",
)
async def list_collaborators(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[CollaboratorRead]:
    collaborators = await graph_service.list_collaborators(db, current_user)
    return [CollaboratorRead.model_validate(c) for c in collaborators]


@router.delete(
    "/graph/collaborators/{user_id}",
    status_code=204,
    summary="Revoke collaborator rights",
    description="Removes the specified user's right to edit your graph.",
)
async def revoke_collaborator(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    await graph_service.revoke_collaborator(db, current_user, user_id)
