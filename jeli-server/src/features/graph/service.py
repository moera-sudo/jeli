# Business logic for the graph feature: CRUD over Person/Relationship, graph traversal (recursive CTE + wave traversal),
# atomic node+relationship creation, marriage (direct for same-owner / via proposal for cross-owner, targeted by invite_code),
# matches (confirm/reject — the data itself is written by the future Stage 4, here only the graph-side effects),
# graph editing-rights delegation, explicit tree creation/joining, unlinking on deletion.
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import ConflictError
from src.features.graph.constants import (
    DEFAULT_ETHNIC_SOURCE,
    ETHNIC_SOURCE_DERIVED_FROM_RU,
    GRAPH_LINK_TYPE_MARRIAGE,
    GRAPH_LINK_TYPE_MATCH_CONFIRMED,
    MATCH_STATUS_DISCARD,
    MAX_PARENTS_PER_PERSON,
    PROPOSAL_STATUS_CONFIRMED,
    PROPOSAL_STATUS_PENDING,
    PROPOSAL_STATUS_REJECTED,
    RELATIONSHIP_TYPE_CHILD_OF,
    RELATIONSHIP_TYPE_SPOUSE_OF,
    TOP_MATCHES_LIMIT,
)
from src.features.graph.exceptions import (
    AlreadyHasPersonError,
    CollaboratorAlreadyExistsError,
    CollaboratorNotFoundError,
    CyclicRelationshipError,
    DuplicateProposalError,
    DuplicateRelationshipError,
    GenderRequiredError,
    InvalidSuccessorError,
    InviteCodeNotFoundError,
    MarriageProposalNotFoundError,
    MatchAlreadyResolvedError,
    MatchCandidateNotFoundError,
    NoDirectRelationshipError,
    NotLinkedPersonError,
    NotMatchParticipantError,
    NotPersonOwnerError,
    NotProposalResponderError,
    PersonNotFoundError,
    ProposalAlreadyResolvedError,
    RelationshipNotFoundError,
    RelationshipTypeMismatchError,
    SelfRelationshipError,
    SuccessorRequiredError,
    TooManyParentsError,
)
from src.features.graph.models import (
    GraphCollaborator,
    GraphLink,
    MatchCandidate,
    Person,
    PersonEditLog,
    Relationship,
    RelationshipProposal,
)
from src.features.graph.schemas import (
    GraphEdge,
    GraphResponse,
    MarriageProposalCreateRequest,
    MatchCandidateRead,
    PersonCreateRequest,
    PersonDetail,
    PersonInsertBetweenRequest,
    PersonNode,
)
from src.features.graph.ru_taxonomy import derive_tribe_zhuz
from src.features.graph.utils import build_display_name, generate_invite_code, normalize_name
from src.features.family.models import Family
from src.features.notifications import service as notifications_service
from src.features.notifications.constants import NOTIFICATION_TYPE_EXCLUDED_FROM_GRAPH
from src.features.user import service as user_service
from src.features.user.models import User

logger = logging.getLogger(__name__)


# * Unified editing-rights helper — owner OR a delegated collaborator.
async def can_edit_graph(db: AsyncSession, current_user_id: uuid.UUID, owner_user_id: uuid.UUID) -> bool:
    if current_user_id == owner_user_id:
        return True
    result = await db.execute(
        select(GraphCollaborator).where(
            GraphCollaborator.graph_owner_id == owner_user_id,
            GraphCollaborator.collaborator_user_id == current_user_id,
        )
    )
    return result.scalar_one_or_none() is not None


# * Same as above, but ADDITIONALLY allows the living person themselves to edit their own node.
async def can_edit_person(db: AsyncSession, current_user: User, person: Person) -> bool:
    if await can_edit_graph(db, current_user.id, person.owner_user_id):
        return True
    return person.linked_user_id == current_user.id


async def get_person_or_404(db: AsyncSession, person_id: uuid.UUID) -> Person:
    result = await db.execute(select(Person).where(Person.id == person_id))
    person = result.scalar_one_or_none()
    if person is None:
        raise PersonNotFoundError()
    return person


async def get_person_by_invite_code_or_404(db: AsyncSession, invite_code: str) -> Person:
    # * Used to target a marriage proposal — unlike join-linking, the code here is
    # * NOT checked for being already taken (you can propose a relationship with an already registered node).
    result = await db.execute(select(Person).where(Person.invite_code == invite_code))
    person = result.scalar_one_or_none()
    if person is None:
        raise InviteCodeNotFoundError()
    return person


async def get_linked_person(db: AsyncSession, user_id: uuid.UUID) -> Person | None:
    result = await db.execute(select(Person).where(Person.linked_user_id == user_id))
    return result.scalar_one_or_none()


async def get_linked_person_or_404(db: AsyncSession, user_id: uuid.UUID) -> Person:
    person = await get_linked_person(db, user_id)
    if person is None:
        raise PersonNotFoundError()
    return person


def _edge(rel: Relationship) -> GraphEdge:
    return GraphEdge(id=rel.id, from_person_id=rel.from_person_id, to_person_id=rel.to_person_id, type=rel.type)


async def _count_parents(db: AsyncSession, person_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Relationship).where(
            Relationship.type == RELATIONSHIP_TYPE_CHILD_OF, Relationship.from_person_id == person_id
        )
    )
    return result.scalar_one()


async def get_ancestors_with_depth(db: AsyncSession, person_id: uuid.UUID) -> dict[uuid.UUID, int]:
    sql = text(
        """
        WITH RECURSIVE up(id, depth) AS (
            SELECT :start_id ::uuid, 0
            UNION
            SELECT r.to_person_id, up.depth + 1
            FROM relationships r JOIN up ON r.from_person_id = up.id
            WHERE r.type = 'child_of'
        )
        SELECT id, depth FROM up WHERE id != :start_id
        """
    )
    result = await db.execute(sql, {"start_id": str(person_id)})
    return _min_depth_per_id(result)


def _min_depth_per_id(rows) -> dict[uuid.UUID, int]:
    # ! The same ancestor can be reachable at different depths via different lines (pedigree collapse) —
    # ! the UNION in the CTE deduplicates by (id, depth), not by id, so several rows can come back for
    # ! the same id. We take the MINIMUM depth — the closest kinship, deterministically.
    depths: dict[uuid.UUID, int] = {}
    for row in rows:
        if row.id not in depths or row.depth < depths[row.id]:
            depths[row.id] = row.depth
    return depths


async def get_descendants_with_depth(db: AsyncSession, person_id: uuid.UUID) -> dict[uuid.UUID, int]:
    sql = text(
        """
        WITH RECURSIVE down(id, depth) AS (
            SELECT :start_id ::uuid, 0
            UNION
            SELECT r.from_person_id, down.depth + 1
            FROM relationships r JOIN down ON r.to_person_id = down.id
            WHERE r.type = 'child_of'
        )
        SELECT id, depth FROM down WHERE id != :start_id
        """
    )
    result = await db.execute(sql, {"start_id": str(person_id)})
    return _min_depth_per_id(result)


async def get_full_household_person_ids(db: AsyncSession, root_person_id: uuid.UUID) -> set[uuid.UUID]:
    # * Used ONLY for /users/{id}/matches aggregation — not for the visual graph.
    # * affinal_hops resets to 0 when crossing graph_links — this way we can traverse any number of
    # * clusters in a row (marriages/confirmed matches), as described in matching-algorhitm.md.
    sql = text(
        """
        WITH RECURSIVE household(person_id, affinal_hops) AS (
            SELECT :root_id ::uuid, 0
            UNION
            SELECT expansion.next_id, expansion.next_hops
            FROM household h
            CROSS JOIN LATERAL (
                SELECT r.to_person_id AS next_id, h.affinal_hops AS next_hops
                FROM relationships r
                WHERE r.from_person_id = h.person_id AND r.type = 'child_of'
                UNION ALL
                SELECT r.from_person_id, h.affinal_hops
                FROM relationships r
                WHERE r.to_person_id = h.person_id AND r.type = 'child_of'
                UNION ALL
                SELECT CASE WHEN r.from_person_id = h.person_id THEN r.to_person_id ELSE r.from_person_id END, 1
                FROM relationships r
                WHERE (r.from_person_id = h.person_id OR r.to_person_id = h.person_id)
                  AND r.type = 'spouse_of' AND h.affinal_hops = 0 AND r.marriage_end_reason IS NULL
                UNION ALL
                SELECT CASE WHEN gl.person_a_id = h.person_id THEN gl.person_b_id ELSE gl.person_a_id END, 0
                FROM graph_links gl
                WHERE gl.person_a_id = h.person_id OR gl.person_b_id = h.person_id
            ) AS expansion(next_id, next_hops)
        )
        SELECT DISTINCT person_id FROM household
        """
    )
    result = await db.execute(sql, {"root_id": str(root_person_id)})
    return {row.person_id for row in result}


async def _compute_has_more_ancestors(db: AsyncSession, person_ids: set[uuid.UUID]) -> dict[uuid.UUID, bool]:
    result = await db.execute(
        select(Relationship.from_person_id, Relationship.to_person_id).where(
            Relationship.type == RELATIONSHIP_TYPE_CHILD_OF, Relationship.from_person_id.in_(person_ids)
        )
    )
    has_more = {pid: False for pid in person_ids}
    for from_id, to_id in result.all():
        if to_id not in person_ids:
            has_more[from_id] = True
    return has_more


async def _load_person_nodes(db: AsyncSession, generation: dict[uuid.UUID, int], current_user: User) -> list[PersonNode]:
    ids = set(generation.keys())
    if not ids:
        return []
    result = await db.execute(select(Person).where(Person.id.in_(ids)))
    persons = result.scalars().all()
    has_more = await _compute_has_more_ancestors(db, ids)
    nodes = []
    for person in persons:
        is_registered = person.linked_user_id is not None
        # ** can_chat is entirely computed by the server: alive + registered + not the viewer themselves.
        can_chat = person.is_alive and is_registered and person.linked_user_id != current_user.id
        nodes.append(
            PersonNode(
                id=person.id,
                last_name=person.last_name,
                first_name=person.first_name,
                patronymic=person.patronymic,
                gender=person.gender,
                avatar_url=person.avatar_url,
                generation=generation[person.id],
                birth_year=person.birth_year_value,
                death_year=person.death_year_value,
                is_alive=person.is_alive,
                is_registered=is_registered,
                can_chat=can_chat,
                has_more_ancestors=has_more.get(person.id, False),
            )
        )
    return nodes


async def _collect_child_of_edges(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, GraphEdge]:
    result = await db.execute(
        select(Relationship).where(
            Relationship.type == RELATIONSHIP_TYPE_CHILD_OF,
            Relationship.from_person_id.in_(ids),
            Relationship.to_person_id.in_(ids),
        )
    )
    return {rel.id: _edge(rel) for rel in result.scalars()}


async def _expand_match_bridges(
    db: AsyncSession, frontier: set[uuid.UUID], generation: dict[uuid.UUID, int]
) -> tuple[dict[uuid.UUID, GraphEdge], set[uuid.UUID]]:
    # * A match_confirmed graph_link has no regular Relationship edge — we render it as a separate pseudo-edge.
    # ** The bridge continues traversal through the matched person (same as an active marriage) — otherwise
    # ** their entire family (ancestors/descendants on the match side) never loads, only they themselves are visible.
    edges: dict[uuid.UUID, GraphEdge] = {}
    newly_bridged: set[uuid.UUID] = set()
    link_rows = await db.execute(
        select(GraphLink).where(
            GraphLink.link_type == GRAPH_LINK_TYPE_MATCH_CONFIRMED,
            (GraphLink.person_a_id.in_(frontier)) | (GraphLink.person_b_id.in_(frontier)),
        )
    )
    for link in link_rows.scalars():
        edges[link.id] = GraphEdge(
            id=link.id, from_person_id=link.person_a_id, to_person_id=link.person_b_id, type="match_confirmed"
        )
        if link.person_a_id in frontier and link.person_b_id not in generation:
            generation[link.person_b_id] = generation[link.person_a_id]
            newly_bridged.add(link.person_b_id)
        elif link.person_b_id in frontier and link.person_a_id not in generation:
            generation[link.person_a_id] = generation[link.person_b_id]
            newly_bridged.add(link.person_a_id)
    return edges, newly_bridged


async def _wave_traverse(
    db: AsyncSession, seed_ids: set[uuid.UUID], max_iterations: int | None
) -> tuple[dict[uuid.UUID, GraphEdge], dict[uuid.UUID, int]]:
    # * Shared bidirectional wave traversal of child_of + spouse_of, used both by GET /graph (bounded)
    # * and by household-graph (max_iterations=None — unbounded, so siblings/nephews get included).
    # ** Rule for spouse_of: an active marriage (marriage_end_reason IS NULL) continues traversal THROUGH
    # ** the spouse (merges their bloodline in — needed for children from a cross-graph marriage); a dissolved
    # ** marriage — the spouse is added only as a leaf, without recursing into their family.
    generation: dict[uuid.UUID, int] = {pid: 0 for pid in seed_ids}
    edges: dict[uuid.UUID, GraphEdge] = {}
    frontier = set(seed_ids)
    iterations = 0

    while frontier and (max_iterations is None or iterations < max_iterations):
        next_frontier: set[uuid.UUID] = set()

        up_rows = await db.execute(
            select(Relationship).where(
                Relationship.type == RELATIONSHIP_TYPE_CHILD_OF, Relationship.from_person_id.in_(frontier)
            )
        )
        for rel in up_rows.scalars():
            edges[rel.id] = _edge(rel)
            if rel.to_person_id not in generation:
                generation[rel.to_person_id] = generation[rel.from_person_id] + 1
                next_frontier.add(rel.to_person_id)

        down_rows = await db.execute(
            select(Relationship).where(
                Relationship.type == RELATIONSHIP_TYPE_CHILD_OF, Relationship.to_person_id.in_(frontier)
            )
        )
        for rel in down_rows.scalars():
            edges[rel.id] = _edge(rel)
            if rel.from_person_id not in generation:
                generation[rel.from_person_id] = generation[rel.to_person_id] - 1
                next_frontier.add(rel.from_person_id)

        spouse_rows = await db.execute(
            select(Relationship).where(
                Relationship.type == RELATIONSHIP_TYPE_SPOUSE_OF,
                (Relationship.from_person_id.in_(frontier)) | (Relationship.to_person_id.in_(frontier)),
            )
        )
        for rel in spouse_rows.scalars():
            edges[rel.id] = _edge(rel)
            spouse_id = None
            if rel.from_person_id in frontier and rel.to_person_id not in generation:
                spouse_id = rel.to_person_id
                generation[spouse_id] = generation[rel.from_person_id]
            elif rel.to_person_id in frontier and rel.from_person_id not in generation:
                spouse_id = rel.from_person_id
                generation[spouse_id] = generation[rel.to_person_id]
            if spouse_id is not None and rel.marriage_end_reason is None:
                next_frontier.add(spouse_id)

        bridge_edges, newly_bridged = await _expand_match_bridges(db, frontier, generation)
        edges.update(bridge_edges)
        next_frontier.update(newly_bridged)

        frontier = next_frontier
        iterations += 1

    return edges, generation


async def get_graph(db: AsyncSession, focus_person_id: uuid.UUID, depth: int, current_user: User) -> GraphResponse:
    focus = await get_person_or_404(db, focus_person_id)
    edges, generation = await _wave_traverse(db, {focus.id}, max_iterations=depth)
    persons = await _load_person_nodes(db, generation, current_user)
    return GraphResponse(focus_person_id=focus.id, persons=persons, relationships=list(edges.values()))


async def get_bloodline(db: AsyncSession, person_id: uuid.UUID, current_user: User) -> GraphResponse:
    # * Strictly the direct line (child_of), no spouses — per the definition in api-overview.md.
    focus = await get_person_or_404(db, person_id)
    ancestors = await get_ancestors_with_depth(db, focus.id)
    descendants = await get_descendants_with_depth(db, focus.id)
    generation: dict[uuid.UUID, int] = {focus.id: 0}
    for pid, d in ancestors.items():
        generation[pid] = d
    for pid, d in descendants.items():
        generation[pid] = -d
    edges = await _collect_child_of_edges(db, set(generation.keys()))
    persons = await _load_person_nodes(db, generation, current_user)
    return GraphResponse(focus_person_id=focus.id, persons=persons, relationships=list(edges.values()))


async def _graph_owner_person_ids(db: AsyncSession, owner_user_id: uuid.UUID) -> set[uuid.UUID]:
    # * All graph nodes of a given owner — needed to show even clusters that have split off
    # * from the focus node (e.g. after a relationship deletion), not just focus's connected component.
    rows = await db.execute(select(Person.id).where(Person.owner_user_id == owner_user_id))
    return set(rows.scalars())


async def get_household_graph(db: AsyncSession, person_id: uuid.UUID, current_user: User) -> GraphResponse:
    focus = await get_person_or_404(db, person_id)
    edges, generation = await _wave_traverse(db, {focus.id}, max_iterations=None)
    # ** We show the ENTIRE owner's graph, not just focus node's connected component. After
    # ** deleting a child_of relationship (DELETE /relationships) the split-off person and their whole
    # ** subtree remain in the DB and MUST stay visible — otherwise you get "dangling" invisible records.
    # ** Each remaining cluster is traversed separately; generations are computed locally, relative to
    # ** its own seed node (a split-off cluster no longer has a common reference point with focus).
    owner_person_ids = await _graph_owner_person_ids(db, focus.owner_user_id)
    remaining = owner_person_ids - set(generation.keys())
    while remaining:
        seed = next(iter(remaining))
        cluster_edges, cluster_generation = await _wave_traverse(db, {seed}, max_iterations=None)
        edges.update(cluster_edges)
        for pid, gen in cluster_generation.items():
            generation.setdefault(pid, gen)
        remaining -= set(cluster_generation.keys())
    persons = await _load_person_nodes(db, generation, current_user)
    return GraphResponse(focus_person_id=focus.id, persons=persons, relationships=list(edges.values()))


def _format_generation_label(base: str, depth: int) -> str:
    return f"{base} ({depth} поколение)" if depth == 1 else f"{base} ({depth} поколений)"


async def compute_relation_to_viewer(db: AsyncSession, target_person_id: uuid.UUID, viewer_person_id: uuid.UUID) -> str | None:
    # * Simplified structural phrasing (not the full Kazakh kinship terminology).
    # TODO: replace with a dictionary of kinship terms (nagashy/aga/іni/zhien) once there's time.
    if target_person_id == viewer_person_id:
        return "Это вы"
    ancestors = await get_ancestors_with_depth(db, viewer_person_id)
    if target_person_id in ancestors:
        return _format_generation_label("Предок", ancestors[target_person_id])
    descendants = await get_descendants_with_depth(db, viewer_person_id)
    if target_person_id in descendants:
        return _format_generation_label("Потомок", descendants[target_person_id])
    spouse_result = await db.execute(
        select(Relationship).where(
            Relationship.type == RELATIONSHIP_TYPE_SPOUSE_OF,
            ((Relationship.from_person_id == target_person_id) & (Relationship.to_person_id == viewer_person_id))
            | ((Relationship.from_person_id == viewer_person_id) & (Relationship.to_person_id == target_person_id)),
        )
    )
    if spouse_result.scalar_one_or_none() is not None:
        return "Супруг(а)"
    return None


def to_match_read(
    match: MatchCandidate, relation_path_to_viewer: str | None = None, is_blood_relative_of_viewer: bool | None = None
) -> MatchCandidateRead:
    return MatchCandidateRead(
        id=match.id,
        person_a_id=match.person_a_id,
        person_b_id=match.person_b_id,
        score=match.score,
        status=match.status,
        evidence=match.evidence,
        person_a_confirmed=match.person_a_confirmed,
        person_b_confirmed=match.person_b_confirmed,
        person_a_rejected=match.person_a_rejected,
        person_b_rejected=match.person_b_rejected,
        confirmed_at=match.confirmed_at,
        last_computed_at=match.last_computed_at,
        relation_path_to_viewer=relation_path_to_viewer,
        is_blood_relative_of_viewer=is_blood_relative_of_viewer,
    )


async def get_person_matches(db: AsyncSession, person_id: uuid.UUID) -> list[MatchCandidate]:
    await get_person_or_404(db, person_id)
    result = await db.execute(
        select(MatchCandidate)
        .where(
            (MatchCandidate.person_a_id == person_id) | (MatchCandidate.person_b_id == person_id),
            MatchCandidate.status != MATCH_STATUS_DISCARD,
        )
        .order_by(MatchCandidate.score.desc())
    )
    return list(result.scalars())


async def get_user_matches(db: AsyncSession, target_user_id: uuid.UUID) -> list[MatchCandidate]:
    # ! 404 for a nonexistent user — the absence of a LINKED node (hasn't created a tree yet), however,
    # ! remains a valid state and returns an empty list, not an error.
    await user_service.get_by_id_or_404(db, target_user_id)
    root = await get_linked_person(db, target_user_id)
    if root is None:
        return []
    household_ids = await get_full_household_person_ids(db, root.id)
    if not household_ids:
        return []
    result = await db.execute(
        select(MatchCandidate)
        .where(
            (MatchCandidate.person_a_id.in_(household_ids)) | (MatchCandidate.person_b_id.in_(household_ids)),
            MatchCandidate.status != MATCH_STATUS_DISCARD,
        )
        .order_by(MatchCandidate.score.desc())
    )
    return list(result.scalars())


async def get_person_detail(db: AsyncSession, person_id: uuid.UUID, current_user: User) -> PersonDetail:
    person = await get_person_or_404(db, person_id)
    viewer = await get_linked_person(db, current_user.id)
    relation_to_viewer = None
    if viewer is not None:
        relation_to_viewer = await compute_relation_to_viewer(db, person.id, viewer.id)
    matches = await get_person_matches(db, person.id)
    top_matches = [to_match_read(m) for m in matches[:TOP_MATCHES_LIMIT]]
    can_edit = await can_edit_person(db, current_user, person)
    return PersonDetail(
        id=person.id,
        owner_user_id=person.owner_user_id,
        linked_user_id=person.linked_user_id,
        last_name=person.last_name,
        first_name=person.first_name,
        patronymic=person.patronymic,
        gender=person.gender,
        avatar_url=person.avatar_url,
        is_alive=person.is_alive,
        birth_year_value=person.birth_year_value,
        birth_year_precision=person.birth_year_precision,
        death_year_value=person.death_year_value,
        death_year_precision=person.death_year_precision,
        death_context=person.death_context,
        birth_country=person.birth_country,
        birth_region=person.birth_region,
        ru=person.ru,
        tribe=person.tribe,
        zhuz=person.zhuz,
        ethnic_source=person.ethnic_source,
        source_type=person.source_type,
        has_attached_file=person.has_attached_file,
        file_url=person.file_url,
        description=person.description,
        confirmation_count=person.confirmation_count,
        created_at=person.created_at,
        updated_at=person.updated_at,
        relation_to_viewer=relation_to_viewer,
        chat_thread_id=None,  # * Will be populated in Stage 5 (messenger)
        top_matches=top_matches,
        can_edit=can_edit,
    )


def _blank_to_none(value: str | None) -> str | None:
    # ! "" and None must be equivalent to "not filled in" — otherwise geo_similarity/ethnic_lineage_modifier
    # ! in matching interpret an empty string differently depending on whether it's an is_not(None) or truthy check.
    return None if value == "" else value


def _build_person(
    owner_user_id: uuid.UUID,
    data: "PersonCreateRequest | PersonInsertBetweenRequest",
    origin_label: uuid.UUID | None = None,
) -> Person:
    ru = _blank_to_none(data.ru)
    tribe = _blank_to_none(data.tribe)
    zhuz = _blank_to_none(data.zhuz)
    ethnic_source = DEFAULT_ETHNIC_SOURCE
    if ru and tribe is None and zhuz is None:
        # * Auto-fill tribe/zhuz from ru (docs/matching-algorhitm.md §4) — only if the client
        # * did not explicitly specify them itself (we don't overwrite manual input).
        derived = derive_tribe_zhuz(ru)
        if derived is not None:
            tribe, zhuz = derived
            ethnic_source = ETHNIC_SOURCE_DERIVED_FROM_RU
    return Person(
        owner_user_id=owner_user_id,
        origin_label=origin_label or uuid.uuid4(),
        last_name=data.last_name,
        first_name=data.first_name,
        patronymic=data.patronymic,
        normalized_name=normalize_name(data.last_name, data.first_name, data.patronymic),
        gender=data.gender,
        avatar_url=data.avatar_url,
        is_alive=data.is_alive,
        birth_year_value=data.birth_year_value,
        birth_year_precision=data.birth_year_precision,
        death_year_value=data.death_year_value,
        death_year_precision=data.death_year_precision,
        death_context=data.death_context,
        birth_country=_blank_to_none(data.birth_country),
        birth_region=_blank_to_none(data.birth_region),
        ru=ru,
        tribe=tribe,
        zhuz=zhuz,
        ethnic_source=ethnic_source,
        source_type=data.source_type,
        has_attached_file=data.has_attached_file,
        file_url=data.file_url,
        description=data.description,
    )


async def _propagate_origin_label(db: AsyncSession, source: Person, target: Person) -> None:
    # * Union-find: recolors the entire target cluster (via child_of+spouse_of) to source cluster's origin_label.
    if source.origin_label == target.origin_label:
        return
    sql = text(
        """
        WITH RECURSIVE reachable(id) AS (
            SELECT :start_id ::uuid
            UNION
            SELECT CASE WHEN r.from_person_id = reachable.id THEN r.to_person_id ELSE r.from_person_id END
            FROM relationships r JOIN reachable ON (r.from_person_id = reachable.id OR r.to_person_id = reachable.id)
            WHERE r.type IN ('child_of', 'spouse_of')
        )
        UPDATE persons SET origin_label = :new_label WHERE id IN (SELECT id FROM reachable)
        """
    )
    await db.execute(sql, {"start_id": str(target.id), "new_label": str(source.origin_label)})
    await db.refresh(target)


async def _link_clusters(
    db: AsyncSession,
    person_a: Person,
    person_b: Person,
    link_type: str,
    source_relationship_id: uuid.UUID | None = None,
    source_match_id: uuid.UUID | None = None,
) -> GraphLink | None:
    if person_a.origin_label == person_b.origin_label:
        return None
    link = GraphLink(
        person_a_id=person_a.id,
        person_b_id=person_b.id,
        link_type=link_type,
        source_relationship_id=source_relationship_id,
        source_match_id=source_match_id,
    )
    db.add(link)
    await _propagate_origin_label(db, person_a, person_b)
    logger.info("Clusters linked: %s <-> %s (type=%s)", person_a.id, person_b.id, link_type)
    return link


async def create_person(db: AsyncSession, current_user: User, data: PersonCreateRequest) -> Person:
    if data.relation is None:
        person = _build_person(current_user.id, data)
        db.add(person)
        await db.commit()
        await db.refresh(person)
        logger.info("Person created without relation: %s (owner=%s)", person.id, current_user.id)
        return person

    target = await get_person_or_404(db, data.relation.to_person_id)
    person = await _create_person_with_relation(db, current_user, data, target)
    return person


async def _create_person_with_relation(db: AsyncSession, current_user: User, data: PersonCreateRequest, target: Person) -> Person:
    relation = data.relation

    if relation.type in ("parent", "child"):
        # * Creating a NEW person is only allowed on YOUR OWN side (even within a merged
        # * cluster) — you cannot inject new people into someone else's half of the graph, only link existing ones.
        if not await can_edit_graph(db, current_user.id, target.owner_user_id):
            raise NotPersonOwnerError()
        if relation.type == "parent":
            if await _count_parents(db, target.id) >= MAX_PARENTS_PER_PERSON:
                raise TooManyParentsError()
            person = _build_person(current_user.id, data, origin_label=target.origin_label)
            db.add(person)
            await db.flush()
            rel = Relationship(from_person_id=target.id, to_person_id=person.id, type=RELATIONSHIP_TYPE_CHILD_OF)
        else:
            person = _build_person(current_user.id, data, origin_label=target.origin_label)
            db.add(person)
            await db.flush()
            rel = Relationship(from_person_id=person.id, to_person_id=target.id, type=RELATIONSHIP_TYPE_CHILD_OF)
        db.add(rel)
        await db.commit()
        await db.refresh(person)
        logger.info("Person created with %s relation: %s -> %s", relation.type, person.id, target.id)
        return person

    # * "spouse" — the new person is always created in their own cluster before linking.
    person = _build_person(current_user.id, data)
    db.add(person)
    await db.flush()
    if await can_edit_graph(db, current_user.id, target.owner_user_id):
        rel = Relationship(
            from_person_id=person.id,
            to_person_id=target.id,
            type=RELATIONSHIP_TYPE_SPOUSE_OF,
            marriage_year=relation.marriage_year,
            marriage_end_reason=relation.marriage_end_reason,
        )
        db.add(rel)
        await db.flush()
        await _link_clusters(db, person, target, GRAPH_LINK_TYPE_MARRIAGE, source_relationship_id=rel.id)
    else:
        proposal = RelationshipProposal(
            proposer_user_id=current_user.id,
            person_a_id=person.id,
            person_b_id=target.id,
            marriage_year=relation.marriage_year,
            status=PROPOSAL_STATUS_PENDING,
        )
        db.add(proposal)
        logger.info("Marriage proposal created via person creation: %s <-> %s", person.id, target.id)
    await db.commit()
    await db.refresh(person)
    return person


async def update_person(db: AsyncSession, person: Person, current_user: User, data: dict) -> Person:
    if not await can_edit_person(db, current_user, person):
        raise NotPersonOwnerError()
    for field in ("ru", "tribe", "zhuz", "birth_country", "birth_region"):
        if field in data:
            data[field] = _blank_to_none(data[field])
    for field, value in data.items():
        setattr(person, field, value)
    if "ru" in data and "tribe" not in data and "zhuz" not in data:
        # * Auto-fill tribe/zhuz from the updated ru — only if the client is not explicitly editing them
        # * in this same request (we don't overwrite manual input).
        derived = derive_tribe_zhuz(person.ru)
        if derived is not None:
            person.tribe, person.zhuz = derived
            person.ethnic_source = ETHNIC_SOURCE_DERIVED_FROM_RU
    if data.keys() & {"last_name", "first_name", "patronymic"}:
        # ! Recomputing normalized_name is MANDATORY when editing any part of the name — otherwise the
        # ! pg_trgm index used by matching silently drifts out of sync with the node's actual data.
        person.normalized_name = normalize_name(person.last_name, person.first_name, person.patronymic)
    if data:
        db.add(PersonEditLog(person_id=person.id, changed_fields=data))
    await db.commit()
    await db.refresh(person)
    logger.info("Person updated: %s (fields=%s)", person.id, list(data.keys()))
    return person


async def get_successor_candidates(db: AsyncSession, current_user: User) -> list[User]:
    # * Living registered users linked to your graph — your own Person nodes with someone else's
    # * linked_user_id, plus already existing collaborators. Candidates for handing over graph ownership.
    linked_result = await db.execute(
        select(Person.linked_user_id).where(
            Person.owner_user_id == current_user.id,
            Person.linked_user_id.is_not(None),
            Person.linked_user_id != current_user.id,
        )
    )
    candidate_ids = {row[0] for row in linked_result.all()}
    collaborator_result = await db.execute(
        select(GraphCollaborator.collaborator_user_id).where(GraphCollaborator.graph_owner_id == current_user.id)
    )
    candidate_ids |= {row[0] for row in collaborator_result.all()}
    if not candidate_ids:
        return []
    result = await db.execute(select(User).where(User.id.in_(candidate_ids)))
    return list(result.scalars())


async def transfer_ownership(db: AsyncSession, from_user_id: uuid.UUID, to_user_id: uuid.UUID) -> None:
    # ** Everything attached to the graph OWNER moves along with the ownership, not just the nodes —
    # ** otherwise the shared family history and collaborators would be orphaned under the old owner (family
    # ** would stop showing up for family members, since they read it by the new owner_user_id).
    await db.execute(update(Person).where(Person.owner_user_id == from_user_id).values(owner_user_id=to_user_id))
    # * family.owner_user_id is unique — as a precaution we remove any possible successor record (there
    # * shouldn't be one, since they're a member of THIS graph) before the transfer, to avoid a uniqueness conflict.
    await db.execute(delete(Family).where(Family.owner_user_id == to_user_id))
    await db.execute(update(Family).where(Family.owner_user_id == from_user_id).values(owner_user_id=to_user_id))
    # * Graph collaborators also transfer to the new owner; the new owner itself cannot be its own collaborator.
    await db.execute(
        delete(GraphCollaborator).where(
            GraphCollaborator.graph_owner_id == from_user_id,
            GraphCollaborator.collaborator_user_id == to_user_id,
        )
    )
    await db.execute(
        update(GraphCollaborator).where(GraphCollaborator.graph_owner_id == from_user_id).values(graph_owner_id=to_user_id)
    )
    logger.info("Graph ownership transferred (persons+family+collaborators): %s -> %s", from_user_id, to_user_id)


async def _owns_any_person(db: AsyncSession, user_id: uuid.UUID) -> bool:
    result = await db.execute(select(func.count()).select_from(Person).where(Person.owner_user_id == user_id))
    return result.scalar_one() > 0


async def handle_account_deletion(db: AsyncSession, user: User, new_owner_user_id: uuid.UUID | None) -> None:
    # * Called BEFORE the User itself is deleted (see user.router.delete_account). Handles only the
    # * graph side: the whole point of this function is either to transfer graph ownership or let the cascade run.
    # * persons.owner_user_id -> ondelete=CASCADE: if ownership is NOT transferred here, deleting the User below
    # * will cascade-delete the entire graph (intentional behavior when there's no one to hand it to).
    # * persons.linked_user_id -> ondelete=SET NULL: the person's own node survives account deletion
    # * automatically, WITHOUT any code here — the node simply gets unlinked, the data is not lost.
    if not await _owns_any_person(db, user.id):
        return
    candidates = await get_successor_candidates(db, user)
    if not candidates:
        logger.info("User %s is sole graph owner with no successor — graph will cascade-delete with the account", user.id)
        return
    if new_owner_user_id is None:
        raise SuccessorRequiredError()
    if new_owner_user_id not in {candidate.id for candidate in candidates}:
        raise InvalidSuccessorError()
    await transfer_ownership(db, user.id, new_owner_user_id)
    logger.info("Graph ownership transferred before account deletion: %s -> %s", user.id, new_owner_user_id)


async def delete_person(
    db: AsyncSession, person: Person, current_user: User, new_owner_user_id: uuid.UUID | None = None
) -> None:
    # * A node with linked_user_id is NEVER deleted entirely — it is only unlinked (linked_user_id = NULL),
    # * genealogical data and relationships are preserved. Only a truly "not living" node is deleted with cascade.
    if not await can_edit_person(db, current_user, person):
        raise NotPersonOwnerError()

    if person.linked_user_id is None:
        await db.delete(person)
        await db.commit()
        logger.info("Person deleted: %s", person.id)
        return

    excluded_user_id = person.linked_user_id
    if excluded_user_id == current_user.id:
        # * Self-delete/self-unlink: the rest of the graph needs to be handed to someone, if there's anyone to hand it to.
        candidates = await get_successor_candidates(db, current_user)
        if candidates:
            if new_owner_user_id is None:
                raise SuccessorRequiredError()
            if new_owner_user_id not in {candidate.id for candidate in candidates}:
                raise InvalidSuccessorError()
            await transfer_ownership(db, current_user.id, new_owner_user_id)
        person.linked_user_id = None
        await db.commit()
        logger.info("Person unlinked from own account: %s", person.id)
    else:
        person.linked_user_id = None
        await db.commit()
        await notifications_service.create_notification(
            db,
            excluded_user_id,
            NOTIFICATION_TYPE_EXCLUDED_FROM_GRAPH,
            {
                "person_id": str(person.id),
                "person_display_name": build_display_name(person.last_name, person.first_name, person.patronymic),
            },
        )
        logger.info("User %s excluded from graph, person %s unlinked", excluded_user_id, person.id)


async def generate_invite_code_for_person(db: AsyncSession, person: Person, current_user: User) -> str:
    if not await can_edit_graph(db, current_user.id, person.owner_user_id):
        raise NotPersonOwnerError()
    code = generate_invite_code()
    person.invite_code = code
    await db.commit()
    logger.info("Invite code generated for person: %s", person.id)
    return code


async def link_existing_person_by_invite_code(db: AsyncSession, user: User, invite_code: str) -> Person | None:
    # * The code is NOT reset after use — exclusivity is via linked_user_id IS NULL,
    # * since the same code is also reused for marriage proposals (see create_marriage_proposal).
    result = await db.execute(select(Person).where(Person.invite_code == invite_code))
    person = result.scalar_one_or_none()
    if person is None or person.linked_user_id is not None:
        return None
    person.linked_user_id = user.id
    # * The user's OWN data takes priority over whatever the graph owner entered when creating the node —
    # * the person has just explicitly confirmed this data about themselves at registration, which outweighs
    # * the owner's guess. If a user field is empty — as before, conversely, we pull it from the node onto the account.
    # ! avatar_url is intentionally excluded here: User always has DEFAULT_AVATAR_URL set (never None),
    # ! including this field in the rule would overwrite the node's real avatar with the placeholder on every join.
    name_changed = False
    # ! birth_country is INTENTIONALLY excluded from sync: on User it's free text (e.g. "Kazakhstan"),
    # ! while on Person it's a short ISO code (VARCHAR(8), e.g. "KZ") — copying the country name into the node
    # ! crashed the join with StringDataRightTruncationError. The fields' semantics are incompatible, so we leave it alone.
    for field in ("last_name", "first_name", "patronymic", "gender", "ru", "tribe", "zhuz", "description"):
        user_value = getattr(user, field)
        if user_value is not None:
            setattr(person, field, user_value)
            if field in ("last_name", "first_name", "patronymic"):
                name_changed = True
        else:
            setattr(user, field, getattr(person, field))
    if name_changed:
        # ! Recomputing normalized_name is MANDATORY when editing the full name — otherwise matching's
        # ! pg_trgm index silently drifts out of sync with the node's actual data (same pattern as in update_person).
        person.normalized_name = normalize_name(person.last_name, person.first_name, person.patronymic)
    await db.commit()
    await db.refresh(person)
    await db.refresh(user)
    logger.info("Person %s linked to user %s via invite code", person.id, user.id)
    return person


async def create_root_person_for_user(db: AsyncSession, user: User) -> Person:
    if user.gender is None:
        raise GenderRequiredError()
    person = Person(
        owner_user_id=user.id,
        linked_user_id=user.id,
        origin_label=uuid.uuid4(),
        last_name=user.last_name,
        first_name=user.first_name,
        patronymic=user.patronymic,
        normalized_name=normalize_name(user.last_name, user.first_name, user.patronymic),
        gender=user.gender,
        avatar_url=user.avatar_url,
        is_alive=True,
        description=user.description,
    )
    db.add(person)
    await db.commit()
    await db.refresh(person)
    logger.info("Root person created for user: %s", user.id)
    return person


async def create_root_person_explicit(db: AsyncSession, user: User) -> Person:
    # * POST /graph/create — a user can only have one tree.
    if await get_linked_person(db, user.id) is not None:
        raise AlreadyHasPersonError()
    return await create_root_person_for_user(db, user)


async def join_graph_by_invite_code(db: AsyncSession, user: User, invite_code: str) -> Person:
    # * POST /graph/join — unlike the best-effort attempt at registration, an invalid code here is an explicit 404.
    if await get_linked_person(db, user.id) is not None:
        raise AlreadyHasPersonError()
    person = await link_existing_person_by_invite_code(db, user, invite_code)
    if person is None:
        raise InviteCodeNotFoundError()
    return person


async def create_relationship(db: AsyncSession, current_user: User, from_person_id: uuid.UUID, to_person_id: uuid.UUID) -> Relationship:
    if from_person_id == to_person_id:
        raise SelfRelationshipError()
    from_person = await get_person_or_404(db, from_person_id)
    to_person = await get_person_or_404(db, to_person_id)

    can_edit_both = await can_edit_graph(db, current_user.id, from_person.owner_user_id) and await can_edit_graph(
        db, current_user.id, to_person.owner_user_id
    )
    # * Within a cluster already merged by marriage/match, rights on just one side are enough —
    # * trust has already been established at the confirmed-marriage level (no need for a new propose/confirm on a child).
    can_edit_within_merged_cluster = from_person.origin_label == to_person.origin_label and (
        await can_edit_graph(db, current_user.id, from_person.owner_user_id)
        or await can_edit_graph(db, current_user.id, to_person.owner_user_id)
    )
    if not (can_edit_both or can_edit_within_merged_cluster):
        raise NotPersonOwnerError()

    existing = await db.execute(
        select(Relationship).where(
            Relationship.from_person_id == from_person.id,
            Relationship.to_person_id == to_person.id,
            Relationship.type == RELATIONSHIP_TYPE_CHILD_OF,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise DuplicateRelationshipError()

    if await _count_parents(db, from_person.id) >= MAX_PARENTS_PER_PERSON:
        raise TooManyParentsError()

    descendants = await get_descendants_with_depth(db, from_person.id)
    if to_person.id in descendants:
        raise CyclicRelationshipError()

    rel = Relationship(from_person_id=from_person.id, to_person_id=to_person.id, type=RELATIONSHIP_TYPE_CHILD_OF)
    db.add(rel)
    await db.flush()
    await _propagate_origin_label(db, source=to_person, target=from_person)
    await db.commit()
    logger.info("Relationship created: %s -> %s (child_of)", from_person.id, to_person.id)
    return rel


async def delete_relationship(db: AsyncSession, relationship_id: uuid.UUID, current_user: User) -> tuple[uuid.UUID, uuid.UUID]:
    result = await db.execute(select(Relationship).where(Relationship.id == relationship_id))
    rel = result.scalar_one_or_none()
    if rel is None:
        raise RelationshipNotFoundError()
    from_person = await get_person_or_404(db, rel.from_person_id)
    to_person = await get_person_or_404(db, rel.to_person_id)
    if not (
        await can_edit_graph(db, current_user.id, from_person.owner_user_id)
        or await can_edit_graph(db, current_user.id, to_person.owner_user_id)
    ):
        raise NotPersonOwnerError()
    await db.delete(rel)
    await db.commit()
    logger.info("Relationship deleted: %s", relationship_id)
    return from_person.id, to_person.id


async def update_relationship(db: AsyncSession, relationship_id: uuid.UUID, current_user: User, data: dict) -> Relationship:
    # * Edits marriage_year/marriage_end_reason without deleting the edge — divorce/widowhood are preserved
    # * as marriage history (needed to display the former spouse and shared child in household-graph).
    result = await db.execute(select(Relationship).where(Relationship.id == relationship_id))
    rel = result.scalar_one_or_none()
    if rel is None:
        raise RelationshipNotFoundError()
    from_person = await get_person_or_404(db, rel.from_person_id)
    to_person = await get_person_or_404(db, rel.to_person_id)
    if not (
        await can_edit_graph(db, current_user.id, from_person.owner_user_id)
        or await can_edit_graph(db, current_user.id, to_person.owner_user_id)
    ):
        raise NotPersonOwnerError()
    if data.keys() & {"marriage_year", "marriage_end_reason"} and rel.type != RELATIONSHIP_TYPE_SPOUSE_OF:
        raise RelationshipTypeMismatchError()
    for field, value in data.items():
        setattr(rel, field, value)
    await db.commit()
    await db.refresh(rel)
    logger.info("Relationship updated: %s (fields=%s)", relationship_id, list(data.keys()))
    return rel


async def insert_person_between(db: AsyncSession, current_user: User, data: PersonInsertBetweenRequest) -> Person:
    # * Inserts a new person between two ALREADY existing directly connected nodes —
    # * protection against risky cascading deletion when fixing a missing generation.
    parent = await get_person_or_404(db, data.parent_id)
    child = await get_person_or_404(db, data.child_id)
    if not (await can_edit_person(db, current_user, parent) and await can_edit_person(db, current_user, child)):
        raise NotPersonOwnerError()

    existing = await db.execute(
        select(Relationship).where(
            Relationship.from_person_id == child.id,
            Relationship.to_person_id == parent.id,
            Relationship.type == RELATIONSHIP_TYPE_CHILD_OF,
        )
    )
    old_rel = existing.scalar_one_or_none()
    if old_rel is None:
        raise NoDirectRelationshipError()

    new_person = _build_person(current_user.id, data, origin_label=parent.origin_label)
    db.add(new_person)
    await db.flush()

    await db.delete(old_rel)
    db.add(Relationship(from_person_id=child.id, to_person_id=new_person.id, type=RELATIONSHIP_TYPE_CHILD_OF))
    db.add(Relationship(from_person_id=new_person.id, to_person_id=parent.id, type=RELATIONSHIP_TYPE_CHILD_OF))

    await db.commit()
    await db.refresh(new_person)
    logger.info("Person inserted between %s and %s: %s", child.id, parent.id, new_person.id)
    return new_person


async def create_marriage_proposal(db: AsyncSession, current_user: User, data: MarriageProposalCreateRequest) -> RelationshipProposal:
    person_a = await get_person_or_404(db, data.person_a_id)
    person_b = await get_person_by_invite_code_or_404(db, data.target_invite_code)
    if person_a.id == person_b.id:
        raise SelfRelationshipError()

    can_edit_a = await can_edit_graph(db, current_user.id, person_a.owner_user_id)
    can_edit_b = await can_edit_graph(db, current_user.id, person_b.owner_user_id)
    if not (can_edit_a or can_edit_b):
        raise NotPersonOwnerError(message="You must have edit rights over at least one side of the proposed marriage")

    duplicate = await db.execute(
        select(RelationshipProposal).where(
            RelationshipProposal.status == PROPOSAL_STATUS_PENDING,
            (
                (RelationshipProposal.person_a_id == person_a.id) & (RelationshipProposal.person_b_id == person_b.id)
            )
            | (
                (RelationshipProposal.person_a_id == person_b.id) & (RelationshipProposal.person_b_id == person_a.id)
            ),
        )
    )
    if duplicate.scalar_one_or_none() is not None:
        raise DuplicateProposalError()

    existing_marriage = await db.execute(
        select(Relationship).where(
            Relationship.type == RELATIONSHIP_TYPE_SPOUSE_OF,
            (
                (Relationship.from_person_id == person_a.id) & (Relationship.to_person_id == person_b.id)
            )
            | (
                (Relationship.from_person_id == person_b.id) & (Relationship.to_person_id == person_a.id)
            ),
        )
    )
    if existing_marriage.scalar_one_or_none() is not None:
        # ! Without this check: the same pair in the same direction would crash with an IntegrityError (500) on
        # ! the edge's unique constraint, while the reverse direction would silently create a second marriage relationship.
        raise DuplicateRelationshipError()

    if can_edit_a and can_edit_b:
        rel = Relationship(
            from_person_id=person_a.id, to_person_id=person_b.id, type=RELATIONSHIP_TYPE_SPOUSE_OF, marriage_year=data.marriage_year
        )
        db.add(rel)
        await db.flush()
        await _link_clusters(db, person_a, person_b, GRAPH_LINK_TYPE_MARRIAGE, source_relationship_id=rel.id)
        proposal = RelationshipProposal(
            proposer_user_id=current_user.id,
            person_a_id=person_a.id,
            person_b_id=person_b.id,
            marriage_year=data.marriage_year,
            status=PROPOSAL_STATUS_CONFIRMED,
            resulting_relationship_id=rel.id,
            resolved_at=datetime.now(timezone.utc),
        )
    else:
        proposal = RelationshipProposal(
            proposer_user_id=current_user.id,
            person_a_id=person_a.id,
            person_b_id=person_b.id,
            marriage_year=data.marriage_year,
            status=PROPOSAL_STATUS_PENDING,
        )
    db.add(proposal)
    await db.commit()
    await db.refresh(proposal)
    logger.info("Marriage proposal created: %s (status=%s)", proposal.id, proposal.status)
    return proposal


async def get_marriage_proposal_or_404(db: AsyncSession, proposal_id: uuid.UUID) -> RelationshipProposal:
    result = await db.execute(select(RelationshipProposal).where(RelationshipProposal.id == proposal_id))
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise MarriageProposalNotFoundError()
    return proposal


async def _get_proposal_responder_person(db: AsyncSession, proposal: RelationshipProposal) -> Person:
    person_a = await get_person_or_404(db, proposal.person_a_id)
    person_b = await get_person_or_404(db, proposal.person_b_id)
    proposer_edits_a = await can_edit_graph(db, proposal.proposer_user_id, person_a.owner_user_id)
    return person_b if proposer_edits_a else person_a


async def confirm_marriage_proposal(db: AsyncSession, proposal: RelationshipProposal, current_user: User) -> RelationshipProposal:
    if proposal.status != PROPOSAL_STATUS_PENDING:
        raise ProposalAlreadyResolvedError()
    responder_person = await _get_proposal_responder_person(db, proposal)
    if not await can_edit_graph(db, current_user.id, responder_person.owner_user_id):
        raise NotProposalResponderError()

    person_a = await get_person_or_404(db, proposal.person_a_id)
    person_b = await get_person_or_404(db, proposal.person_b_id)
    rel = Relationship(
        from_person_id=person_a.id, to_person_id=person_b.id, type=RELATIONSHIP_TYPE_SPOUSE_OF, marriage_year=proposal.marriage_year
    )
    db.add(rel)
    await db.flush()
    await _link_clusters(db, person_a, person_b, GRAPH_LINK_TYPE_MARRIAGE, source_relationship_id=rel.id)
    proposal.status = PROPOSAL_STATUS_CONFIRMED
    proposal.resulting_relationship_id = rel.id
    proposal.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(proposal)
    logger.info("Marriage proposal confirmed: %s", proposal.id)
    return proposal


async def reject_marriage_proposal(db: AsyncSession, proposal: RelationshipProposal, current_user: User) -> RelationshipProposal:
    if proposal.status != PROPOSAL_STATUS_PENDING:
        raise ProposalAlreadyResolvedError()
    responder_person = await _get_proposal_responder_person(db, proposal)
    if not await can_edit_graph(db, current_user.id, responder_person.owner_user_id):
        raise NotProposalResponderError()
    proposal.status = PROPOSAL_STATUS_REJECTED
    proposal.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(proposal)
    logger.info("Marriage proposal rejected: %s", proposal.id)
    return proposal


async def list_marriage_proposals_for_user(db: AsyncSession, current_user: User) -> list[RelationshipProposal]:
    # ? Collaborator rights are not taken into account here (direct ownership only) — a simplification for
    # ? a single query without N+1; proposals to delegated graphs can be found via the owner.
    owned_ids_result = await db.execute(select(Person.id).where(Person.owner_user_id == current_user.id))
    owned_ids = {row[0] for row in owned_ids_result.all()}
    result = await db.execute(
        select(RelationshipProposal)
        .where(
            (RelationshipProposal.proposer_user_id == current_user.id)
            | (RelationshipProposal.person_a_id.in_(owned_ids))
            | (RelationshipProposal.person_b_id.in_(owned_ids))
        )
        .order_by(RelationshipProposal.created_at.desc())
    )
    return list(result.scalars())


async def get_match_or_404(db: AsyncSession, match_id: uuid.UUID) -> MatchCandidate:
    result = await db.execute(select(MatchCandidate).where(MatchCandidate.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise MatchCandidateNotFoundError()
    return match


async def confirm_match(db: AsyncSession, match: MatchCandidate, current_user: User) -> MatchCandidate:
    person_a = await get_person_or_404(db, match.person_a_id)
    person_b = await get_person_or_404(db, match.person_b_id)
    is_a_side = await can_edit_graph(db, current_user.id, person_a.owner_user_id)
    is_b_side = await can_edit_graph(db, current_user.id, person_b.owner_user_id)
    if not (is_a_side or is_b_side):
        raise NotMatchParticipantError()
    if match.confirmed_at is not None:
        raise MatchAlreadyResolvedError()
    if (is_a_side and match.person_a_rejected) or (is_b_side and match.person_b_rejected):
        # ! This same side has already rejected the match — cannot have confirmed=True and rejected=True at once.
        raise MatchAlreadyResolvedError()

    if is_a_side:
        match.person_a_confirmed = True
    if is_b_side:
        match.person_b_confirmed = True

    if match.person_a_confirmed and match.person_b_confirmed and match.confirmed_at is None:
        match.confirmed_at = datetime.now(timezone.utc)
        # ! Increment AFTER _link_clusters: _propagate_origin_label does db.refresh(target) and
        # ! wipes out unsaved changes to target's attributes if they're set before the call.
        await _link_clusters(db, person_a, person_b, GRAPH_LINK_TYPE_MATCH_CONFIRMED, source_match_id=match.id)
        person_a.confirmation_count += 1
        person_b.confirmation_count += 1

    await db.commit()
    await db.refresh(match)
    logger.info("Match confirmed side: %s (a=%s, b=%s)", match.id, match.person_a_confirmed, match.person_b_confirmed)
    return match


async def reject_match(db: AsyncSession, match: MatchCandidate, current_user: User) -> MatchCandidate:
    person_a = await get_person_or_404(db, match.person_a_id)
    person_b = await get_person_or_404(db, match.person_b_id)
    is_a_side = await can_edit_graph(db, current_user.id, person_a.owner_user_id)
    is_b_side = await can_edit_graph(db, current_user.id, person_b.owner_user_id)
    if not (is_a_side or is_b_side):
        raise NotMatchParticipantError()
    if match.confirmed_at is not None:
        raise MatchAlreadyResolvedError()
    if (is_a_side and match.person_a_confirmed) or (is_b_side and match.person_b_confirmed):
        # ! This same side has already confirmed the match — cannot have confirmed=True and rejected=True at once.
        raise MatchAlreadyResolvedError()
    if is_a_side:
        match.person_a_rejected = True
    if is_b_side:
        match.person_b_rejected = True
    await db.commit()
    await db.refresh(match)
    logger.info("Match rejected side: %s", match.id)
    return match


async def grant_collaborator(db: AsyncSession, current_user: User, person_id: uuid.UUID) -> GraphCollaborator:
    # * Only the STRICT owner (not a collaborator) can grant collaborator rights — and only
    # * through their own living registered node (a node mini-card on the frontend).
    person = await get_person_or_404(db, person_id)
    if person.owner_user_id != current_user.id:
        raise NotPersonOwnerError(message="You must own this person node to grant collaborator rights through it")
    if person.linked_user_id is None:
        raise NotLinkedPersonError()
    if person.linked_user_id == current_user.id:
        raise ConflictError(message="Cannot grant collaborator rights to yourself")
    existing = await db.execute(
        select(GraphCollaborator).where(
            GraphCollaborator.graph_owner_id == current_user.id,
            GraphCollaborator.collaborator_user_id == person.linked_user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise CollaboratorAlreadyExistsError()
    grant = GraphCollaborator(graph_owner_id=current_user.id, collaborator_user_id=person.linked_user_id)
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    logger.info("Graph collaborator granted: owner=%s collaborator=%s", current_user.id, person.linked_user_id)
    return grant


async def list_collaborators(db: AsyncSession, current_user: User) -> list[GraphCollaborator]:
    result = await db.execute(select(GraphCollaborator).where(GraphCollaborator.graph_owner_id == current_user.id))
    return list(result.scalars())


async def revoke_collaborator(db: AsyncSession, current_user: User, collaborator_user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(GraphCollaborator).where(
            GraphCollaborator.graph_owner_id == current_user.id,
            GraphCollaborator.collaborator_user_id == collaborator_user_id,
        )
    )
    grant = result.scalar_one_or_none()
    if grant is None:
        raise CollaboratorNotFoundError()
    await db.delete(grant)
    await db.commit()
    logger.info("Graph collaborator revoked: owner=%s collaborator=%s", current_user.id, collaborator_user_id)
