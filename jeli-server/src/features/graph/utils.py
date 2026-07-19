# Хелперы фичи graph: нормализация имени под pg_trgm, генерация invite-кодов.
import secrets

from src.features.graph.constants import INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH


def normalize_name(full_name: str) -> str:
    # * Единая нормализация имени для similarity() в Этапе 4 — lower + strip, без токенизации.
    return full_name.strip().lower()


def generate_invite_code() -> str:
    # * 8 символов Crockford Base32 — вручную читается/вводится без путаницы (0/O, 1/I/L).
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
