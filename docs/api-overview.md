# API Overview — «Jeli»

Стек: FastAPI + PostgreSQL (единая реляционная БД для аккаунтов, графа и матчей — обоснование см. в обсуждении архитектуры проекта; отдельная графовая БД не используется, весь traversal — через recursive CTE).

Матчинг пересчитывается событийно (при добавлении/изменении узла), а не по запросу синхронно — тяжёлые операции идут в background job.

---

## 1. Основные сущности (что нужно API отдавать/принимать)

### User (аккаунт)
```json
{
  "id": "uuid",
  "email": "string",
  "country": "string | null",
  "created_at": "datetime"
}
```

### Person (узел графа — предок/родственник)
Обязательны только `full_name` и `gender`. Всё остальное — опционально, с деградацией до нейтральных значений в скоринге.

```json
{
  "id": "uuid",
  "owner_user_id": "uuid",
  "origin_label": "string | null",

  "full_name": "string",
  "gender": "male | female",

  "birth_year_value": "int | null",
  "birth_year_precision": "exact | decade | generation_estimate | unknown",
  "death_year_value": "int | null",
  "death_year_precision": "exact | decade | unknown",
  "death_context": "natural | war | repression | unknown | null",

  "birth_country": "string | null (ISO code)",
  "birth_region": "string | null",

  "ru": "string | null",
  "tribe": "string | null (авто-подставляется по ru)",
  "zhuz": "string | null (авто-подставляется по ru/tribe)",
  "ethnic_source": "derived_from_ru | manual_tribe_only | manual_zhuz_only | none",

  "source_type": "oral_tradition | family_document | photo | archival_record",
  "has_attached_file": "bool",
  "file_url": "string | null",

  "confirmation_count": "int"
}
```

### Relationship (ребро)
```json
{
  "id": "uuid",
  "from_person_id": "uuid",
  "to_person_id": "uuid",
  "type": "parent_of | spouse_of",
  "marriage_year": "int | null",
  "marriage_end_reason": "divorce | widowed | null"
}
```

### MatchCandidate (результат мэтчинга)
```json
{
  "id": "uuid",
  "person_a_id": "uuid",
  "person_b_id": "uuid",
  "score": "float 0..1",
  "status": "high_confidence | possible_match | discard",
  "evidence": {
    "chain": [
      {
        "node_a": { "id": "uuid", "name": "string", "generation": "int" },
        "node_b": { "id": "uuid", "name": "string", "generation": "int" },
        "name_similarity": "float",
        "geo_match": "bool | null",
        "ethnic_match": "same_ru | same_tribe | same_zhuz | conflict | unknown"
      }
    ],
    "chain_length": "int",
    "sibling_confirmed": "bool"
  },
  "relation_path_to_viewer": "string (человекочитаемо, для household view)",
  "is_blood_relative_of_viewer": "bool",
  "last_computed_at": "datetime"
}
```

### RuTaxonomy (справочник, read-only для клиента)
```json
{ "ru_name": "string", "tribe_name": "string", "zhuz_name": "string" }
```

---

## 2. Карта эндпоинтов

### Auth
| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/register` | Регистрация, обязательно `email`, `password`; `country` опционально |
| POST | `/auth/login` | Логин, возвращает JWT |

### Person (граф)
| Метод | Путь | Описание |
|---|---|---|
| POST | `/persons` | Создать узел (предка). Триггерит recompute кандидатов в фоне |
| GET | `/persons/{id}` | Получить узел |
| PATCH | `/persons/{id}` | Дозаполнение/правка полей (гео, дата, ру и т.д.) → событийный пересчёт затронутых матчей |
| DELETE | `/persons/{id}` | Удалить узел (только владелец) |
| POST | `/persons/{id}/ru` | Отдельный эндпоинт для установки ру с авто-подстановкой tribe/zhuz через `ru_taxonomy` |
| POST | `/persons/{id}/attachment` | Прикрепить фото/документ (source_type, file_url) |

### Relationship
| Метод | Путь | Описание |
|---|---|---|
| POST | `/relationships` | Создать ребро `parent_of` или `spouse_of`. При `spouse_of` между разными `origin_label` — авто-создание `graph_link` |
| DELETE | `/relationships/{id}` | Удалить ребро (например, развод — не трогает bloodline) |

### Граф — чтение
| Метод | Путь | Описание |
|---|---|---|
| GET | `/persons/{id}/bloodline` | Кровная цепочка предков/потомков (только `parent_of`), для отладки/отдельного показа |
| GET | `/persons/{id}/household-graph` | Объединённый граф для отображения: bloodline + супруги с ограничением 1 affinal hop, BFS без ограничения по числу свадеб |

### Matching
| Метод | Путь | Описание |
|---|---|---|
| GET | `/persons/{id}/matches` | Матчи по чистому bloodline данного узла (что уже посчитано) |
| GET | `/users/{id}/matches` | **Основной эндпоинт для UI.** Агрегированные матчи по всему household graph пользователя, с провенансом (`relation_path_to_viewer`, `is_blood_relative_of_viewer`), отсортированы по score |
| POST | `/matches/{id}/confirm` | Пользователь подтверждает совпадение (нужно подтверждение обеих сторон для статуса `confirmed`) |
| POST | `/matches/{id}/reject` | Отклонить предложенное совпадение (feedback для будущей калибровки весов) |
| POST | `/matches/recompute` (internal/background) | Пересчёт по конкретному `person_id` после правки — не публичный, вызывается воркером |

### Справочники
| Метод | Путь | Описание |
|---|---|---|
| GET | `/taxonomy/ru?query=` | Поиск по справочнику ру (для автокомплита при вводе, с fuzzy-подсказками) |
| GET | `/taxonomy/countries` | Список стран для выбора (ISO-коды + локализованные названия) |

---

## 3. Поток данных на ключевых сценариях

**Добавление предка:**
```
POST /persons  →  запись в БД  →  background job: candidate generation (Этап 1-5 алгоритма)
                                    → запись/обновление MatchCandidate
```

**Дозаполнение (например, регион у Бекнура):**
```
PATCH /persons/{id} {"birth_region": "Сырдарья"}
   → PersonEditLog запись
   → находим все MatchCandidate, где person_id участвует
   → recompute только geo-компонент (не всю формулу) для скорости
   → если |Δscore| > 0.15 → push-уведомление пользователю
```

**Брак:**
```
POST /relationships {"type": "spouse_of", "from": A, "to": B}
   → если origin_label(A) != origin_label(B): создать graph_link
   → bloodline A и B остаются раздельными, матчинг не трогается
   → household-graph обоих теперь включает друг друга
```

**Рождение ребёнка:**
```
POST /persons (ребёнок)
POST /relationships {"type": "parent_of", "from": child, "to": father}
POST /relationships {"type": "parent_of", "from": child, "to": mother}
   → bloodline ребёнка теперь естественно включает обе линии — без доп. действий
```

**Просмотр совпадений пользователем:**
```
GET /users/{id}/matches
   → backend строит household-graph (BFS по graph_link)
   → для каждого person в household достаёт уже посчитанные bloodline-матчи
   → добавляет provenance (чья это кровь)
   → сортирует по score, возвращает с evidence для UI (чтобы показать цепочку-доказательство)
```

---

## 4. Что API намеренно НЕ делает

- Не принимает и не обрабатывает изображения как вход в скоринг — `file_url` хранится только для показа человеку в evidence.
- Не выполняет синхронный полный пересчёт всей базы при каждой правке — только точечный recompute затронутых `MatchCandidate`.
- Не позволяет клиенту напрямую задавать `family_graph_id`/merge графов — это внутренняя, автоматическая механика через `relationship` + `graph_link`.
- Не автоматически подтверждает и не «склеивает» деревья — `high_confidence` матч всё равно требует explicit `POST /matches/{id}/confirm` от обеих сторон.