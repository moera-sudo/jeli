# Роутер фичи graph: узлы/связи графа, брак между узлами, чтение и подтверждение мэтчей,
# делегирование прав редактирования. Без общего prefix — пути прописаны явно на каждом эндпоинте,
# т.к. часть путей (/users/{id}/matches) логически принадлежит другому сегменту API.
import logging
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.graph import service as graph_service
from src.features.graph.constants import DEFAULT_GRAPH_DEPTH, MAX_GRAPH_DEPTH
from src.features.graph.schemas import (
    CollaboratorGrantRequest,
    CollaboratorRead,
    GraphResponse,
    InviteCodeResponse,
    MarriageProposalCreateRequest,
    MatchCandidateRead,
    PersonCreateRequest,
    PersonDetail,
    PersonUpdateRequest,
    RelationshipCreateRequest,
    RelationshipProposalRead,
    RelationshipRead,
)
from src.features.user.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["graph"])


@router.post(
    "/persons",
    response_model=PersonDetail,
    summary="Добавить человека в генеалогическое дерево",
    description=(
        "Создаёт новый узел графа. Можно передать поле relation, чтобы сразу указать связь с "
        "существующим человеком (parent/child/spouse) — узел и связь создаются в одной транзакции. "
        "Если relation.type=spouse и найденный человек принадлежит другому владельцу — вместо прямой "
        "связи создаётся предложение брака, ожидающее подтверждения владельца второй стороны."
    ),
)
async def create_person(
    payload: PersonCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    logger.info("Create person request received by user %s", current_user.id)
    person = await graph_service.create_person(db, current_user, payload)
    return await graph_service.get_person_detail(db, person.id, current_user)


@router.get(
    "/persons/me",
    response_model=PersonDetail,
    summary="Получить свой собственный узел-корень",
    description="Возвращает узел графа, привязанный к текущему аккаунту (linked_user_id = вы).",
)
async def get_my_person(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_linked_person_or_404(db, current_user.id)
    return await graph_service.get_person_detail(db, person.id, current_user)


@router.get(
    "/persons/{id}",
    response_model=PersonDetail,
    summary="Получить подробную карточку человека",
    description=(
        "Возвращает полную информацию об узле графа: даты, гео, родовые признаки, степень родства "
        "относительно вас (relation_to_viewer) и топ-совпадений (top_matches). Доступно любому "
        "авторизованному пользователю — данные графа открыты для поиска родственников."
    ),
)
async def get_person(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    return await graph_service.get_person_detail(db, id, current_user)


@router.patch(
    "/persons/{id}",
    response_model=PersonDetail,
    summary="Дозаполнить/исправить данные о человеке",
    description="Частичное обновление узла. Доступно только владельцу графа или его коллаборатору.",
)
async def update_person(
    id: uuid.UUID,
    payload: PersonUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> PersonDetail:
    person = await graph_service.get_person_or_404(db, id)
    data = payload.model_dump(exclude_unset=True)
    await graph_service.update_person(db, person, current_user, data)
    return await graph_service.get_person_detail(db, id, current_user)


@router.delete(
    "/persons/{id}",
    status_code=204,
    summary="Удалить узел",
    description=(
        "Удаляет узел графа вместе со всеми связями, предложениями брака и мэтчами, которые на него "
        "ссылались (каскадно). Доступно только владельцу графа или его коллаборатору."
    ),
)
async def delete_person(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    person = await graph_service.get_person_or_404(db, id)
    await graph_service.delete_person(db, person, current_user)


@router.post(
    "/persons/{id}/invite-code",
    response_model=InviteCodeResponse,
    summary="Сгенерировать код приглашения для узла",
    description=(
        "Генерирует одноразовый код, который можно передать реальному родственнику — при регистрации "
        "с этим кодом (graph_invite_code) его аккаунт будет привязан именно к этому узлу графа."
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
    summary="Получить облегчённый граф вокруг узла",
    description=(
        "Возвращает плоские persons[]/relationships[] вокруг focus-узла (формат для React Flow), "
        "ограниченный глубиной depth поколений вверх/вниз + супруги (1 affinal hop) + подтверждённые "
        "мосты браков/мэтчей."
    ),
)
async def get_graph(
    focus: uuid.UUID = Query(..., description="ID узла, вокруг которого строится граф"),
    depth: int = Query(DEFAULT_GRAPH_DEPTH, ge=1, le=MAX_GRAPH_DEPTH, description="Глубина обхода в поколениях"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> GraphResponse:
    return await graph_service.get_graph(db, focus, depth, current_user)


@router.get(
    "/persons/{id}/bloodline",
    response_model=GraphResponse,
    summary="Кровная цепочка предков и потомков",
    description="Только child_of-связи, без ограничения глубины — для отладки/отдельного отображения.",
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
    summary="Объединённый граф для отображения",
    description="Кровная линия + супруги + подтверждённые мосты браков/мэтчей, без ограничения глубины.",
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
    summary="Создать кровную связь между двумя узлами",
    description=(
        "Создаёт ребро child_of между двумя уже существующими узлами. Оба узла должны редактироваться "
        "текущим пользователем (владелец или коллаборатор). Для spouse_of используйте /marriage-proposals."
    ),
)
async def create_relationship(
    payload: RelationshipCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> RelationshipRead:
    rel = await graph_service.create_relationship(db, current_user, payload.from_person_id, payload.to_person_id)
    return RelationshipRead.model_validate(rel)


@router.delete(
    "/relationships/{id}",
    status_code=204,
    summary="Удалить связь",
    description="Например, развод — не затрагивает кровную линию потомков.",
)
async def delete_relationship(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    await graph_service.delete_relationship(db, id, current_user)


@router.post(
    "/marriage-proposals",
    response_model=RelationshipProposalRead,
    summary="Предложить брак между двумя узлами",
    description=(
        "Явно указываете person_a_id и person_b_id (без поиска по имени — чтобы не перепутать тёзок). "
        "Если оба узла редактируются текущим пользователем — брак создаётся мгновенно (статус confirmed). "
        "Если узлы принадлежат разным владельцам — создаётся предложение (pending), ожидающее подтверждения "
        "владельца второй стороны."
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
    summary="Список предложений брака",
    description="Входящие и исходящие предложения, где вы — инициатор либо владелец одной из сторон.",
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
    summary="Детали предложения брака",
    description="Возвращает статус, участников и результат (если уже подтверждено/отклонено).",
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
    summary="Подтвердить предложение брака",
    description="Доступно только владельцу (или коллаборатору) второй стороны предложения.",
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
    summary="Отклонить предложение брака",
    description="Доступно только владельцу (или коллаборатору) второй стороны предложения.",
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
    summary="Мэтчи по кровной линии узла",
    description="Пока не работает алгоритм мэтчинга (Этап 4) — всегда возвращает пустой список.",
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
    summary="Все мэтчи по расширенному графу пользователя",
    description=(
        "Главный эндпоинт для UI: агрегирует мэтчи по всему household-графу пользователя (кровь + "
        "браки + подтверждённые мэтчи). Пока не работает алгоритм мэтчинга (Этап 4) — пустой список."
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
    summary="Подтвердить совпадение со своей стороны",
    description=(
        "Подтверждает мэтч со стороны узла, который вы редактируете (владелец/коллаборатор). "
        "При обоюдном подтверждении создаётся мост graph_link(match_confirmed), объединяющий "
        "отображение графов, без физического слияния записей."
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
    summary="Отклонить предложенное совпадение",
    description="Отклоняет мэтч со стороны узла, который вы редактируете (владелец/коллаборатор).",
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
    summary="Делегировать права редактирования своего графа",
    description="Даёт другому пользователю (по email) право редактировать весь ваш граф наравне с вами.",
)
async def grant_collaborator(
    payload: CollaboratorGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> CollaboratorRead:
    grant = await graph_service.grant_collaborator(db, current_user, payload.collaborator_email)
    return CollaboratorRead.model_validate(grant)


@router.get(
    "/graph/collaborators",
    response_model=list[CollaboratorRead],
    summary="Список коллабораторов вашего графа",
    description="Кому вы делегировали права редактирования своего графа.",
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
    summary="Отозвать права коллаборатора",
    description="Убирает у указанного пользователя право редактировать ваш граф.",
)
async def revoke_collaborator(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    await graph_service.revoke_collaborator(db, current_user, user_id)
