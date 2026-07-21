# Роутер фичи graph: создание/присоединение к дереву, узлы/связи графа, брак между узлами, чтение и
# подтверждение мэтчей, делегирование прав редактирования. Без общего prefix (кроме /graph/*-эндпоинтов) —
# пути прописаны явно, т.к. часть путей (/users/{id}/matches) логически принадлежит другому сегменту API.
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
    summary="Подсказка тайпа/жуза по ру",
    description=(
        "По названию ру возвращает предполагаемые тайпа (tribe) и жуз (zhuz) из справочника ru_taxonomy "
        "(точное совпадение + fuzzy-подбор). Если совпадений нет — оба поля null. Фронт использует это "
        "для автоподстановки в профиле (пользователь может изменить значения)."
    ),
)
async def suggest_ru_taxonomy(
    ru: str = Query(..., min_length=1, max_length=255, description="Название ру"),
    current_user: User = Depends(get_user),
) -> RuTaxonomySuggestion:
    derived = derive_tribe_zhuz(ru)
    if derived is None:
        return RuTaxonomySuggestion(tribe=None, zhuz=None)
    tribe, zhuz = derived
    return RuTaxonomySuggestion(tribe=tribe, zhuz=zhuz)


async def _attach_chat_thread_id(db: AsyncSession, detail: PersonDetail, current_user: User) -> PersonDetail:
    # * Только чтение — если чата ещё нет, chat_thread_id остаётся null (создаётся через POST /chats).
    if detail.linked_user_id is not None and detail.linked_user_id != current_user.id:
        detail.chat_thread_id = await messenger_service.get_existing_chat_id(
            db, current_user.id, detail.linked_user_id
        )
    return detail


@router.post(
    "/graph/create",
    response_model=PersonDetail,
    summary="Создать своё генеалогическое дерево",
    description=(
        "Создаёт корневой узел графа для текущего пользователя (используется его gender из профиля — "
        "заполните его через /users/profile/edit, если ещё не указан). У пользователя может быть только "
        "одно дерево — повторный вызов вернёт ошибку."
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
    summary="Присоединиться к существующему дереву по коду",
    description=(
        "Явное присоединение вне регистрации: находит узел по коду приглашения и привязывает его к "
        "текущему аккаунту. Копирует в профиль (gender, ru, tribe, zhuz, birth_country) те поля, что там "
        "ещё не заполнены. У пользователя может быть только одно дерево."
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
    summary="Кандидаты на передачу владения графом",
    description=(
        "Живые зарегистрированные пользователи, связанные с вашим графом (свои узлы с чужим linked_user_id "
        "+ существующие коллабораторы) — используется при удалении собственного узла, если граф нужно "
        "кому-то передать."
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
    summary="Добавить человека в генеалогическое дерево",
    description=(
        "Создаёт новый узел графа. Можно передать поле relation, чтобы сразу указать связь с "
        "существующим человеком (parent/child/spouse) — узел и связь создаются в одной транзакции. "
        "Если relation.type=spouse и найденный человек принадлежит другому владельцу — вместо прямой "
        "связи создаётся предложение брака, ожидающее подтверждения владельца второй стороны. "
        "description — свободный рассказ об этом человеке, особенно полезен для умерших предков и "
        "ещё не зарегистрированных родственников, у которых нет своего профиля, чтобы рассказать о себе."
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
    summary="Вставить человека между двумя узлами",
    description=(
        "Вставляет нового человека между двумя УЖЕ существующими напрямую связанными узлами "
        "(child_id --child_of--> parent_id) — старое ребро удаляется, создаются два новых через "
        "нового человека. Позволяет исправить пропущенное поколение без риска каскадного удаления "
        "потомков, который случился бы при удалении/пересоздании узла."
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
    summary="Получить свой собственный узел-корень",
    description="Возвращает узел графа, привязанный к текущему аккаунту (linked_user_id = вы).",
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
    summary="Получить подробную карточку человека",
    description=(
        "Возвращает полную информацию об узле графа: даты, гео, родовые признаки, степень родства "
        "относительно вас (relation_to_viewer), топ-совпадений (top_matches) и can_edit (можно ли вам "
        "редактировать этот узел). Доступно любому авторизованному пользователю — данные графа открыты "
        "для поиска родственников."
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
    summary="Дозаполнить/исправить данные о человеке",
    description=(
        "Частичное обновление узла. Доступно владельцу графа, его коллаборатору, а также самому "
        "живому человеку, если узел привязан к его аккаунту (linked_user_id). description — свободный "
        "рассказ об этом человеке, особенно полезен для умерших предков и ещё не зарегистрированных "
        "родственников, у которых нет своего профиля, чтобы рассказать о себе."
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
    summary="Удалить/отвязать узел",
    description=(
        "Если у узла есть привязанный живой аккаунт — узел НЕ удаляется, только отвязывается "
        "(linked_user_id = null), все данные и связи сохраняются. При отвязке СВОЕГО собственного узла, "
        "если с вашим графом связаны другие живые пользователи, нужно передать им владение графом через "
        "new_owner_user_id (см. GET /graph/successor-candidates) — иначе вернётся ошибка. Обычный узел "
        "без привязанного аккаунта удаляется полностью, каскадно."
    ),
)
async def delete_person(
    id: uuid.UUID,
    new_owner_user_id: uuid.UUID | None = Query(
        None, description="Кому передать владение графом при отвязке собственного узла"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> None:
    person = await graph_service.get_person_or_404(db, id)
    await graph_service.delete_person(db, person, current_user, new_owner_user_id)


@router.post(
    "/persons/{id}/invite-code",
    response_model=InviteCodeResponse,
    summary="Сгенерировать код приглашения для узла",
    description=(
        "Генерирует код, который можно передать реальному родственнику (вручную, через сторонние "
        "каналы связи) — используется и для присоединения к дереву (/graph/join, graph_invite_code при "
        "регистрации), и как таргет предложения брака (/marriage-proposals). Код не одноразовый: "
        "эксклюзивность присоединения обеспечивается тем, что узел с уже привязанным аккаунтом второй "
        "раз присоединить нельзя."
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
        "ограниченный глубиной depth поколений вверх/вниз. Если у узла есть действующий брак — обход "
        "продолжается и через супруга (его предки/потомки тоже попадают в граф); если брак расторгнут — "
        "супруг показывается только сам, без его семьи. Плюс подтверждённые мосты мэтчей."
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
    description="Только child_of-связи, строго прямая линия, без ограничения глубины — для отладки/отдельного отображения.",
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
    description=(
        "Кровная линия + сиблинги/племянники (без ограничения глубины) + супруги (при действующем браке — "
        "вместе с их предками/потомками, при расторгнутом — только сам супруг) + подтверждённые мосты мэтчей."
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
    summary="Создать кровную связь между двумя узлами",
    description=(
        "Создаёт ребро child_of между двумя уже существующими узлами. Требует прав редактирования на "
        "оба узла — либо напрямую, либо (если узлы уже в одном объединённом браком/мэтчем кластере) хотя бы "
        "на один из них. Для spouse_of используйте /marriage-proposals."
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
    summary="Изменить год/причину окончания брака",
    description=(
        "Правит marriage_year/marriage_end_reason у существующего ребра БЕЗ его удаления — развод/вдовство "
        "сохраняются как история брака, а не стираются вместе с ребром."
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
    summary="Удалить связь",
    description="Для ребра, созданного целиком по ошибке. Для развода/вдовства используйте PATCH.",
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
    summary="Предложить брак между двумя узлами",
    description=(
        "person_a_id — ваш известный узел. target_invite_code — код узла второй стороны (получен от "
        "владельца другого графа вне приложения — глобального поиска графов нет). Если оба узла "
        "редактируются текущим пользователем — брак создаётся мгновенно (статус confirmed). Если узлы "
        "принадлежат разным владельцам — создаётся предложение (pending), ожидающее подтверждения "
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
    description="Возвращает найденные алгоритмом мэтчинга совпадения с кандидатами из чужих деревьев, отсортированные по score.",
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
        "браки + подтверждённые мэтчи), найденные алгоритмом мэтчинга."
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
    description=(
        "Даёт живому зарегистрированному узлу вашего графа (person_id) право редактировать весь ваш "
        "граф наравне с вами. Узел должен принадлежать вам и быть привязан к реальному аккаунту."
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
