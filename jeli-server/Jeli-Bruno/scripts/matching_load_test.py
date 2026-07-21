"""Нагрузочный/точностный тест алгоритма мэтчинга (src/features/matching/).

ЗАЧЕМ. Алгоритм раньше проверялся только на игрушечном 2-поколенном сценарии
(Jeli-Bruno/scenario/, два общих предка). Этот скрипт строит ~20 независимых деревьев по 5
ПОЛНОСТЬЮ заполненных поколений предков (полное бинарное дерево — оба родителя на каждом уровне,
63 узла на дерево) через РЕАЛЬНЫЙ HTTP API (тот же путь, что и настоящий пользователь: register ->
gender -> /graph/create -> /persons с relation), подсаживает ~10 заведомо известных пар "общий
предок в двух разных деревьях" и считает precision/recall/F1 по найденным MatchCandidate.

ВАЖНО про подсадку: копирование ОДНОГО узла даёт chain_length=1 -> length_multiplier=0.35 ->
почти гарантированный discard, а не матч (см. matching/utils.chain_score). Поэтому подсаживается
весь ПРЕДКОВЫЙ КОНУС (узел + все его предки вплоть до 5 поколения) — так, как выглядело бы у двух
реальных родственников, независимо заполнивших свои деревья.

ЗАПУСК (нужен свежий backend, см. `make reset-db` в Makefile для полного сброса перед "официальным"
прогоном — иначе накопленные с прошлых прогонов persons искажают rarity/precision):
    cd jeli-server && uv run python Jeli-Bruno/scripts/matching_load_test.py [--trees 20] [--depth 5]

Результат: сводка в консоль + Jeli-Bruno/reports/matching_load_test_<UTC-таймстемп>.{json,md}
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import random
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ============================================================================================
# Пул данных — казахские имена/фамилии/отчества + гео + ру/племя/жуз таксономия.
# Синтетика для нагрузочного теста, не привязана к реальным людям.
# ============================================================================================

MALE_FIRST_NAMES = [
    "Ерлан", "Нурлан", "Арман", "Бекзат", "Диас", "Данияр", "Азамат", "Аскар", "Бауыржан",
    "Нурбол", "Олжас", "Санжар", "Ербол", "Канат", "Серик", "Талгат", "Марат", "Ержан",
    "Бекарыс", "Мухтар", "Дулат", "Мейрам", "Тимур", "Жандос", "Нурсултан", "Алишер",
    "Бекбол", "Ержигит", "Куаныш", "Райымбек", "Тлеубай", "Айдос", "Женис", "Кайрат",
    "Максат", "Нуртас", "Рустем", "Сакен", "Толеу", "Улан", "Хасен", "Шакен", "Аман",
    "Бахыт", "Габит", "Дархан", "Ерасыл", "Женискен", "Замза", "Ильяс", "Медет", "Нурай",
    "Отеген", "Пернебай", "Ратбек", "Сабыр", "Толеген", "Умирзак", "Хакім", "Чингиз",
    "Асхат", "Болат", "Ганиулы", "Дастан", "Есенгельды", "Жангали", "Зейнулла",
]
FEMALE_FIRST_NAMES = [
    "Айгерим", "Айжан", "Айдана", "Дана", "Динара", "Гульнара", "Жанар", "Мадина",
    "Салтанат", "Алия", "Асель", "Жибек", "Гульмира", "Аружан", "Зере", "Инкар",
    "Назерке", "Сабина", "Айша", "Ботагоз", "Гаухар", "Дамира", "Ерке", "Жания",
    "Зарина", "Индира", "Камила", "Лаура", "Меруерт", "Назым", "Перизат", "Раушан",
    "Сара", "Толкын", "Улжан", "Фариза", "Шолпан", "Айнур", "Балжан", "Венера",
    "Гульжан", "Дина", "Ельдана", "Жулдыз", "Замина", "Ирина", "Карлыгаш", "Ляззат",
    "Мольдир", "Нургуль", "Орынгуль", "Раиса", "Сауле", "Тансулу", "Улбала", "Феруза",
]
LAST_NAMES = [
    "Ахметов", "Байжанов", "Ережепов", "Жумабаев", "Каримов", "Нуркенов", "Оспанов",
    "Сарсенов", "Тулегенов", "Абенов", "Бекенов", "Досжанов", "Есенов", "Жаксыбеков",
    "Кенжебаев", "Мукашев", "Нурмаганбетов", "Оразалин", "Рахимов", "Смагулов",
    "Тастанбеков", "Уалиев", "Хамитов", "Шакиров", "Абдиров", "Бейсенов", "Дуйсенов",
    "Ерденов", "Жаппаров", "Ибрагимов", "Кайратов", "Мурзабеков", "Нургалиев",
    "Омаров", "Раимбеков", "Сатыбалдиев", "Турлыбеков", "Утегенов", "Хасенов",
    "Шаймерденов", "Абилов", "Бердибеков", "Дюсенов", "Ертаев", "Жумашев",
    "Искаков", "Кабдулов", "Мустафин", "Нускабаев", "Отарбаев", "Рысбеков",
    "Сейтказиев", "Токтасынов", "Умбетов", "Хайруллин", "Шаяхметов", "Айтуаров",
]
# * Резервный пул фамилий — ТОЛЬКО для точек входа подсаженных пар (не встречаются в общем пуле)
# * чтобы гарантировать rarity_count=0 и высокий node_confidence там, где это важно для теста.
RESERVED_ENTRY_LAST_NAMES = [
    "Достаналиев", "Жаугаштыулы", "Керейбаев", "Мангитаев", "Наймантаев",
    "Сарыаркаулы", "Ушкемпіров", "Шапырашты", "Балталиев", "Жетібайулы",
    "Керейтов", "Найзабеков", "Отемісов", "Сыбанбаев", "Ушкенбаев",
]
PATRONYMIC_ROOTS = [
    "Асан", "Бекен", "Дулат", "Ерсын", "Жанат", "Кенже", "Максут", "Нурлан",
    "Оспан", "Рустам", "Серик", "Талап", "Улан", "Хасен", "Шакир", "Абай",
    "Байтас", "Дархан", "Ерлан", "Жомарт", "Кабыл", "Мурат", "Нурсеит", "Ораз",
]
REGIONS = [
    "Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Тараз", "Павлодар",
    "Усть-Каменогорск", "Семей", "Атырау", "Костанай", "Кызылорда", "Уральск",
    "Петропавловск", "Туркестан",
]
MINOR_COUNTRIES = ["RU", "MN", "CN", "UZ"]
# * (ru, tribe, zhuz) — маленькая правдоподобная таксономия; согласованная тройка на узел или пусто.
RU_TAXONOMY = [
    ("Албан", "Уйсун", "Улы жуз"),
    ("Дулат", "Уйсун", "Улы жуз"),
    ("Аргын", "Аргын", "Орта жуз"),
    ("Найман", "Найман", "Орта жуз"),
    ("Керей", "Керей", "Орта жуз"),
    ("Алшын", "Алшын", "Киши жуз"),
    ("Байулы", "Алшын", "Киши жуз"),
    ("Жетыру", "Алшын", "Киши жуз"),
]
SOURCE_TYPES_WEIGHTED = (
    ["oral_tradition"] * 5 + ["family_document"] * 3 + ["photo"] * 1 + ["archival_record"] * 1
)


@dataclass
class PersonIdentity:
    last_name: str
    first_name: str
    patronymic: str | None
    gender: str
    is_alive: bool
    birth_year_value: int | None
    birth_year_precision: str
    death_year_value: int | None
    death_year_precision: str
    birth_country: str | None
    birth_region: str | None
    ru: str | None
    tribe: str | None
    zhuz: str | None
    source_type: str

    def person_payload(self, to_person_id: str | None = None) -> dict:
        payload = {
            "last_name": self.last_name,
            "first_name": self.first_name,
            "patronymic": self.patronymic,
            "gender": self.gender,
            "is_alive": self.is_alive,
            "birth_year_value": self.birth_year_value,
            "birth_year_precision": self.birth_year_precision,
            "death_year_value": self.death_year_value,
            "death_year_precision": self.death_year_precision,
            "birth_country": self.birth_country,
            "birth_region": self.birth_region,
            "ru": self.ru,
            "tribe": self.tribe,
            "zhuz": self.zhuz,
            "source_type": self.source_type,
            "has_attached_file": False,
        }
        if to_person_id:
            payload["relation"] = {"to_person_id": to_person_id, "type": "parent"}
        return payload

    def patch_payload(self) -> dict:
        # * Для root-узла (создаётся без body через /graph/create) — дозаполнение остального PATCH'ем.
        return {
            "birth_year_value": self.birth_year_value,
            "birth_year_precision": self.birth_year_precision,
            "death_year_value": self.death_year_value,
            "death_year_precision": self.death_year_precision,
            "birth_country": self.birth_country,
            "birth_region": self.birth_region,
            "ru": self.ru,
            "tribe": self.tribe,
            "zhuz": self.zhuz,
            "source_type": self.source_type,
        }


def _random_identity(rng: random.Random, gender: str, gen: int, *, reserved_surname: str | None = None) -> PersonIdentity:
    first = rng.choice(MALE_FIRST_NAMES if gender == "male" else FEMALE_FIRST_NAMES)
    last = reserved_surname or rng.choice(LAST_NAMES)
    patronymic = None
    if rng.random() > 0.1:
        root = rng.choice(PATRONYMIC_ROOTS)
        patronymic = f"{root}ұлы" if gender == "male" else f"{root}қызы"

    has_geo = rng.random() > 0.15
    birth_country = None
    birth_region = None
    if has_geo:
        birth_country = "KZ" if rng.random() > 0.12 else rng.choice(MINOR_COUNTRIES)
        birth_region = rng.choice(REGIONS) if birth_country == "KZ" else None

    ru = tribe = zhuz = None
    if rng.random() > 0.4:  # * ~40% узлов без родовых данных — реалистичная неполнота
        ru, tribe, zhuz = rng.choice(RU_TAXONOMY)

    birth_year = int(1990 - 28 * gen + rng.randint(-5, 5)) if rng.random() > 0.1 else None
    is_alive = gen == 0
    death_year = None
    if not is_alive and birth_year is not None and rng.random() > 0.3:
        death_year = birth_year + rng.randint(50, 85)

    return PersonIdentity(
        last_name=last,
        first_name=first,
        patronymic=patronymic,
        gender=gender,
        is_alive=is_alive,
        birth_year_value=birth_year,
        birth_year_precision="exact" if birth_year and rng.random() > 0.4 else "decade",
        death_year_value=death_year,
        death_year_precision="exact" if death_year and rng.random() > 0.5 else "decade",
        birth_country=birth_country,
        birth_region=birth_region,
        ru=ru,
        tribe=tribe,
        zhuz=zhuz,
        source_type=rng.choice(SOURCE_TYPES_WEIGHTED),
    )


# ============================================================================================
# Адресация узлов дерева: (gen, idx), idx in [0, 2**gen). Родители (g,idx) -> отец (g+1, 2*idx),
# мать (g+1, 2*idx+1). Чётный idx на уровне >=1 => male-слот, нечётный => female-слот — это
# гарантируется самой схемой (2*idx всегда чётный, 2*idx+1 всегда нечётный), а не отдельным правилом.
# ============================================================================================


def slot_gender(gen: int, idx: int) -> str:
    if gen == 0:
        raise ValueError("root gender is per-tree, not derived from slot")
    return "male" if idx % 2 == 0 else "female"


def ancestor_cone(entry_gen: int, entry_idx: int, max_gen: int = 5) -> list[tuple[int, int]]:
    # * Все предки узла (entry_gen, entry_idx) вплоть до max_gen включительно, сам узел включён.
    cone = []
    for g in range(entry_gen, max_gen + 1):
        span = 2 ** (g - entry_gen)
        start = entry_idx * span
        cone.extend((g, start + offset) for offset in range(span))
    return cone


TreeIdentities = dict[tuple[int, int], PersonIdentity]


def build_tree_identities(rng: random.Random, tree_idx: int, depth: int, root_gender: str) -> TreeIdentities:
    identities: TreeIdentities = {}
    identities[(0, 0)] = _random_identity(rng, root_gender, 0)
    for gen in range(1, depth + 1):
        for idx in range(2 ** gen):
            identities[(gen, idx)] = _random_identity(rng, slot_gender(gen, idx), gen)
    return identities


@dataclass
class PlantedPair:
    tree_a: int
    tree_b: int
    entry_gen: int
    entry_idx: int
    expected_status: str
    cone_size: int
    # * Заполняется после HTTP-построения деревьев (нужны реальные person_id).
    entry_person_a: str | None = None
    entry_person_b: str | None = None
    cone_pairs: list[tuple[str, str]] = field(default_factory=list)


PLANT_SPEC = [
    # (entry_gen, expected_status) — cone_size = depth - entry_gen + 1
    (2, "high_confidence"),
    (2, "high_confidence"),
    (3, "high_confidence"),
    (3, "possible_match"),
    (3, "possible_match"),
    (4, "possible_match"),
    (4, "possible_match"),
    (4, "possible_match"),
    (5, "discard"),
    (5, "discard"),
]


def plant_ground_truth(
    rng: random.Random, all_identities: dict[int, TreeIdentities], depth: int
) -> list[PlantedPair]:
    planted = []
    for i, (entry_gen, expected_status) in enumerate(PLANT_SPEC):
        tree_a, tree_b = 2 * i, 2 * i + 1  # непересекающиеся пары деревьев (0,1),(2,3),...
        max_idx = 2 ** entry_gen - 1
        entry_idx = rng.randint(0, max_idx)
        cone = ancestor_cone(entry_gen, entry_idx, depth)

        reserved = RESERVED_ENTRY_LAST_NAMES[i % len(RESERVED_ENTRY_LAST_NAMES)]
        entry_identity_a = all_identities[tree_a][(entry_gen, entry_idx)]
        entry_identity_a.last_name = reserved  # * высокий rarity для точки входа

        for pos in cone:
            all_identities[tree_b][pos] = copy.deepcopy(all_identities[tree_a][pos])

        planted.append(
            PlantedPair(
                tree_a=tree_a,
                tree_b=tree_b,
                entry_gen=entry_gen,
                entry_idx=entry_idx,
                expected_status=expected_status,
                cone_size=len(cone),
            )
        )
    return planted


# ============================================================================================
# HTTP-слой
# ============================================================================================


class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, client: httpx.AsyncClient, sem: asyncio.Semaphore) -> None:
        self.client = client
        self.sem = sem
        self.request_count = 0

    async def _call(self, method: str, path: str, *, token: str | None = None, json_body: dict | None = None) -> dict | list | None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with self.sem:
                    self.request_count += 1
                    resp = await self.client.request(method, path, json=json_body, headers=headers)
                if resp.status_code >= 500:
                    raise ApiError(f"{method} {path} -> {resp.status_code}: {resp.text[:200]}")
                if resp.status_code >= 400:
                    raise ApiError(f"{method} {path} -> {resp.status_code}: {resp.text[:300]}")
                return resp.json() if resp.content else None
            except (httpx.TransportError, ApiError) as exc:
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
        raise ApiError(f"failed after retries: {last_exc}")

    async def register(self, email: str, last_name: str, first_name: str) -> dict:
        return await self._call(
            "POST",
            "/auth/register",
            json_body={
                "email": email,
                "password": "string123",
                "last_name": last_name,
                "first_name": first_name,
                "patronymic": None,
                "graph_invite_code": "",
            },
        )

    async def set_profile(self, token: str, gender: str, birth_country: str | None) -> dict:
        return await self._call(
            "PATCH", "/users/profile/edit", token=token, json_body={"gender": gender, "birth_country": birth_country}
        )

    async def create_graph(self, token: str) -> dict:
        return await self._call("POST", "/graph/create", token=token)

    async def patch_person(self, token: str, person_id: str, payload: dict) -> dict:
        return await self._call("PATCH", f"/persons/{person_id}", token=token, json_body=payload)

    async def create_person(self, token: str, payload: dict) -> dict:
        return await self._call("POST", "/persons", token=token, json_body=payload)

    async def get_matches(self, token: str, person_id: str) -> list[dict]:
        return await self._call("GET", f"/persons/{person_id}/matches", token=token)

    async def confirm_match(self, token: str, match_id: str) -> dict:
        return await self._call("POST", f"/matches/{match_id}/confirm", token=token)

    async def household_graph(self, token: str, person_id: str) -> dict:
        return await self._call("GET", f"/persons/{person_id}/household-graph", token=token)


# ============================================================================================
# Построение дерева
# ============================================================================================


@dataclass
class TreeResult:
    tree_idx: int
    user_id: str
    access_token: str
    person_ids: dict[tuple[int, int], str] = field(default_factory=dict)


async def build_tree(api: Api, tree_idx: int, identities: TreeIdentities, depth: int, run_ts: str) -> TreeResult:
    root_identity = identities[(0, 0)]
    email = f"loadtest_{run_ts}_t{tree_idx}@example.com"
    reg = await api.register(email, root_identity.last_name, root_identity.first_name)
    token = reg["access_token"]
    user_id = reg["user"]["id"]

    await api.set_profile(token, root_identity.gender, root_identity.birth_country)
    root_person = await api.create_graph(token)
    root_id = root_person["id"]
    await api.patch_person(token, root_id, root_identity.patch_payload())

    result = TreeResult(tree_idx=tree_idx, user_id=user_id, access_token=token)
    result.person_ids[(0, 0)] = root_id

    for gen in range(1, depth + 1):
        parents_at_prev_level = 2 ** (gen - 1)
        creates = []
        positions = []
        for idx in range(parents_at_prev_level):
            parent_id = result.person_ids[(gen - 1, idx)]
            father_idx, mother_idx = 2 * idx, 2 * idx + 1
            for child_idx in (father_idx, mother_idx):
                identity = identities[(gen, child_idx)]
                creates.append(api.create_person(result.access_token, identity.person_payload(parent_id)))
                positions.append((gen, child_idx))
        created = await asyncio.gather(*creates)
        for pos, person in zip(positions, created):
            result.person_ids[pos] = person["id"]

    return result


async def touch_all_persons(api: Api, trees: list[TreeResult], all_identities: dict[int, TreeIdentities]) -> None:
    # ! НАХОДКА: POST /persons {relation: {type: "parent", to_person_id}} триггерит recompute только
    # ! для НОВОГО (родительского) узла (graph/router.py:126) — существующий потомок (to_person_id)
    # ! recompute не получает. При построении дерева СВЕРХУ ВНИЗ (root -> предки) это значит, что
    # ! recompute каждого узла срабатывает СРАЗУ при его создании, когда его собственные предки ещё
    # ! не существуют (они появляются позже, на следующих уровнях) — ancestor-цепочка при этом первом
    # ! пересчёте всегда пуста. Единственный способ форсировать пересчёт с уже полным деревом предков —
    # ! это PATCH (который безусловно триггерит recompute заново, см. graph/router.py:208) уже ПОСЛЕ
    # ! того, как всё дерево построено. Без этого шага ни один узел никогда не увидит собственную
    # ! глубокую цепочку предков — это реальный архитектурный пробел, а не только артефакт скрипта.
    # * PATCH со СВОИМ ЖЕ текущим source_type — безусловный триггер recompute без изменения данных.
    tasks = []
    for tree in trees:
        for pos, pid in tree.person_ids.items():
            source_type = all_identities[tree.tree_idx][pos].source_type
            tasks.append(api.patch_person(tree.access_token, pid, {"source_type": source_type}))
    await asyncio.gather(*tasks)


# ============================================================================================
# Ожидание устаканивания фонового пересчёта
# ============================================================================================


async def wait_for_settle(api: Api, sample: list[tuple[str, str]], *, min_wait: float = 120.0) -> float:
    # * sample: список (access_token, person_id) — представительная выборка для проверки стабильности.
    start = time.monotonic()
    await asyncio.sleep(3.0)
    prev_fingerprint = None
    stable_count = 0
    max_wait = min_wait
    while True:
        elapsed = time.monotonic() - start
        results = await asyncio.gather(*(api.get_matches(tok, pid) for tok, pid in sample), return_exceptions=True)
        total = 0
        entries = []
        max_ts = ""
        for r in results:
            if isinstance(r, Exception):
                continue
            total += len(r)
            for m in r:
                entries.append((m["id"], round(m["score"], 3), m["status"]))
                if m.get("last_computed_at") and m["last_computed_at"] > max_ts:
                    max_ts = m["last_computed_at"]
        fingerprint = (total, tuple(sorted(entries)), max_ts)

        if elapsed > 15 and max_wait == min_wait:
            # * Первая содержательная точка — адаптивно расширяем таймаут под реально наблюдаемый объём.
            max_wait = max(min_wait, elapsed * 4)

        if fingerprint == prev_fingerprint:
            stable_count += 1
            if stable_count >= 3:
                return elapsed
        else:
            stable_count = 0
        prev_fingerprint = fingerprint

        if elapsed > max_wait:
            print(f"  ! wait_for_settle timeout after {elapsed:.0f}s — proceeding with current state", file=sys.stderr)
            return elapsed
        await asyncio.sleep(5.0)


# ============================================================================================
# Статистика
# ============================================================================================


def frozen(a: str, b: str) -> frozenset:
    return frozenset({a, b})


async def gather_all_matches(api: Api, trees: list[TreeResult]) -> dict[str, dict]:
    all_matches: dict[str, dict] = {}
    tasks = []
    for tree in trees:
        for pos, pid in tree.person_ids.items():
            tasks.append((tree.access_token, pid))
    results = await asyncio.gather(*(api.get_matches(tok, pid) for tok, pid in tasks), return_exceptions=True)
    for r in results:
        if isinstance(r, Exception):
            continue
        for m in r:
            all_matches[m["id"]] = m
    return all_matches


def compute_stats(planted: list[PlantedPair], all_matches: dict[str, dict]) -> dict:
    by_pair: dict[frozenset, dict] = {}
    for m in all_matches.values():
        by_pair[frozen(m["person_a_id"], m["person_b_id"])] = m

    positive_planted = [p for p in planted if p.expected_status != "discard"]
    negative_planted = [p for p in planted if p.expected_status == "discard"]

    hits, misses = [], []
    for p in positive_planted:
        key = frozen(p.entry_person_a, p.entry_person_b)
        m = by_pair.get(key)
        if m and m["status"] != "discard":
            hits.append((p, m))
        else:
            misses.append((p, m))

    correct_discards, wrong_matches = [], []
    for p in negative_planted:
        key = frozen(p.entry_person_a, p.entry_person_b)
        m = by_pair.get(key)
        if not m or m["status"] == "discard":
            correct_discards.append((p, m))
        else:
            wrong_matches.append((p, m))

    recall_all = len(hits) / len(planted) if planted else 0.0
    recall_positive = len(hits) / len(positive_planted) if positive_planted else 0.0

    ground_truth_keys = {frozen(p.entry_person_a, p.entry_person_b) for p in planted}
    cone_twin_keys = {frozen(a, b) for p in planted for (a, b) in p.cone_pairs}

    non_discard = [m for m in all_matches.values() if m["status"] != "discard"]
    strict_tp = sum(1 for m in non_discard if frozen(m["person_a_id"], m["person_b_id"]) in ground_truth_keys)
    inclusive_tp = sum(
        1
        for m in non_discard
        if frozen(m["person_a_id"], m["person_b_id"]) in ground_truth_keys | cone_twin_keys
    )
    false_positives = [
        m
        for m in non_discard
        if frozen(m["person_a_id"], m["person_b_id"]) not in (ground_truth_keys | cone_twin_keys)
    ]

    strict_precision = strict_tp / len(non_discard) if non_discard else 0.0
    inclusive_precision = inclusive_tp / len(non_discard) if non_discard else 0.0
    f1 = (
        2 * strict_precision * recall_positive / (strict_precision + recall_positive)
        if (strict_precision + recall_positive) > 0
        else 0.0
    )

    status_counts = {"high_confidence": 0, "possible_match": 0, "discard": 0}
    for m in all_matches.values():
        status_counts[m["status"]] = status_counts.get(m["status"], 0) + 1

    chain_lengths = [m["evidence"].get("chain_length") for m in non_discard if m["evidence"].get("chain_length") is not None]
    sibling_rate = (
        sum(1 for m in non_discard if m["evidence"].get("sibling_confirmed")) / len(non_discard) if non_discard else 0.0
    )

    return {
        "total_matches_found": len(all_matches),
        "status_counts": status_counts,
        "planted_total": len(planted),
        "planted_positive": len(positive_planted),
        "planted_negative_controls": len(negative_planted),
        "recall_all_planted": recall_all,
        "recall_positive_only": recall_positive,
        "hits": [{"entry_gen": p.entry_gen, "expected": p.expected_status, "actual": m["status"], "score": m["score"]} for p, m in hits],
        "misses": [{"entry_gen": p.entry_gen, "expected": p.expected_status, "actual": m["status"] if m else None} for p, m in misses],
        "negative_controls_correct": len(correct_discards),
        "negative_controls_wrong": [
            {"entry_gen": p.entry_gen, "actual_status": m["status"], "score": m["score"]} for p, m in wrong_matches
        ],
        "strict_precision": strict_precision,
        "inclusive_precision": inclusive_precision,
        "f1_strict": f1,
        "false_positive_count": len(false_positives),
        "false_positives_sample": [
            {
                "match_id": m["id"],
                "score": m["score"],
                "status": m["status"],
                "chain_length": m["evidence"].get("chain_length"),
            }
            for m in false_positives[:20]
        ],
        "avg_chain_length": statistics.mean(chain_lengths) if chain_lengths else None,
        "median_chain_length": statistics.median(chain_lengths) if chain_lengths else None,
        "sibling_confirmed_rate": sibling_rate,
        "score_histogram": _score_histogram(all_matches.values()),
    }


def _score_histogram(matches) -> dict[str, int]:
    hist: dict[str, int] = {}
    for m in matches:
        bucket = f"{int(m['score'] * 20) / 20:.2f}"
        hist[bucket] = hist.get(bucket, 0) + 1
    return dict(sorted(hist.items()))


# ============================================================================================
# Проверка ветки подтверждения
# ============================================================================================


async def verify_confirm_flow(api: Api, trees_by_idx: dict[int, TreeResult], planted: list[PlantedPair], all_matches: dict[str, dict], sample_size: int = 4) -> dict:
    by_pair = {frozen(m["person_a_id"], m["person_b_id"]): m for m in all_matches.values()}
    candidates = [p for p in planted if p.expected_status != "discard"]
    sample = candidates[:sample_size]
    results = []
    for p in sample:
        key = frozen(p.entry_person_a, p.entry_person_b)
        m = by_pair.get(key)
        if not m or m["status"] == "discard":
            results.append({"pair": (p.tree_a, p.tree_b), "ok": False, "reason": "no non-discard match found"})
            continue
        tree_a, tree_b = trees_by_idx[p.tree_a], trees_by_idx[p.tree_b]
        try:
            await api.confirm_match(tree_a.access_token, m["id"])
            confirmed = await api.confirm_match(tree_b.access_token, m["id"])
            hh = await api.household_graph(tree_a.access_token, p.entry_person_a)
            has_bridge = any(rel["type"] == "match_confirmed" for rel in hh["relationships"])
            results.append(
                {
                    "pair": (p.tree_a, p.tree_b),
                    "ok": bool(confirmed.get("confirmed_at")) and has_bridge,
                    "confirmed_at": confirmed.get("confirmed_at"),
                    "graph_link_bridge_visible": has_bridge,
                }
            )
        except ApiError as exc:
            results.append({"pair": (p.tree_a, p.tree_b), "ok": False, "reason": str(exc)})
    ok_count = sum(1 for r in results if r["ok"])
    return {"sample_size": len(sample), "ok_count": ok_count, "details": results}


# ============================================================================================
# Отчёт
# ============================================================================================


def write_reports(report_dir: Path, run_ts: str, config: dict, stats: dict, confirm_results: dict, timings: dict) -> tuple[Path, Path]:
    report_dir.mkdir(parents=True, exist_ok=True)
    json_path = report_dir / f"matching_load_test_{run_ts}.json"
    md_path = report_dir / f"matching_load_test_{run_ts}.md"

    full = {"config": config, "timings": timings, "stats": stats, "confirm_flow": confirm_results}
    json_path.write_text(json.dumps(full, indent=2, ensure_ascii=False, default=str), encoding="utf-8")

    lines = [
        f"# Matching load test — {run_ts}",
        "",
        f"Trees: {config['trees']}, depth: {config['depth']}, persons/tree: {config['persons_per_tree']}, "
        f"total persons: {config['total_persons']}",
        "",
        "## Timings",
        f"- Build: {timings['build_s']:.1f}s",
        f"- Touch (force recompute post-build, see finding below): {timings['touch_s']:.1f}s",
        f"- Settle wait: {timings['settle_s']:.1f}s",
        f"- Total: {timings['total_s']:.1f}s",
        f"- HTTP requests: {timings['request_count']}",
        "",
        "## Accuracy",
        f"- Recall (all 10 planted, incl. 2 negative controls): {stats['recall_all_planted']:.0%}",
        f"- Recall (8 positive planted pairs only): {stats['recall_positive_only']:.0%}",
        f"- Precision (strict — only planted entry pairs count as TP): {stats['strict_precision']:.0%}",
        f"- Precision (inclusive — + legitimate cone-twin pairs): {stats['inclusive_precision']:.0%}",
        f"- F1 (recall_positive x strict_precision): {stats['f1_strict']:.3f}",
        f"- Negative controls correctly discarded: {stats['negative_controls_correct']}/{stats['planted_negative_controls']}",
        f"- False positives found: {stats['false_positive_count']}",
        "",
        "## Status distribution",
        f"- high_confidence: {stats['status_counts'].get('high_confidence', 0)}",
        f"- possible_match: {stats['status_counts'].get('possible_match', 0)}",
        f"- discard: {stats['status_counts'].get('discard', 0)}",
        f"- total MatchCandidate rows found: {stats['total_matches_found']}",
        "",
        "## Chain quality (non-discard matches)",
        f"- avg chain_length: {stats['avg_chain_length']}",
        f"- median chain_length: {stats['median_chain_length']}",
        f"- sibling_confirmed rate: {stats['sibling_confirmed_rate']:.0%}",
        "",
        "## Planted pairs — expected vs actual",
    ]
    for h in stats["hits"]:
        lines.append(f"- gen={h['entry_gen']}: expected {h['expected']}, got {h['actual']} (score {h['score']:.3f}) ✓")
    for miss in stats["misses"]:
        lines.append(f"- gen={miss['entry_gen']}: expected {miss['expected']}, got {miss['actual']} ✗ MISS")
    for w in stats["negative_controls_wrong"]:
        lines.append(f"- gen={w['entry_gen']} (negative control): expected discard, got {w['actual_status']} (score {w['score']:.3f}) ✗")

    lines += ["", "## Confirm-flow validation", f"- {confirm_results['ok_count']}/{confirm_results['sample_size']} confirmed pairs correctly bridged clusters"]
    for d in confirm_results["details"]:
        lines.append(f"  - trees {d['pair']}: ok={d['ok']}")

    if stats["false_positives_sample"]:
        lines += ["", "## False positives (sample, for manual review)"]
        for fp in stats["false_positives_sample"]:
            lines.append(f"- match {fp['match_id']}: status={fp['status']}, score={fp['score']:.3f}, chain_length={fp['chain_length']}")

    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


# ============================================================================================
# main
# ============================================================================================


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000/api")
    parser.add_argument("--trees", type=int, default=20)
    parser.add_argument("--depth", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--confirm-sample", type=int, default=4)
    parser.add_argument("--report-dir", default=None)
    parser.add_argument("--skip-confirm", action="store_true")
    args = parser.parse_args()

    if args.trees != 20 or args.depth != 5:
        print(f"NOTE: PLANT_SPEC assumes trees>=20 depth=5; using --trees {args.trees} --depth {args.depth} may misalign planted pairs.", file=sys.stderr)

    print(
        "NOTE: for an authoritative run, reset the DB first (`make reset-db`) — persons accumulated\n"
        "from previous runs skew rarity/precision. This run uses timestamped emails so it's always\n"
        "safe to re-run for debugging, just not 'authoritative' on a dirty DB.\n"
    )

    run_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rng = random.Random(args.seed)
    t_start = time.monotonic()

    print(f"Building identity pool for {args.trees} trees, depth {args.depth}...")
    all_identities = {
        i: build_tree_identities(rng, i, args.depth, root_gender=rng.choice(["male", "female"]))
        for i in range(args.trees)
    }
    planted = plant_ground_truth(rng, all_identities, args.depth) if args.trees >= 20 and args.depth >= 5 else []

    async with httpx.AsyncClient(base_url=args.base_url, timeout=30.0) as client:
        sem = asyncio.Semaphore(args.concurrency)
        api = Api(client, sem)

        print(f"Building {args.trees} trees over HTTP (this hits the real backend + BackgroundTasks)...")
        t_build_start = time.monotonic()
        trees = await asyncio.gather(
            *(build_tree(api, i, all_identities[i], args.depth, run_ts) for i in range(args.trees))
        )
        build_s = time.monotonic() - t_build_start
        trees_by_idx = {t.tree_idx: t for t in trees}
        print(f"  built {sum(len(t.person_ids) for t in trees)} persons in {build_s:.1f}s")

        for p in planted:
            p.entry_person_a = trees_by_idx[p.tree_a].person_ids[(p.entry_gen, p.entry_idx)]
            p.entry_person_b = trees_by_idx[p.tree_b].person_ids[(p.entry_gen, p.entry_idx)]
            cone = ancestor_cone(p.entry_gen, p.entry_idx, args.depth)
            p.cone_pairs = [
                (trees_by_idx[p.tree_a].person_ids[pos], trees_by_idx[p.tree_b].person_ids[pos]) for pos in cone
            ]

        print("Re-touching every person (forces recompute now that full ancestor trees exist — see")
        print("  touch_all_persons() docstring for why this is necessary, not just cosmetic)...")
        t_touch_start = time.monotonic()
        await touch_all_persons(api, trees, all_identities)
        touch_s = time.monotonic() - t_touch_start
        print(f"  touched {sum(len(t.person_ids) for t in trees)} persons in {touch_s:.1f}s")

        sample = [(t.access_token, pid) for p in planted for t, pid in ((trees_by_idx[p.tree_a], p.entry_person_a), (trees_by_idx[p.tree_b], p.entry_person_b))]
        general_sample = [
            (t.access_token, pid)
            for t in rng.sample(trees, min(10, len(trees)))
            for pid in rng.sample(list(t.person_ids.values()), min(4, len(t.person_ids)))
        ]
        print("Waiting for background recompute to settle...")
        settle_s = await wait_for_settle(api, sample + general_sample)

        print("Gathering all match candidates...")
        all_matches = await gather_all_matches(api, trees)
        stats = compute_stats(planted, all_matches)

        confirm_results = {"sample_size": 0, "ok_count": 0, "details": []}
        if not args.skip_confirm and planted:
            print("Validating confirm-flow (mutates state — runs last)...")
            confirm_results = await verify_confirm_flow(api, trees_by_idx, planted, all_matches, args.confirm_sample)

        total_s = time.monotonic() - t_start
        timings = {
            "build_s": build_s,
            "touch_s": touch_s,
            "settle_s": settle_s,
            "total_s": total_s,
            "request_count": api.request_count,
        }
        config = {
            "trees": args.trees,
            "depth": args.depth,
            "persons_per_tree": 2 ** (args.depth + 1) - 1,
            "total_persons": sum(len(t.person_ids) for t in trees),
            "concurrency": args.concurrency,
            "seed": args.seed,
        }

        report_dir = Path(args.report_dir) if args.report_dir else Path(__file__).parent.parent / "reports"
        json_path, md_path = write_reports(report_dir, run_ts, config, stats, confirm_results, timings)

        print()
        print("=" * 70)
        print(f"Recall (positive planted pairs): {stats['recall_positive_only']:.0%}")
        print(f"Precision (strict): {stats['strict_precision']:.0%}  (inclusive: {stats['inclusive_precision']:.0%})")
        print(f"F1: {stats['f1_strict']:.3f}")
        print(f"Status counts: {stats['status_counts']}")
        print(f"False positives: {stats['false_positive_count']}")
        print(f"Confirm-flow: {confirm_results['ok_count']}/{confirm_results['sample_size']}")
        print(f"Total time: {total_s:.1f}s ({timings['request_count']} HTTP requests)")
        print(f"Reports written to: {json_path} / {md_path}")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
