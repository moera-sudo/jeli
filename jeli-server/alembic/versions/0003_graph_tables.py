# graph feature tables: persons, relationships, match_candidates, graph_links,
# relationship_proposals, person_edit_logs, graph_collaborators
#
# Revision ID: 0003_graph_tables
# Revises: 0002_users_table
# Create Date: 2026-07-19
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_graph_tables"
down_revision: Union[str, None] = "0002_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "persons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("linked_user_id", sa.Uuid(), nullable=True),
        sa.Column("origin_label", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("gender", sa.String(length=16), nullable=False),
        sa.Column("avatar_url", sa.String(length=1024), nullable=True),
        sa.Column("is_alive", sa.Boolean(), nullable=False),
        sa.Column("birth_year_value", sa.Integer(), nullable=True),
        sa.Column("birth_year_precision", sa.String(length=32), nullable=False),
        sa.Column("death_year_value", sa.Integer(), nullable=True),
        sa.Column("death_year_precision", sa.String(length=32), nullable=False),
        sa.Column("death_context", sa.String(length=32), nullable=True),
        sa.Column("birth_country", sa.String(length=8), nullable=True),
        sa.Column("birth_region", sa.String(length=255), nullable=True),
        sa.Column("ru", sa.String(length=255), nullable=True),
        sa.Column("tribe", sa.String(length=255), nullable=True),
        sa.Column("zhuz", sa.String(length=255), nullable=True),
        sa.Column("ethnic_source", sa.String(length=32), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("has_attached_file", sa.Boolean(), nullable=False),
        sa.Column("file_url", sa.String(length=1024), nullable=True),
        sa.Column("confirmation_count", sa.Integer(), nullable=False),
        sa.Column("invite_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("linked_user_id"),
        sa.UniqueConstraint("invite_code"),
    )
    op.create_index("ix_persons_owner_user_id", "persons", ["owner_user_id"])
    op.create_index("ix_persons_origin_label", "persons", ["origin_label"])
    op.create_index("ix_persons_invite_code", "persons", ["invite_code"])
    op.execute(
        "CREATE INDEX ix_persons_normalized_name_trgm ON persons USING gin (normalized_name gin_trgm_ops)"
    )

    op.create_table(
        "relationships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("from_person_id", sa.Uuid(), nullable=False),
        sa.Column("to_person_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("marriage_year", sa.Integer(), nullable=True),
        sa.Column("marriage_end_reason", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["from_person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("from_person_id", "to_person_id", "type", name="uq_relationship_edge"),
        sa.CheckConstraint("from_person_id != to_person_id", name="ck_relationship_no_self_loop"),
    )
    op.create_index("ix_relationships_from_person_id", "relationships", ["from_person_id"])
    op.create_index("ix_relationships_to_person_id", "relationships", ["to_person_id"])

    op.create_table(
        "match_candidates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("person_a_id", sa.Uuid(), nullable=False),
        sa.Column("person_b_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=False),
        sa.Column("person_a_confirmed", sa.Boolean(), nullable=False),
        sa.Column("person_b_confirmed", sa.Boolean(), nullable=False),
        sa.Column("person_a_rejected", sa.Boolean(), nullable=False),
        sa.Column("person_b_rejected", sa.Boolean(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["person_a_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_b_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_a_id", "person_b_id", name="uq_match_candidate_pair"),
    )
    op.create_index("ix_match_candidates_person_a_id", "match_candidates", ["person_a_id"])
    op.create_index("ix_match_candidates_person_b_id", "match_candidates", ["person_b_id"])

    op.create_table(
        "graph_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("person_a_id", sa.Uuid(), nullable=False),
        sa.Column("person_b_id", sa.Uuid(), nullable=False),
        sa.Column("link_type", sa.String(length=32), nullable=False),
        sa.Column("source_relationship_id", sa.Uuid(), nullable=True),
        sa.Column("source_match_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["person_a_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_b_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_relationship_id"], ["relationships.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_match_id"], ["match_candidates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_graph_links_person_a_id", "graph_links", ["person_a_id"])
    op.create_index("ix_graph_links_person_b_id", "graph_links", ["person_b_id"])

    op.create_table(
        "relationship_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposer_user_id", sa.Uuid(), nullable=False),
        sa.Column("person_a_id", sa.Uuid(), nullable=False),
        sa.Column("person_b_id", sa.Uuid(), nullable=False),
        sa.Column("marriage_year", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("resulting_relationship_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["proposer_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_a_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_b_id"], ["persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resulting_relationship_id"], ["relationships.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_relationship_proposals_proposer_user_id", "relationship_proposals", ["proposer_user_id"])
    op.create_index("ix_relationship_proposals_person_a_id", "relationship_proposals", ["person_a_id"])
    op.create_index("ix_relationship_proposals_person_b_id", "relationship_proposals", ["person_b_id"])

    op.create_table(
        "person_edit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("changed_fields", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_person_edit_logs_person_id", "person_edit_logs", ["person_id"])

    op.create_table(
        "graph_collaborators",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("graph_owner_id", sa.Uuid(), nullable=False),
        sa.Column("collaborator_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["graph_owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["collaborator_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("graph_owner_id", "collaborator_user_id", name="uq_graph_collaborator"),
    )
    op.create_index("ix_graph_collaborators_graph_owner_id", "graph_collaborators", ["graph_owner_id"])
    op.create_index("ix_graph_collaborators_collaborator_user_id", "graph_collaborators", ["collaborator_user_id"])


def downgrade() -> None:
    op.drop_table("graph_collaborators")
    op.drop_table("person_edit_logs")
    op.drop_table("relationship_proposals")
    op.drop_table("graph_links")
    op.drop_table("match_candidates")
    op.drop_table("relationships")
    op.drop_index("ix_persons_normalized_name_trgm", table_name="persons")
    op.drop_index("ix_persons_invite_code", table_name="persons")
    op.drop_index("ix_persons_origin_label", table_name="persons")
    op.drop_index("ix_persons_owner_user_id", table_name="persons")
    op.drop_table("persons")
