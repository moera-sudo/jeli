# Хелперы фичи graph: нормализация имени под pg_trgm, генерация invite-кодов.
import secrets

from src.features.graph.constants import INVITE_CODE_BYTES


def normalize_name(full_name: str) -> str:
    # * Единая нормализация имени для similarity() в Этапе 4 — lower + strip, без токенизации.
    return full_name.strip().lower()


def generate_invite_code() -> str:
    return secrets.token_urlsafe(INVITE_CODE_BYTES)
