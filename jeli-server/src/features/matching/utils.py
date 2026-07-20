# Чистые функции скоринга алгоритма мэтчинга (без обращения к БД) — см. docs/matching-algorhitm.md.
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from src.features.graph.models import Person
from src.features.matching.constants import (
    CHAIN_LENGTH_MULTIPLIER,
    COMMON_KAZAKH_FIRST_NAMES,
    MIGRATION_PLAUSIBILITY,
    MIGRATION_PLAUSIBILITY_DEFAULT,
    RU_BONUS,
    SIBLING_BONUS,
    SOURCE_TRUST,
)


@dataclass
class NodeMatch:
    # * gen=0 — сама пара-кандидат из Stage 1 (person, candidate целиком), gen>0 — предки на уровне gen.
    person_a: Person
    person_b: Person
    gen: int
    confidence: float
    sibling_count: int = field(default=1)  # * сколько confident-пар нашлось на этом же уровне поколения


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def normalized_name_similarity(name_a: str, name_b: str) -> float:
    return fuzz.ratio(name_a, name_b) / 100.0


def name_rarity_score(first_name: str, count: int) -> float:
    # * count — сколько ДРУГИХ persons в базе имеют то же normalized_name (без self).
    # ! На маленькой БД объективно частое имя может иметь count=0 и ошибочно выглядеть уникальным —
    # ! COMMON_KAZAKH_FIRST_NAMES подстраховывает верхнюю границу для таких имён вне зависимости от БД.
    if first_name.strip().lower() in COMMON_KAZAKH_FIRST_NAMES:
        return min(0.4, _count_based_rarity(count))
    return _count_based_rarity(count)


def _count_based_rarity(count: int) -> float:
    if count == 0:
        return 1.0
    if count <= 2:
        return 0.7
    if count <= 9:
        return 0.4
    return 0.15


def geo_similarity(a: Person, b: Person) -> float:
    if a.birth_country is None or b.birth_country is None:
        return 0.5
    if a.birth_country == b.birth_country:
        return 1.0 if a.birth_region == b.birth_region else 0.8
    return MIGRATION_PLAUSIBILITY.get((a.birth_country, b.birth_country), MIGRATION_PLAUSIBILITY_DEFAULT)


def generation_plausibility(gen_a: int, gen_b: int) -> float:
    diff = abs(gen_a - gen_b)
    return {0: 1.0, 1: 0.7, 2: 0.3}.get(diff, 0.05)


def gen_offset_score(a: Person, b: Person, gen_a: int, gen_b: int) -> float:
    # * Структурная глубина в графе — основной сигнал (бесплатный, всегда доступен). Дата рождения —
    # * опциональное уточнение поверх, если известна у обоих узлов.
    structural = generation_plausibility(gen_a, gen_b)
    if a.birth_year_value and b.birth_year_value:
        year_diff = abs(a.birth_year_value - b.birth_year_value)
        year_score = 1.0 if year_diff <= 10 else max(0.0, 1 - (year_diff - 10) / 40)
        return structural * 0.5 + year_score * 0.5
    return structural


def ethnic_lineage_modifier(a: Person, b: Person) -> float:
    if a.ru and b.ru:
        if a.ru == b.ru:
            return 0.20
        if a.tribe and b.tribe and a.tribe == b.tribe:
            return 0.05
        if a.zhuz and b.zhuz and a.zhuz == b.zhuz:
            return -0.15
        return -0.35
    if a.tribe and b.tribe:
        if a.tribe == b.tribe:
            return 0.10
        if a.zhuz and b.zhuz and a.zhuz == b.zhuz:
            return -0.15
        return -0.35
    if a.zhuz and b.zhuz:
        return 0.03 if a.zhuz == b.zhuz else -0.35
    return 0.0


def node_confidence(a: Person, b: Person, gen_a: int, gen_b: int, name_rarity_count: int) -> float:
    # ! Вызывающая сторона ОБЯЗАНА проверить a.gender == b.gender до вызова (hard reject вне скоринга).
    name_sim = normalized_name_similarity(a.normalized_name, b.normalized_name)
    rarity = name_rarity_score(a.first_name or "", name_rarity_count)
    geo = geo_similarity(a, b)
    gen_plausibility = gen_offset_score(a, b, gen_a, gen_b)
    ethnic_mod = ethnic_lineage_modifier(a, b)
    base = name_sim * 0.38 + rarity * 0.24 + geo * 0.18 + gen_plausibility * 0.13
    return _clamp(base + ethnic_mod * 0.07)


def longest_continuous_chain(node_matches: list[NodeMatch]) -> int:
    gens = {m.gen for m in node_matches}
    length = 0
    while length in gens:
        length += 1
    return length


def has_sibling_match(node_matches: list[NodeMatch]) -> bool:
    return any(m.gen != 0 and m.sibling_count > 1 for m in node_matches)


def known_fields_ratio(node_matches: list[NodeMatch]) -> float:
    fields = ("birth_year_value", "birth_country", "birth_region", "ru", "tribe", "zhuz")
    if not node_matches:
        return 0.0
    total_slots = len(node_matches) * len(fields) * 2
    filled = 0
    for m in node_matches:
        for f in fields:
            if getattr(m.person_a, f) is not None:
                filled += 1
            if getattr(m.person_b, f) is not None:
                filled += 1
    return filled / total_slots


def chain_score(node_matches: list[NodeMatch]) -> float:
    if not node_matches:
        return 0.0
    avg_conf = sum(m.confidence for m in node_matches) / len(node_matches)
    chain_length = longest_continuous_chain(node_matches)
    length_multiplier = CHAIN_LENGTH_MULTIPLIER.get(min(chain_length, 4), 1.0)
    sibling_bonus = SIBLING_BONUS if has_sibling_match(node_matches) else 0.0
    completeness_factor = 0.6 + 0.4 * known_fields_ratio(node_matches)
    return _clamp((avg_conf * length_multiplier + sibling_bonus) * completeness_factor)


def same_ru(a: Person, b: Person) -> bool:
    return bool(a.ru) and bool(b.ru) and a.ru == b.ru


def final_match_score(chain_score_value: float, person_a: Person, person_b: Person) -> float:
    source_factor = (SOURCE_TRUST[person_a.source_type] + SOURCE_TRUST[person_b.source_type]) / 2
    ru_bonus = RU_BONUS if same_ru(person_a, person_b) else 0.0
    shared_confirmation_count = min(person_a.confirmation_count, person_b.confirmation_count)
    confirmation_multiplier = 1 + min(0.1, 0.02 * shared_confirmation_count)
    score = chain_score_value * (0.7 + 0.3 * source_factor) + ru_bonus
    return _clamp(score * confirmation_multiplier)
