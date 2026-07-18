# initial: enable pg_trgm extension
#
# Revision ID: 0001_initial
# Revises:
# Create Date: 2026-07-18
#
# pg_trgm нужен алгоритму мэтчинга (Stage 1 — fuzzy name search через similarity()).
from typing import Sequence, Union

from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
