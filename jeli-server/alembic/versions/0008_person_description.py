# persons table: добавлено поле description (nullable) — свободный рассказ о человеке, особенно
# важен для умерших/незарегистрированных узлов без собственного профиля.
#
# Revision ID: 0008_person_description
# Revises: 0007_media_messenger_family
# Create Date: 2026-07-21
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_person_description"
down_revision: Union[str, None] = "0007_media_messenger_family"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("persons", "description")
