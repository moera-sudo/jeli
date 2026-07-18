# Matching Algorithm — «Jeli»

## 1. Философия алгоритма

Задача — не «найти совпадение по имени», а **доказать родство**. Любое случайное совпадение имени (тёзка/однофамилец) должно давать низкий score, а реальное родство — высокий, с прозрачным объяснением «почему».

Три принципа пронизывают весь алгоритм:

1. **Цепочка важнее одного узла.** Единичное совпадение имени — шум. Доказательная сила растёт нелинейно с длиной непрерывной совпавшей цепочки предков.
2. **Отсутствие данных — нейтрально, противоречие данных — штраф.** Пользователи заполняют дерево неполно (нет даты, нет региона, нет ру) — это никогда не должно караться. А вот прямое противоречие фактов (разный пол, разный жуз, невозможный по времени разрыв поколений) — это сильный сигнал «это разные люди».
3. **Bloodline — единственная основа матчинга.** Родство ищется только по кровным связям (`parent_of`). Брак (`spouse_of`) — навигационное ребро для отображения, никогда не участвует в поиске общих предков.

Никакого ML/scikit-learn — все веса ручные, детерминированные, откалиброванные на тестовых кейсах (см. раздел 8). Это осознанное решение: за 4 дня нет данных для обучения, а explainability (показать цепочку-доказательство пользователю) важнее чёрного ящика.

---

## 2. Граф: структура и границы обхода

Единый pedigree-граф на PostgreSQL, без отдельной графовой БД (обоснование — см. `architecture-overview` / обсуждение в проекте). Два типа рёбер:

- `parent_of` — кровное ребро (ребёнок → отец, ребёнок → мать). У человека может быть 0, 1 или 2 таких ребра **вверх**. Это единственный тип ребра, который участвует в bloodline-обходе.
- `spouse_of` — ребро брака. Не кровное. Никогда не используется в traversal для матчинга. Используется только для построения **household view** (объединённого отображаемого графа).

Ключевой момент архитектуры: **семьи не сливаются физически**. Ребёнок от смешанного брака просто получает два `parent_of` ребра — к отцу и к матери — и его bloodline естественно проходит через обе исходные линии. Отдельная таблица `graph_link` фиксирует, что два изначально несвязанных куска графа теперь связаны браком — она используется только для дешёвого BFS при построении отображаемого графа, не для матчинга.

```
bloodline(person) — recursive CTE только по parent_of, без ограничения глубины
                     (естественно проходит через оба родителя при смешанных браках)

household(person) — BFS по parent_of ∪ (spouse_of с ограничением 1 affinal hop)
                     используется ТОЛЬКО для отображения, не для скоринга
```

---

## 3. Пайплайн матчинга (5 этапов)

```
1. Генерация кандидатов (candidate generation)   — дёшево, грубый фильтр
2. Построение цепочек (chain building)            — recursive CTE
3. Сопоставление цепочек (chain alignment)        — узел-к-узлу
4. Скоринг (scoring)                              — 3 уровня весов
5. Порог и статус (thresholding)                  — + evidence для UI
```

### Этап 1 — Генерация кандидатов

Fuzzy-поиск по имени (`pg_trgm`, similarity > 0.6) + мягкий гео-префильтр (сортировка, не отсечение) + окно по годам рождения, если известны.

```sql
SELECT p2.id, ...
FROM person p1
JOIN person p2 ON similarity(p1.normalized_name, p2.normalized_name) > 0.6
WHERE p1.owner_user_id != p2.owner_user_id
ORDER BY geo_prefilter_score DESC, name_similarity DESC
LIMIT 200
```

Страна/регион **никогда не жёсткий фильтр** — только влияет на сортировку и на итоговый score. Жёсткий фильтр отсёк бы реальную казахскую диаспору (Монголия, Китай, Узбекистан, Россия).

### Этап 2 — Построение цепочек

Recursive CTE по `parent_of` в обе стороны от точки совпадения (вверх — предки, вниз — боковые ветки/сиблинги) на глубину до ~10 поколений с защитой от циклов.

### Этап 3 — Alignment

Сопоставление узлов двух цепочек с допуском смещения поколения (±2), сравнение имени + гео + этнической принадлежности на каждом уровне.

### Этап 4 — Скоринг (подробности — раздел 4)

### Этап 5 — Пороги

```python
if final_score >= 0.75: status = "high_confidence"   # предложить подтверждение обеим сторонам
elif final_score >= 0.45: status = "possible_match"  # показать с evidence, ждать подтверждения
else: status = "discard"                              # не показывать
```

Автосклейка веток **никогда** не происходит без явного подтверждения обеих сторон.

---

## 4. Скоринг — три уровня весов

### Уровень 1 — Node-level (уверенность в совпадении одного узла)

```python
def node_confidence(node_a, node_b, gen_a, gen_b) -> float:
    name_sim = normalized_name_similarity(node_a.name, node_b.name)   # rapidfuzz
    rarity = name_rarity_score(node_a.name)                            # частотность имени
    geo = geo_similarity(node_a, node_b)                                # 0.5 если неизвестно
    gen_plausibility = generation_plausibility(gen_a, gen_b)            # структурная глубина + опц. дата
    ethnic_mod = ethnic_lineage_modifier(node_a, node_b)                # диапазон [-0.35, +0.20]

    base = name_sim*0.38 + rarity*0.24 + geo*0.18 + gen_plausibility*0.13
    return clamp(base + ethnic_mod * 0.07, 0, 1)
```

**Геосходство** (участвует на каждом этапе — и в префильтре, и здесь):
```python
def geo_similarity(a, b):
    if a.birth_country is None or b.birth_country is None: return 0.5   # неизвестно — нейтрально
    if a.birth_country == b.birth_country:
        return 1.0 if a.birth_region == b.birth_region else 0.8
    return MIGRATION_PLAUSIBILITY.get((a.birth_country, b.birth_country), 0.15)
```

**Правдоподобие разрыва поколений** (основной сигнал — структурная глубина в графе, бесплатна и всегда доступна; дата рождения — опциональное уточнение поверх):
```python
def generation_plausibility(gen_a, gen_b):
    diff = abs(gen_a - gen_b)
    return {0: 1.0, 1: 0.7, 2: 0.3}.get(diff, 0.05)

def gen_offset_score(node_a, node_b, gen_a, gen_b):
    structural = generation_plausibility(gen_a, gen_b)
    if node_a.birth_year_value and node_b.birth_year_value:
        year_diff = abs(node_a.birth_year_value - node_b.birth_year_value)
        year_score = 1.0 if year_diff <= 10 else max(0, 1 - (year_diff-10)/40)
        return structural*0.5 + year_score*0.5
    return structural
```

**Родовая иерархия (жуз → племя → ру)** — асимметрична: совпадение даёт маленький бонус, противоречие — большой штраф, отсутствие данных — ноль:
```python
def ethnic_lineage_modifier(a, b):
    if a.ru and b.ru:
        if a.ru == b.ru: return 0.20
        if a.tribe == b.tribe: return 0.05
        if a.zhuz == b.zhuz: return -0.15
        return -0.35
    if a.tribe and b.tribe:
        if a.tribe == b.tribe: return 0.10
        if a.zhuz == b.zhuz: return -0.15
        return -0.35
    if a.zhuz and b.zhuz:
        return 0.03 if a.zhuz == b.zhuz else -0.35
    return 0.0
```
Ру/племя/жуз — поля на конкретном узле (Person), не на пользователе. При вводе ру автоматически подставляются племя и жуз через `ru_taxonomy` (fuzzy-match, порог similarity > 0.75); если известен только жуз или только племя — сохраняется без даунстрим-подстановки.

Жёсткая проверка (hard reject, вне скоринга): **пол должен совпадать**, иначе узлы не сравниваются вообще.

### Уровень 2 — Chain-level (структура совпадения в целом)

```python
def chain_score(node_matches) -> float:
    avg_conf = mean(m.confidence for m in node_matches)
    chain_length = longest_continuous_chain(node_matches)
    length_multiplier = {1: 0.35, 2: 0.65, 3: 0.90, 4: 1.0}.get(min(chain_length,4), 1.0)
    sibling_bonus = 0.15 if has_sibling_match(node_matches) else 0.0
    known_ratio = known_fields_ratio(node_matches)
    completeness_factor = 0.6 + 0.4 * known_ratio
    return clamp((avg_conf*length_multiplier + sibling_bonus) * completeness_factor, 0, 1)
```
Резкий скачок множителя 1→2→3 отражает главную идею проекта: единичное совпадение — это ровно тот случай «однофамилец», от которого нужно защититься. Совпадение сиблинга — независимое доп. подтверждение, добавляется плоским бонусом.

### Уровень 3 — Context-level (доверие к источнику + агрегатные бонусы)

```python
def final_match_score(chain_score, person_a, person_b) -> float:
    source_factor = (SOURCE_TRUST[person_a.source_type] + SOURCE_TRUST[person_b.source_type]) / 2
    ru_bonus = 0.08 if same_ru(person_a, person_b) else 0.0
    confirmation_multiplier = 1 + min(0.1, 0.02 * shared_confirmation_count)
    score = chain_score * (0.7 + 0.3 * source_factor) + ru_bonus
    return clamp(score * confirmation_multiplier, 0, 1)

SOURCE_TRUST = {"oral_tradition": 0.6, "family_document": 0.85, "photo": 0.8, "archival_record": 1.0}
```
`source_type = photo` — это **не** компьютерное зрение. Наличие фото — просто метка доверия для человека, который подтверждает матч (иконка 📷 в evidence). Алгоритм не анализирует содержимое изображений — риск низкого качества на архивных снимках не оправдывает выгоду за 4 дня.

---

## 5. Неполные данные и дозаполнение

Ни одно поле предка (кроме имени и пола) не обязательно. Каждый опциональный признак при отсутствии даёт нейтральное значение (0.5 для geo, 0.0 модификатор для этники, structural-only для поколений).

**Пример из ТЗ:** цепочка `Асан(KZ, Астана) → Бекнур(KZ) → Султан(неизвестно) → ...` не рвётся из-за пропуска — узел без гео всё равно участвует в alignment по имени/позиции, просто с нейтральным вкладом геокомпонента.

**Дозаполнение → пересчёт (event-driven, не полный ресканинг базы):**
```python
def on_person_updated(person_id, changed_fields):
    affected = get_match_candidates_involving(person_id)
    for match in affected:
        if changed_fields & {"birth_country","birth_region"}: recompute_geo_component(match)
        if "ru" in changed_fields or "tribe" in changed_fields or "zhuz" in changed_fields:
            recompute_ethnic_component(match)
        if "full_name" in changed_fields: recompute_full_match(match)   # имя меняет alignment целиком
        notify_if_significant_change(match)   # порог: |Δscore| > 0.15
```
Хранится `PersonEditLog` для трассируемости изменений.

---

## 6. Брак, дети, объединённое отображение

- `marry(person_a, person_b)` создаёт **только** ребро `spouse_of` (+ запись в `graph_link`, если графы происхождения разные). Ни одна строка `person` не переписывается, никакого физического merge.
- Ребёнок получает два `parent_of` ребра — к обоим родителям. Bloodline ребёнка естественно проходит через обе исходные линии — merge происходит сам по себе через факт двух рёбер, без искусственной операции.
- Матчинг для каждого человека всегда считается по его собственному bloodline, независимо от браков вокруг.
- Отображаемый граф (`household view`) строится BFS по `graph_link` без ограничения глубины по свадьбам — растёт сколь угодно, это дешёвая операция над маленькой таблицей ссылок.
- Каждый показанный матч обязан нести провенанс: чья это кровь (сам пользователь / супруг(а) / далее по household) — иначе создаётся ложное впечатление близости родства.

```python
def get_household_matches(viewer_id):
    for person in get_household_graph(viewer_id, max_affinal_hops=1):
        for m in get_match_candidates(person.id):           # bloodline-матчи, посчитанные независимо
            m.relation_path_to_viewer = build_relation_path(viewer_id, person.id)
            yield m
```

---

## 7. Универсальность (не только казахи)

Все казахо-специфичные поля (`ru`, `tribe`, `zhuz`) — опциональны и не участвуют в скоринге, если не заполнены (модификатор = 0). Базовое ядро (имя, гео, поколение, source_type) работает одинаково для любой этнической группы. Это позволяет использовать те же веса для не-казахских деревьев без деградации логики — просто с одним модификатором меньше в формуле.

---

## 8. Калибровка без ML

Веса подобраны вручную и проверяются на фиксированном наборе тестовых пар (регресс-тесты, прогоняются при любом изменении формулы):

- 5 пар «явно одна цепочка предков» → ожидание `high_confidence`
- 5 пар «однофамильцы, частые имена, разные семьи» → ожидание `discard`
- 5 пар «общий предок 3 поколения назад, неполные данные» → ожидание `possible_match`
- Пограничные: наличие/отсутствие sibling-match, гео известно/неизвестно, конфликт жуза при совпадении имени

---

## 9. Явные ограничения (сознательно вне scope)

- Нет анализа содержимого фото (face recognition) — только метаданные наличия.
- Нет интеграции с госреестрами (ЗАГС и т.п. недоступны) — граф строится исключительно краудсорсингом.
- Автоматическая склейка веток никогда не происходит без подтверждения обеих сторон.
- Последние 1-2 поколения (живые люди) не показываются в авто-матчинге без явного запроса — приватность.