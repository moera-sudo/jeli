# ORM models for the graph feature: graph nodes (Person), kinship/marriage edges (Relationship),
# cross-graph bridges (GraphLink), marriage proposals (RelationshipProposal),
# match candidates (MatchCandidate, physically lives here — see the ownership decision in Stage 3),
# node edit log (PersonEditLog, groundwork for Stage 4), and rights delegation (GraphCollaborator).
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.config.database import Base
from src.features.graph.constants import (
    DEFAULT_BIRTH_YEAR_PRECISION,
    DEFAULT_DEATH_YEAR_PRECISION,
    DEFAULT_ETHNIC_SOURCE,
    DEFAULT_SOURCE_TYPE,
    PROPOSAL_STATUS_PENDING,
)


class Person(Base):
    __tablename__ = "persons"
    __table_args__ = (
        Index(
            "ix_persons_normalized_name_trgm",
            "normalized_name",
            postgresql_using="gin",
            postgresql_ops={"normalized_name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # * Who owns this branch of the tree — by default the only one who can mutate it
    # * (extended via graph_collaborators, see service.can_edit_graph).
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # * Populated once a node is confirmed to correspond to a real account (self-root or invite-code linking).
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    # * Cluster label — shared by all nodes of a branch that was originally disconnected.
    # * Recolored (union-find) on a confirmed marriage/match, see service._link_clusters.
    origin_label: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True, default=uuid.uuid4)

    # * Nullable at the DB level (legacy rows are backfilled empty, see migration 0006) — the requirement
    # * that last_name/first_name be set for NEW nodes is enforced at the schema level (PersonCreateRequest, etc.).
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # * lower+trim of last_name+first_name+patronymic — used for pg_trgm similarity() in matching.
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(16), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    is_alive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    birth_year_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birth_year_precision: Mapped[str] = mapped_column(String(32), nullable=False, default=DEFAULT_BIRTH_YEAR_PRECISION)
    death_year_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    death_year_precision: Mapped[str] = mapped_column(String(32), nullable=False, default=DEFAULT_DEATH_YEAR_PRECISION)
    death_context: Mapped[str | None] = mapped_column(String(32), nullable=True)

    birth_country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    birth_region: Mapped[str | None] = mapped_column(String(255), nullable=True)

    ru: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tribe: Mapped[str | None] = mapped_column(String(255), nullable=True)
    zhuz: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ethnic_source: Mapped[str] = mapped_column(String(32), nullable=False, default=DEFAULT_ETHNIC_SOURCE)

    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default=DEFAULT_SOURCE_TYPE)
    has_attached_file: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # * Free-form story about this person — especially important for deceased/unregistered nodes,
    # * which have no profile of their own to tell their story (see User.description).
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # * One-time code for linking a real account to this node (see POST /persons/{id}/invite-code).
    invite_code: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Relationship(Base):
    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint("from_person_id", "to_person_id", "type", name="uq_relationship_edge"),
        CheckConstraint("from_person_id != to_person_id", name="ck_relationship_no_self_loop"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # * child_of: from=child, to=parent (renamed from parent_of, same direction).
    from_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    to_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    marriage_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    marriage_end_reason: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GraphLink(Base):
    __tablename__ = "graph_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    person_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    person_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    # * "marriage" | "match_confirmed" — see constants.py
    link_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_relationship_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True
    )
    source_match_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("match_candidates.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RelationshipProposal(Base):
    __tablename__ = "relationship_proposals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    proposer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    person_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    person_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    marriage_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PROPOSAL_STATUS_PENDING)
    resulting_relationship_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MatchCandidate(Base):
    # * Physically created here (graph); populated by the matching algorithm in Stage 4 (see ownership decision).
    __tablename__ = "match_candidates"
    __table_args__ = (UniqueConstraint("person_a_id", "person_b_id", name="uq_match_candidate_pair"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    person_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    person_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    score: Mapped[float] = mapped_column(nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="discard")
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    person_a_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    person_b_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    person_a_rejected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    person_b_rejected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PersonEditLog(Base):
    # * Minimal edit log — groundwork for Stage 4 (event-driven recompute), graph only writes to it.
    __tablename__ = "person_edit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    changed_fields: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GraphCollaborator(Base):
    # * Rights delegation: graph_owner_id grants collaborator_user_id the right to edit their entire graph.
    __tablename__ = "graph_collaborators"
    __table_args__ = (UniqueConstraint("graph_owner_id", "collaborator_user_id", name="uq_graph_collaborator"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    graph_owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    collaborator_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
