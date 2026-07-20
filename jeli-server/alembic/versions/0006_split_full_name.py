# users/persons: full_name разделён на last_name/first_name/patronymic — единая колонка целиком
# ломала парсинг ФИО на фронтенде (многословные фамилии), а не разделять поля с самого начала
# было архитектурной ошибкой. Бэкфилл для существующих строк — NULL (см. решение в диалоге).
#
# Revision ID: 0006_split_full_name
# Revises: 0005_notifications_table
# Create Date: 2026-07-20
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_split_full_name"
down_revision: Union[str, None] = "0005_notifications_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("users", "persons"):
        op.add_column(table, sa.Column("last_name", sa.String(length=255), nullable=True))
        op.add_column(table, sa.Column("first_name", sa.String(length=255), nullable=True))
        op.add_column(table, sa.Column("patronymic", sa.String(length=255), nullable=True))
        op.drop_column(table, "full_name")


def downgrade() -> None:
    # ! Лоссовый даунгрейд: old full_name не восстановить из частей для строк, где имя уже разошлось
    # ! по last_name/first_name/patronymic — колонка возвращается пустой (nullable).
    for table in ("users", "persons"):
        op.add_column(table, sa.Column("full_name", sa.String(length=255), nullable=True))
        op.drop_column(table, "patronymic")
        op.drop_column(table, "first_name")
        op.drop_column(table, "last_name")
