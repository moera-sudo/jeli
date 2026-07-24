# Helpers for the graph feature: name normalization for pg_trgm, invite code generation.
import secrets

from src.features.graph.constants import INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH


def _join_name_parts(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    return " ".join(part for part in (last_name, first_name, patronymic) if part)


def normalize_name(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    # * Unified name normalization for similarity() in matching — lower + strip, no tokenization.
    # * All None (unfilled legacy records) → "" — see matching.service.find_candidates,
    # * where empty normalized_name is explicitly excluded from candidate generation.
    return _join_name_parts(last_name, first_name, patronymic).strip().lower()


def build_display_name(last_name: str | None, first_name: str | None, patronymic: str | None) -> str:
    # * Human-readable display name (for matching evidence, notifications) — no lower/strip.
    return _join_name_parts(last_name, first_name, patronymic)


def generate_invite_code() -> str:
    # * 8 characters of Crockford Base32 — readable/enterable by hand without confusion (0/O, 1/I/L).
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
