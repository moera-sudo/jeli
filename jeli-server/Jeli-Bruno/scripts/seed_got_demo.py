"""Разовый сидинг демо-данных для РУЧНОЙ проверки мэтчинга через React-клиент.

ЗАЧЕМ. После фиксов recompute-триггеров (А/Е), match-bridge (Б) и discard-фильтра (Д) на бэкенде,
плюс центровки match-блоков и live-reload графа (В/Г) на фронте — нужно проверить всё это глазами
в реальном UI, а не только скриптами. Строит 6 деревьев (дома Game of Thrones как референс имён):
- Старк (2 дерева) — общие предки на 3 поколения, полными полями (ru/tribe/zhuz, family_document) —
  должны замэтчиться с высокой уверенностью (high_confidence).
- Ланнистер (2 дерева) — общие предки на 2 поколения, без ru/tribe/zhuz, oral_tradition — должны
  замэтчиться, но слабее (possible_match).
- Таргариен и Баратеон (по 1 дереву) — никак не связаны ни друг с другом, ни со Старк/Ланнистер.

Confirm НИКОГДА не вызывается — обе стороны каждого мэтча остаются pending, чтобы пользователь сам
подтвердил их в UI под двумя аккаунтами по очереди и увидел live-reload графа (фикс Г) и подтягивание
всей семьи второй стороны через мост (фикс Б).

ЗАПУСК (нужен свежий backend, `make reset-db` перед этим для чистой картины без старых тестовых юзеров):
    cd jeli-server && uv run python Jeli-Bruno/scripts/seed_got_demo.py

Результат: сводка в консоль + Jeli-Bruno/reports/got_demo_seed_<UTC-таймстемп>.md
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx

BASE_URL = "http://localhost:8000/api"
PASSWORD = "Password123!"

STARK_SHARED = {
    "birth_country": "KZ",
    "birth_region": "Almaty",
    "ru": "Shaprashty",
    "tribe": "Shaprashty",
    "zhuz": "ulyzhuz",
    "source_type": "family_document",
}
LANNISTER_SHARED = {
    "birth_country": "KZ",
    "birth_region": "Almaty",
    "ru": "Qangly",
    "tribe": "Qangly",
    "zhuz": "ulyzhuz",
    "source_type": "oral_tradition",
}


class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    async def _call(self, method: str, path: str, *, token: str | None = None, json_body: dict | None = None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                resp = await self.client.request(method, path, json=json_body, headers=headers)
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
                "password": PASSWORD,
                "last_name": last_name,
                "first_name": first_name,
                "patronymic": None,
                "graph_invite_code": "",
            },
        )

    async def set_profile(self, token: str, gender: str) -> dict:
        return await self._call("PATCH", "/users/profile/edit", token=token, json_body={"gender": gender})

    async def create_graph(self, token: str) -> dict:
        return await self._call("POST", "/graph/create", token=token)

    async def create_person(self, token: str, payload: dict) -> dict:
        return await self._call("POST", "/persons", token=token, json_body=payload)

    async def get_user_matches(self, token: str, user_id: str) -> list[dict]:
        return await self._call("GET", f"/users/{user_id}/matches", token=token)


@dataclass
class NodeSpec:
    key: str
    last_name: str
    first_name: str
    gender: str
    relation_type: str  # parent | child | spouse
    to_key: str  # "root" or another node's key
    extra: dict = field(default_factory=dict)


@dataclass
class TreeSpec:
    label: str
    email: str
    root_last_name: str
    root_first_name: str
    root_gender: str
    nodes: list[NodeSpec]


@dataclass
class TreeResult:
    spec: TreeSpec
    user_id: str
    token: str
    person_ids: dict[str, str]  # key -> person_id, "root" included


TREES: list[TreeSpec] = [
    TreeSpec(
        label="Winterfell Starks",
        email="eddard.stark@example.com",
        root_last_name="Stark",
        root_first_name="Eddard",
        root_gender="male",
        nodes=[
            NodeSpec("rickard", "Stark", "Rickard", "male", "parent", "root"),
            NodeSpec("edwin", "Stark", "Edwin", "male", "parent", "rickard",
                     {**STARK_SHARED, "birth_year_value": 1870, "birth_year_precision": "decade"}),
            NodeSpec("willam", "Stark", "Willam", "male", "parent", "edwin",
                     {**STARK_SHARED, "birth_year_value": 1840, "birth_year_precision": "decade"}),
            NodeSpec("torrhen", "Stark", "Torrhen", "male", "parent", "willam",
                     {**STARK_SHARED, "birth_year_value": 1810, "birth_year_precision": "decade"}),
            NodeSpec("brandon", "Stark", "Brandon", "male", "child", "rickard"),
            NodeSpec("lyanna", "Stark", "Lyanna", "female", "child", "rickard"),
            NodeSpec("catelyn", "Stark", "Catelyn", "female", "spouse", "root"),
            NodeSpec("robb", "Stark", "Robb", "male", "child", "root"),
            NodeSpec("sansa", "Stark", "Sansa", "female", "child", "root"),
            NodeSpec("arya", "Stark", "Arya", "female", "child", "root"),
            NodeSpec("bran", "Stark", "Bran", "male", "child", "root"),
        ],
    ),
    TreeSpec(
        label="Karhold Starks",
        email="benjen.stark@example.com",
        root_last_name="Stark",
        root_first_name="Benjen",
        root_gender="male",
        nodes=[
            NodeSpec("edwin", "Stark", "Edwin", "male", "parent", "root",
                     {**STARK_SHARED, "birth_year_value": 1870, "birth_year_precision": "decade"}),
            NodeSpec("willam", "Stark", "Willam", "male", "parent", "edwin",
                     {**STARK_SHARED, "birth_year_value": 1840, "birth_year_precision": "decade"}),
            NodeSpec("torrhen", "Stark", "Torrhen", "male", "parent", "willam",
                     {**STARK_SHARED, "birth_year_value": 1810, "birth_year_precision": "decade"}),
            NodeSpec("maege", "Stark", "Maege", "female", "child", "edwin"),
        ],
    ),
    TreeSpec(
        label="Casterly Rock Lannisters",
        email="tywin.lannister@example.com",
        root_last_name="Lannister",
        root_first_name="Tywin",
        root_gender="male",
        nodes=[
            NodeSpec("tytos", "Lannister", "Tytos", "male", "parent", "root",
                     {**LANNISTER_SHARED, "birth_year_value": 1860, "birth_year_precision": "decade"}),
            NodeSpec("gerold", "Lannister", "Gerold", "male", "parent", "tytos",
                     {**LANNISTER_SHARED, "birth_year_value": 1830, "birth_year_precision": "decade"}),
            NodeSpec("kevan", "Lannister", "Kevan", "male", "child", "tytos"),
            NodeSpec("genna", "Lannister", "Genna", "female", "child", "tytos"),
            NodeSpec("cersei", "Lannister", "Cersei", "female", "child", "root"),
            NodeSpec("jaime", "Lannister", "Jaime", "male", "child", "root"),
            NodeSpec("tyrion", "Lannister", "Tyrion", "male", "child", "root"),
        ],
    ),
    TreeSpec(
        label="Lannisport Lannisters",
        email="damon.lannister@example.com",
        root_last_name="Lannister",
        root_first_name="Damon",
        root_gender="male",
        nodes=[
            NodeSpec("tytos", "Lannister", "Tytos", "male", "parent", "root",
                     {**LANNISTER_SHARED, "birth_year_value": 1860, "birth_year_precision": "decade"}),
            NodeSpec("gerold", "Lannister", "Gerold", "male", "parent", "tytos",
                     {**LANNISTER_SHARED, "birth_year_value": 1830, "birth_year_precision": "decade"}),
            NodeSpec("stafford", "Lannister", "Stafford", "male", "child", "tytos"),
        ],
    ),
    TreeSpec(
        label="House Targaryen",
        email="daenerys.targaryen@example.com",
        root_last_name="Targaryen",
        root_first_name="Daenerys",
        root_gender="female",
        nodes=[
            NodeSpec("aerys", "Targaryen", "Aerys", "male", "parent", "root"),
            NodeSpec("aegon", "Targaryen", "Aegon", "male", "parent", "aerys"),
            NodeSpec("viserys", "Targaryen", "Viserys", "male", "child", "aerys"),
        ],
    ),
    TreeSpec(
        label="House Baratheon",
        email="robert.baratheon@example.com",
        root_last_name="Baratheon",
        root_first_name="Robert",
        root_gender="male",
        nodes=[
            NodeSpec("steffon", "Baratheon", "Steffon", "male", "parent", "root"),
            NodeSpec("ormund", "Baratheon", "Ormund", "male", "parent", "steffon"),
            NodeSpec("stannis", "Baratheon", "Stannis", "male", "child", "steffon"),
            NodeSpec("renly", "Baratheon", "Renly", "male", "child", "steffon"),
        ],
    ),
]

# (tree_label_a, tree_label_b, expected_status) — for the verification + report step.
EXPECTED_PAIRS = [
    ("Winterfell Starks", "Karhold Starks", "high_confidence"),
    ("Casterly Rock Lannisters", "Lannisport Lannisters", "possible_match"),
]
UNRELATED_LABELS = ["House Targaryen", "House Baratheon"]


async def build_tree(api: Api, spec: TreeSpec) -> TreeResult:
    reg = await api.register(spec.email, spec.root_last_name, spec.root_first_name)
    token = reg["access_token"]
    user_id = reg["user"]["id"]
    await api.set_profile(token, spec.root_gender)
    root = await api.create_graph(token)
    person_ids = {"root": root["id"]}

    for node in spec.nodes:
        payload = {
            "last_name": node.last_name,
            "first_name": node.first_name,
            "gender": node.gender,
            "relation": {"to_person_id": person_ids[node.to_key], "type": node.relation_type},
            **node.extra,
        }
        person = await api.create_person(token, payload)
        person_ids[node.key] = person["id"]

    return TreeResult(spec=spec, user_id=user_id, token=token, person_ids=person_ids)


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
        api = Api(client)

        print(f"Building {len(TREES)} trees over HTTP...")
        results: dict[str, TreeResult] = {}
        for spec in TREES:
            result = await build_tree(api, spec)
            results[spec.label] = result
            print(f"  {spec.label}: {len(result.person_ids)} persons (owner user {result.user_id})")

        print("Waiting for background recompute to settle...")
        await asyncio.sleep(4)

        all_person_ids = {pid: (label, key) for label, r in results.items() for key, pid in r.person_ids.items()}

        pair_reports = []
        for label_a, label_b, expected in EXPECTED_PAIRS:
            a, b = results[label_a], results[label_b]
            matches = await api.get_user_matches(a.token, a.user_id)
            b_ids = set(b.person_ids.values())
            found = next(
                (m for m in matches if m["person_a_id"] in b_ids or m["person_b_id"] in b_ids),
                None,
            )
            pair_reports.append((label_a, label_b, expected, found))
            if found:
                print(f"  MATCH {label_a} <-> {label_b}: score={found['score']:.3f} status={found['status']} (expected ~{expected})")
            else:
                print(f"  MATCH {label_a} <-> {label_b}: NOT FOUND (expected {expected}) - check manually")

        unrelated_reports = []
        for label in UNRELATED_LABELS:
            r = results[label]
            matches = await api.get_user_matches(r.token, r.user_id)
            cross_house = [m for m in matches if all_person_ids.get(m["person_a_id"], (None,))[0] != label
                            or all_person_ids.get(m["person_b_id"], (None,))[0] != label]
            unrelated_reports.append((label, len(matches), cross_house))
            print(f"  UNRELATED {label}: {len(matches)} matches found (expected 0)")

        report_lines = [
            "# GoT demo seed report",
            "",
            f"Generated: {datetime.now(timezone.utc).isoformat()}",
            "",
            "## Учётные данные",
            "",
            "Пароль у всех аккаунтов одинаковый: `" + PASSWORD + "`",
            "",
            "| Дом | Email | Root person | Персон в дереве |",
            "|---|---|---|---|",
        ]
        for spec in TREES:
            r = results[spec.label]
            report_lines.append(
                f"| {spec.label} | {spec.email} | {spec.root_first_name} {spec.root_last_name} | {len(r.person_ids)} |"
            )

        report_lines += ["", "## Ожидаемые мэтчи", ""]
        for label_a, label_b, expected, found in pair_reports:
            if found:
                report_lines.append(
                    f"- **{label_a} <-> {label_b}**: найден, score={found['score']:.3f}, "
                    f"status=`{found['status']}` (ориентир: `{expected}`), match_id=`{found['id']}`"
                )
            else:
                report_lines.append(f"- **{label_a} <-> {label_b}**: НЕ найден автоматически — проверьте вручную в UI")

        report_lines += ["", "## Несвязанные дома (не должны замэтчиться)", ""]
        for label, count, cross_house in unrelated_reports:
            status = "OK, пусто" if count == 0 else f"внимание: {count} матчей (возможен ложный мэтч)"
            report_lines.append(f"- **{label}**: {status}")

        report_lines += [
            "",
            "## Как проверить в UI",
            "",
            "1. Зайдите в React-клиент под `eddard.stark@example.com` / `" + PASSWORD + "`.",
            "2. Откройте панель «Совпадения» — должен быть виден pending-мэтч с домом Karhold Starks.",
            "3. Нажмите «Подтвердить» — это подтверждение только с ВАШЕЙ стороны.",
            "4. Разлогиньтесь, зайдите под `benjen.stark@example.com` / `" + PASSWORD + "`.",
            "5. Откройте «Совпадения», подтвердите тот же мэтч со своей стороны.",
            "6. Граф должен обновиться СРАЗУ (без ручной перезагрузки страницы) и подтянуть ВСЮ семью "
            "второй стороны (не только один узел) — Willam, Torrhen, Maege и т.д.",
            "7. Повторите шаги 1-6 для `tywin.lannister@example.com` / `damon.lannister@example.com` "
            "(мэтч слабее — possible_match, а не high_confidence).",
            "8. Зайдите под `daenerys.targaryen@example.com` или `robert.baratheon@example.com` — "
            "панель «Совпадения» должна быть пустой.",
            "",
        ]

        reports_dir = Path(__file__).resolve().parent.parent / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        report_path = reports_dir / f"got_demo_seed_{ts}.md"
        report_path.write_text("\n".join(report_lines), encoding="utf-8")

        print()
        print("=" * 70)
        print("\n".join(report_lines))
        print("=" * 70)
        print(f"Report written to: {report_path}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except ApiError as exc:
        print(f"FATAL: {exc}", file=sys.stderr)
        sys.exit(1)
