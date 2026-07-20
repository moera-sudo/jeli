# Хелперы фичи graph: нормализация имени под pg_trgm, генерация invite-кодов.
import secrets

from src.features.graph.constants import INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH


def _join_name_parts(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    return " ".join(part for part in (last_name, first_name, patronymic) if part)


def normalize_name(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    # * Единая нормализация имени для similarity() в мэтчинге — lower + strip, без токенизации.
    # * Все None (незаполненные старые записи) → "" — см. matching.service.find_candidates,
    # * где пустые normalized_name явно исключены из генерации кандидатов.
    return _join_name_parts(last_name, first_name, patronymic).strip().lower()


def build_display_name(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    # * Человекочитаемое отображаемое имя (для evidence мэтчинга, уведомлений) — без lower/strip.
    return _join_name_parts(last_name, first_name, patronymic)


def generate_invite_code() -> str:
    # * 8 символов Crockford Base32 — вручную читается/вводится без путаницы (0/O, 1/I/L).
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
