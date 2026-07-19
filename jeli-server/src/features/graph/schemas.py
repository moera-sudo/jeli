# Pydantic-схемы фичи graph: узлы/рёбра графа (light+heavy), запросы на создание/правку персон и связей,
# предложения брака, чтение кандидатов в мэтчи, делегирование прав редактирования.
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Gender = Literal["male", "female"]
BirthYearPrecision = Literal["exact", "decade", "generation_estimate", "unknown"]
DeathYearPrecision = Literal["exact", "decade", "unknown"]
DeathContext = Literal["natural", "war", "repression", "unknown"]
SourceType = Literal["oral_tradition", "family_document", "photo", "archival_record"]
EthnicSource = Literal["derived_from_ru", "manual_tribe_only", "manual_zhuz_only", "none"]
MarriageEndReason = Literal["divorce", "widowed"]
ProposalStatus = Literal["pending", "confirmed", "rejected"]
MatchStatus = Literal["high_confidence", "possible_match", "discard"]
GraphEdgeType = Literal["child_of", "spouse_of", "match_confirmed"]
RelationInputType = Literal["parent", "child", "spouse"]


class PersonNode(BaseModel):
    # * Лёгкая версия узла — GET /graph, GET /persons/{id}/bloodline, /household-graph.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    gender: Gender
    avatar_url: str | None
    generation: int
    birth_year: int | None
    death_year: int | None
    is_alive: bool
    is_registered: bool
    can_chat: bool
    has_more_ancestors: bool


class GraphEdge(BaseModel):
    # * Общее ребро для persons[]/relationships[] — покрывает и Relationship, и match_confirmed graph_link.
    id: uuid.UUID
    from_person_id: uuid.UUID
    to_person_id: uuid.UUID
    type: GraphEdgeType


class GraphResponse(BaseModel):
    focus_person_id: uuid.UUID
    persons: list[PersonNode]
    relationships: list[GraphEdge]


class MatchCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    person_a_id: uuid.UUID
    person_b_id: uuid.UUID
    score: float
    status: MatchStatus
    evidence: dict
    person_a_confirmed: bool
    person_b_confirmed: bool
    person_a_rejected: bool
    person_b_rejected: bool
    confirmed_at: datetime | None
    last_computed_at: datetime | None
    # * Не колонки БД — считаются относительно viewer'а в service.get_person_matches/get_user_matches.
    relation_path_to_viewer: str | None = None
    is_blood_relative_of_viewer: bool | None = None


class PersonDetail(BaseModel):
    # * Тяжёлая версия — GET /persons/{id}.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    linked_user_id: uuid.UUID | None
    full_name: str
    gender: Gender
    avatar_url: str | None
    is_alive: bool
    birth_year_value: int | None
    birth_year_precision: BirthYearPrecision
    death_year_value: int | None
    death_year_precision: DeathYearPrecision
    death_context: DeathContext | None
    birth_country: str | None
    birth_region: str | None
    ru: str | None
    tribe: str | None
    zhuz: str | None
    ethnic_source: EthnicSource
    source_type: SourceType
    has_attached_file: bool
    file_url: str | None
    confirmation_count: int
    created_at: datetime
    updated_at: datetime
    # * Вычисляемые поля — проставляются вручную в service.get_person_detail, не колонки модели.
    relation_to_viewer: str | None
    chat_thread_id: uuid.UUID | None
    top_matches: list[MatchCandidateRead]


class PersonRelationInput(BaseModel):
    # * type читается ОТНОСИТЕЛЬНО to_person_id: "parent" — новый узел станет родителем to_person_id,
    # * "child" — новый узел станет ребёнком to_person_id, "spouse" — новый узел станет супругом to_person_id.
    to_person_id: uuid.UUID
    type: RelationInputType
    marriage_year: int | None = None
    marriage_end_reason: MarriageEndReason | None = None


class PersonCreateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    gender: Gender
    avatar_url: str | None = None
    is_alive: bool = True
    birth_year_value: int | None = None
    birth_year_precision: BirthYearPrecision = "unknown"
    death_year_value: int | None = None
    death_year_precision: DeathYearPrecision = "unknown"
    death_context: DeathContext | None = None
    birth_country: str | None = None
    birth_region: str | None = None
    ru: str | None = None
    tribe: str | None = None
    zhuz: str | None = None
    source_type: SourceType = "oral_tradition"
    has_attached_file: bool = False
    file_url: str | None = None
    relation: PersonRelationInput | None = None


class PersonUpdateRequest(BaseModel):
    # * Все поля опциональны, паттерн exclude_unset как в user.ProfileUpdateRequest.
    full_name: str | None = None
    gender: Gender | None = None
    avatar_url: str | None = None
    is_alive: bool | None = None
    birth_year_value: int | None = None
    birth_year_precision: BirthYearPrecision | None = None
    death_year_value: int | None = None
    death_year_precision: DeathYearPrecision | None = None
    death_context: DeathContext | None = None
    birth_country: str | None = None
    birth_region: str | None = None
    ru: str | None = None
    tribe: str | None = None
    zhuz: str | None = None
    ethnic_source: EthnicSource | None = None
    source_type: SourceType | None = None
    has_attached_file: bool | None = None
    file_url: str | None = None


class RelationshipCreateRequest(BaseModel):
    # * spouse_of сюда не принимается — см. exceptions.SpouseRelationshipNotAllowedError.
    from_person_id: uuid.UUID
    to_person_id: uuid.UUID
    type: Literal["child_of"] = "child_of"


class RelationshipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_person_id: uuid.UUID
    to_person_id: uuid.UUID
    type: str
    marriage_year: int | None
    marriage_end_reason: str | None
    created_at: datetime


class MarriageProposalCreateRequest(BaseModel):
    person_a_id: uuid.UUID
    person_b_id: uuid.UUID
    marriage_year: int | None = None


class RelationshipProposalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    proposer_user_id: uuid.UUID
    person_a_id: uuid.UUID
    person_b_id: uuid.UUID
    marriage_year: int | None
    status: ProposalStatus
    resulting_relationship_id: uuid.UUID | None
    created_at: datetime
    resolved_at: datetime | None


class InviteCodeResponse(BaseModel):
    invite_code: str


class CollaboratorGrantRequest(BaseModel):
    # * Приглашаем коллаборатора по email — не всем известны чужие user_id.
    collaborator_email: EmailStr


class CollaboratorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    graph_owner_id: uuid.UUID
    collaborator_user_id: uuid.UUID
    created_at: datetime
