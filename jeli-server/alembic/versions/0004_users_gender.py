# users table: добавлено поле gender (nullable, заполняется через профиль после регистрации)
#
# Revision ID: 0004_users_gender
# Revises: 0003_graph_tables
# Create Date: 2026-07-19
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_users_gender"
down_revision: Union[str, None] = "0003_graph_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("gender", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "gender")
