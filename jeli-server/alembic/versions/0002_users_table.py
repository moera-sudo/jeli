# users table: аккаунт + личный профиль пользователя
#
# Revision ID: 0002_users_table
# Revises: 0001_initial
# Create Date: 2026-07-18
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_users_table"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("avatar_url", sa.String(length=1024), nullable=False),
        sa.Column("current_city", sa.String(length=255), nullable=True),
        sa.Column("current_country", sa.String(length=255), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("birth_city", sa.String(length=255), nullable=True),
        sa.Column("birth_country", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("nationality", sa.String(length=255), nullable=True),
        sa.Column("ru", sa.String(length=255), nullable=True),
        sa.Column("zhuz", sa.String(length=255), nullable=True),
        sa.Column("tribe", sa.String(length=255), nullable=True),
        sa.Column("graph_invite_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
