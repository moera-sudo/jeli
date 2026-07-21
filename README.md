# Jeli

**Краудсорсингая платформа восстановления родословной**

Контрибьютуторы 
- https://github.com/moera-sudo
- https://github.com/itszhdi

Проект **Jeli** выполнен в рамках хакатона **TechVision** в период с 17 по 21 июля.

# Описание серверной части

## Стэк

Серверная часть проекта выполнена целиком на языке программирования **Python 3.14**
с использованием веб-фреймворка **FastAPI**, ключевые зависимости проекта представляют из себя

1) UV - Используемый пакетный менеджер для Python
2) FastAPI - Веб-Фреймворк
3) SQLAlchemy - ОРМ для взаимодействия с базой данных
4) asyncpg - Асинхронный драйвер для взаимодействия с базой данных
5) rapidfuzz - Библиотека нечёткого сравнения строк, используется в алгоритме мэтчинга
   для оценки схожести ФИО между узлами разных деревьев (`fuzz.ratio`)
6) alembic - инструмент миграций БД
7) pyjwt + passlib/bcrypt - выпуск/проверка JWT-токенов и хеширование паролей (аутентификация)
8) python-multipart - обработка multipart-запросов (загрузка файлов в фиче media)

### Дополнительные инструменты
- PostgreSQL - Основная база данных (включая расширение `pg_trgm` - нечёткий поиск по имени в мэтчинге)
- docker/docker-compose - Инструменты контейнеризации для запуска проекта
- make - Утилита менеджера консольных команд для удобного управления проектом
- bruno - Инструмент API тестирования эндпоинтов. Вся Bruno коллекция доступна на GitHub в Jeli-Bruno

## Архитектура

Проект представляет из себя клиент-серверную монолитную архитектуру: FastAPI-бэкенд + PostgreSQL,
поднимаются вместе через Docker Compose. Клиентская часть разворачивается отдельно. Документация ко всем эндпоинтам доступна при запуске проекта по машруту `/api/docs` и `/api/redoc`. 

### 1. База данных, FastAPI и структура проекта

Верхнеуровневая структура `src/`:

```
src/
├── config/            # settings.py (Pydantic Settings из .env), database.py (async engine/session), logging.py
├── dependencies.py     # общие FastAPI-зависимости - get_user, get_user_ws
├── exceptions.py       # базовая иерархия AppException + единый обработчик ошибок
├── models.py           # агрегатор ORM-моделей всех фич (нужен Alembic для autogenerate)
├── router.py            # агрегатор роутов всех фич под общим префиксом /api
├── ws_manager.py        # синглтон ConnectionManager - общий WebSocket-менеджер
├── main.py             # точка входа FastAPI-приложения
└── features/
    ├── auth/
    ├── user/
    ├── graph/
    ├── matching/
    ├── notifications/
    ├── media/
    ├── messenger/
    ├── family/
    └── search/
```

Каждая фича в `features/` - самодостаточный модуль со своим `router.py` (эндпоинты), `schemas.py`
(Pydantic-модели запросов/ответов), `models.py` (ORM-модели), `service.py` (бизнес-логика),
`exceptions.py` (свои исключения, наследуются от общей иерархии `src/exceptions.py`),
`constants.py` и `utils.py` - без единой "God"-папки на весь проект. Такое разделение:

- **не даёт коду фич смешиваться** - правки в `graph` не тянут за собой случайных изменений в
  `matching` или `messenger`, у каждой фичи чётко определены зависимости от других (например,
  `matching` зависит от `graph`, но не наоборот - это соблюдается по всему проекту, чтобы не
  возникало циклических импортов);
- **упрощает онбординг и ревью** - разработчик, открывший `features/media/`, сразу видит весь
  контракт фичи (что принимает, что хранит, что отдаёт), не прыгая по всему репозиторию;
- **масштабируется линейно** - добавление новой фичи (как `family` или `search` на позднем этапе
  разработки) не требует трогать существующие модули, только зарегистрировать роутер/модели в
  `src/router.py`/`src/models.py`;
- **`dependencies.py`** - место для зависимостей, нужных СРАЗУ нескольким фичам (`get_user` -
  универсальная проверка Bearer-токена, `get_user_ws` - то же самое для WebSocket через
  query-параметр `?token=`, т.к. браузерный `WebSocket` API не умеет слать заголовки);
- **`exceptions.py`** - все доменные ошибки наследуются от `AppException` с собственным
  `status_code`, единый глобальный обработчик превращает их в консистентный JSON
  `{"detail": "..."}` - фичам не нужно вручную формировать HTTP-ответы на ошибки.

#### Схема базы данных (ERD)

```mermaid
erDiagram
    USER ||--o{ PERSON : "owner_user_id"
    USER ||--o| PERSON : "linked_user_id (nullable, unique)"
    USER ||--o{ RELATIONSHIP_PROPOSAL : "proposer_user_id"
    USER ||--o{ GRAPH_COLLABORATOR : "graph_owner_id / collaborator_user_id"
    USER ||--o{ NOTIFICATION : "user_id"
    USER ||--o{ CHAT : "user_a_id / user_b_id"
    USER ||--o{ MESSAGE : "sender_id"
    USER ||--o| FAMILY : "owner_user_id (unique)"
    PERSON ||--o{ RELATIONSHIP : "from_person_id / to_person_id"
    PERSON ||--o{ GRAPH_LINK : "person_a_id / person_b_id"
    PERSON ||--o{ RELATIONSHIP_PROPOSAL : "person_a_id / person_b_id"
    PERSON ||--o{ MATCH_CANDIDATE : "person_a_id / person_b_id"
    PERSON ||--o{ PERSON_EDIT_LOG : "person_id"
    RELATIONSHIP_PROPOSAL |o--o| RELATIONSHIP : "resulting_relationship_id"
    GRAPH_LINK }o--o| RELATIONSHIP : "source_relationship_id"
    GRAPH_LINK }o--o| MATCH_CANDIDATE : "source_match_id"
    CHAT ||--o{ MESSAGE : "chat_id"

    USER {
        uuid id PK
        string email
        string hashed_password
        string last_name "nullable"
        string first_name "nullable"
        string patronymic "nullable"
        string avatar_url "default-заглушка, ссылка вида /api/media/{id}"
        string gender "nullable"
        string current_city "nullable"
        string current_country "nullable"
        date birth_date "nullable"
        string birth_city "nullable"
        string birth_country "nullable"
        string description "nullable"
        string nationality "nullable"
        string ru "nullable"
        string zhuz "nullable"
        string tribe "nullable"
        string graph_invite_code "nullable"
        datetime created_at
        datetime updated_at
    }
    PERSON {
        uuid id PK
        uuid owner_user_id FK
        uuid linked_user_id FK "nullable, unique"
        uuid origin_label "union-find кластер"
        string last_name "nullable"
        string first_name "nullable"
        string patronymic "nullable"
        string normalized_name "lower+trim, для pg_trgm"
        string gender
        string avatar_url "nullable"
        bool is_alive
        int birth_year_value "nullable"
        string birth_year_precision
        int death_year_value "nullable"
        string death_year_precision
        string death_context "nullable"
        string birth_country "nullable"
        string birth_region "nullable"
        string ru "nullable"
        string tribe "nullable"
        string zhuz "nullable"
        string ethnic_source
        string source_type
        bool has_attached_file
        string file_url "nullable"
        string description "nullable"
        int confirmation_count
        string invite_code "nullable, unique"
        datetime created_at
        datetime updated_at
    }
    RELATIONSHIP {
        uuid id PK
        uuid from_person_id FK
        uuid to_person_id FK
        string type "child_of | spouse_of"
        int marriage_year "nullable"
        string marriage_end_reason "nullable, divorce | widowed"
        datetime created_at
    }
    GRAPH_LINK {
        uuid id PK
        uuid person_a_id FK
        uuid person_b_id FK
        string link_type "marriage | match_confirmed"
        uuid source_relationship_id FK "nullable"
        uuid source_match_id FK "nullable"
        datetime created_at
    }
    RELATIONSHIP_PROPOSAL {
        uuid id PK
        uuid proposer_user_id FK
        uuid person_a_id FK
        uuid person_b_id FK
        int marriage_year "nullable"
        string status "pending | confirmed | rejected"
        uuid resulting_relationship_id FK "nullable"
        datetime created_at
        datetime resolved_at "nullable"
    }
    MATCH_CANDIDATE {
        uuid id PK
        uuid person_a_id FK
        uuid person_b_id FK
        float score
        string status "high_confidence | possible_match | discard"
        jsonb evidence
        bool person_a_confirmed
        bool person_b_confirmed
        bool person_a_rejected
        bool person_b_rejected
        datetime confirmed_at "nullable"
        datetime last_computed_at "nullable"
        datetime created_at
    }
    GRAPH_COLLABORATOR {
        uuid id PK
        uuid graph_owner_id FK
        uuid collaborator_user_id FK
        datetime created_at
    }
    PERSON_EDIT_LOG {
        uuid id PK
        uuid person_id FK
        jsonb changed_fields
        datetime created_at
    }
    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        string type
        jsonb payload
        bool is_read
        datetime created_at
    }
    CHAT {
        uuid id PK
        uuid user_a_id FK
        uuid user_b_id FK
        datetime created_at
    }
    MESSAGE {
        uuid id PK
        uuid chat_id FK
        uuid sender_id FK
        string content
        datetime created_at
    }
    FAMILY {
        uuid id PK
        uuid owner_user_id FK "unique"
        string title
        string content "markdown"
        datetime created_at
        datetime updated_at
    }
    MEDIA {
        uuid id PK
        string content_type
        datetime created_at
    }
```

`MEDIA` не имеет входящих внешних ключей - на неё ссылаются просто строкой `/api/media/{id}` из
полей `avatar_url`/`file_url`/`content` (markdown семьи), не через FK. Файл лежит на диске под
именем `id`, `content_type` в БД нужен только чтобы `GET /media/{id}` отдал верный `Content-Type`.

### 2. Auth, Family, Media, Search, User

- **auth** - отвечает за создание аккаунта и выдачу сессии, ничего больше не знает о графе или
  профиле. Регистрация нарочно устроена в двух вариантах - короткая (только email, пароль, ФИО) и
  полная (сразу с городом, датой рождения, родовыми признаками и т.д.), чтобы не заставлять
  человека проходить многошаговую анкету, если он и так готов заполнить всё сразу. Пароль никогда
  не хранится в открытом виде - только bcrypt-хэш. Сессия полностью stateless: и access-, и
  refresh-токен - обычные JWT, сервер не хранит списков активных сессий и не может их досрочно
  отозвать - обновление токена - это просто проверка подписи старого refresh-токена и выпуск новой
  пары. Код приглашения в дерево можно передать прямо при регистрации, чтобы человек сразу
  зарегистрировался и присоединился к своему узлу одним действием, а не двумя отдельными.
- **user** - хранит личный профиль аккаунта (контакты, гео, дата рождения, родовые признаки,
  биография) отдельно от узла в дереве - это два разных объекта, потому что один и тот же человек
  может ещё не иметь своего узла в графе или, наоборот, у узла может не быть привязанного аккаунта.
  Именно данные из этого профиля считаются авторитетными: когда человек присоединяется к своему
  узлу по коду, они побеждают то, что за него вписал владелец дерева (см. раздел про Graph).
  Удаление аккаунта не происходит "в вакууме" - если пользователь был единственным владельцем
  графа, в котором есть другие зарегистрированные родственники, система сначала требует передать
  им владение, иначе отказывает.
- **family** - совместная письменная история рода, а не личный дневник каждого пользователя: одна
  запись **на весь граф**, а не на человека. Смысл в том, что все члены одной семьи - владелец
  графа, коллабораторы, привязанные к узлам родственники - читают и правят один и тот же текст, и
  результат виден всем одинаково, а не расходится на версии. В текст истории можно вставлять
  фотографии через общую фичу media.
- **media** - минимальный слой хранения файлов, не самостоятельная фича, а обслуживающая
  прослойка для остальных (аватарки, фото в истории семьи). Специально устроена так, чтобы
  отдавать уже загруженный файл без авторизации - иначе обычный `<img>` на фронтенде просто не
  показал бы картинку, ведь браузер не прикладывает Bearer-токен к загрузке изображений. Отдельно
  есть укороченный путь "загрузить и сразу привязать" - одним вызовом можно поставить аватар и
  себе, и любому узлу дерева, включая узел уже умершего человека: наличие фотографии в семейном
  архиве никак не зависит от того, жив ли человек.
- **search** - способ найти конкретного родственника в системе по имени, когда под рукой ещё нет
  его инвайт-кода. Ищет по нечёткому вхождению подстроки в ФИО зарегистрированных пользователей
  (не по узлам дерева), никогда не находит самого себя, и сразу сообщает, привязан ли найденный
  человек к какому-то узлу - именно это позволяет показать кнопку "написать" прямо в результатах
  поиска, не делая для этого отдельный запрос.

### 3. WebSocket, чаты и уведомления

Всё real-time приложение держится на **одном** WebSocket-эндпоинте - `GET /api/ws?token=...` -
и одном синглтоне `ws_manager.ConnectionManager` (`src/ws_manager.py`): словарь `user_id -> активное
соединение`, максимум одно соединение на пользователя. Авторизация - access-JWT в
query-параметре `token`, а не в заголовке `Authorization`: обычный браузерный `WebSocket` API не
умеет слать кастомные заголовки при хендшейке, поэтому токен передаётся в URL. Если токен
отсутствует/невалиден - соединение закрывается кодом `1008` **до** `accept()`, чтобы клиент получил
честный отказ хендшейка, а не разрыв уже установленного соединения.

Все события, независимо от того, какая фича их породила, идут через один и тот же сокет и
различаются только полем `"type"` в JSON-теле - это и называется мультиплексированием:

```jsonc
{"type": "message", "message": {...}}          // messenger
{"type": "notification", "notification": {...}} // notifications
```

Канал строго push-only от сервера: клиент ничего не обязан присылать, всё, что он всё же пришлёт,
сервер просто игнорирует (`async for _ in websocket.iter_text(): pass`).

**Notifications** (`src/features/notifications/`) - персональные события пользователя.
`create_notification()` **всегда** сохраняет запись в БД (для истории и офлайн-доступа) и
**дополнительно** пушит её через `ConnectionManager.send_to_user`, если получатель сейчас онлайн -
если нет, событие просто ждёт в истории до следующего `GET /notifications`. Типы уведомлений
рождаются в других фичах через события: новый мэтч, заметное изменение скора мэтча, новое
сообщение в чате. Эндпоинты: `GET /notifications` (список, есть фильтр `unread_only`),
`POST /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`.

**Messenger** (`src/features/messenger/`) - простые 1-на-1 текстовые чаты поверх того же сокета.
`Chat.user_a_id`/`user_b_id` хранятся в каноническом порядке (по `str(id)`, та же схема, что у
`MatchCandidate.person_a_id/person_b_id`) - это делает `POST /chats` идемпотентным: повторный вызов
с тем же `person_id` вернёт уже существующий чат, а не создаст дубликат, независимо от того, кто из
двоих инициировал разговор первым. При отправке сообщения (`POST /chats/{id}/messages`) сервис:
1. сохраняет `Message` в БД;
2. пушит получателю (если онлайн) `{"type": "message", ...}` - для мгновенной отрисовки в открытом
   чате;
3. параллельно создаёт `notifications`-уведомление `new_message` - оно попадёт в историю
   уведомлений и придёт тем же сокетом с `{"type": "notification", ...}`, независимо от того,
   открыт ли у получателя именно этот чат прямо сейчас.

Остальные эндпоинты: `GET /chats` (список с последним сообщением и `peer_user_id` - чтобы фронтенд
мог сразу открыть профиль собеседника), `GET /chats/{id}/messages` (история), `DELETE /chats/{id}`
(каскадно удаляет и сам чат, и все сообщения).

### 4. Graph и Matching

#### 4.1. Устройство графа

Отдельной сущности "граф" в БД нет - граф пользователя это просто множество узлов `Person` с общим
`owner_user_id`, всё остальное - рёбра между ними. Ключевые инварианты:

- `Relationship.type = "child_of"` направлен **ребёнок → родитель** (`from_person_id` = ребёнок).
  Максимум 2 ребра `child_of` "от себя" на узел (`MAX_PARENTS_PER_PERSON = 2`).
- `generation` (глубина/поколение) нигде не хранится - считается на лету рекурсивным CTE от точки
  обзора при каждом запросе.
- `origin_label` - метка кластера (union-find). Все узлы одной изначально несвязанной ветки имеют
  одинаковую метку; при подтверждённом браке или мэтче весь компонент одной стороны перекрашивается
  в метку другой - без физического слияния записей.
- Три уровня прав на узел: владелец графа (`owner_user_id`) - полный доступ; коллаборатор
  (`graph_collaborators`) - доступ ко всему графу владельца, но им можно назначить только уже
  привязанный к живому аккаунту узел; сам живой человек (`linked_user_id == текущий пользователь`) -
  может редактировать свой собственный узел, даже не будучи владельцем графа. Чтение графа
  полностью открыто любому авторизованному пользователю - закрыты только мутации.

**Обход предков/поколений - правило супруга.** Один и тот же волновой алгоритм (`_wave_traverse`)
используется и для `GET /graph` (с ограничением глубины), и для `household-graph` (без
ограничения):

```mermaid
sequenceDiagram
    participant C as Client
    participant R as graph/router
    participant S as graph/service._wave_traverse
    participant DB as PostgreSQL

    C->>R: GET /graph?focus={id}&depth=n (или /household-graph, depth=∞)
    R->>S: _wave_traverse(seed={focus}, max_iterations)
    loop пока frontier не пуст и iterations < max_iterations
        S->>DB: SELECT relationships WHERE type=child_of AND from_person_id IN frontier
        DB-->>S: рёбра "вверх" (к родителям)
        S->>DB: SELECT relationships WHERE type=child_of AND to_person_id IN frontier
        DB-->>S: рёбра "вниз" (к детям - сиблинги/племянники тоже попадают)
        S->>DB: SELECT relationships WHERE type=spouse_of AND (from/to) IN frontier
        DB-->>S: рёбра брака
        alt marriage_end_reason IS NULL (брак действующий)
            S->>S: супруг добавляется в next_frontier - обход ПРОДОЛЖИТСЯ через его предков/потомков
        else marriage_end_reason = divorce/widowed
            S->>S: супруг добавляется листом - БЕЗ рекурсии в его семью
        end
        S->>S: next_frontier -> frontier, generation[id] = глубина от focus
    end
    S->>DB: SELECT persons WHERE id IN generation.keys()
    DB-->>S: узлы с вычисленным generation
    S-->>R: GraphResponse{persons[], relationships[]}
    R-->>C: 200
```

Действующий брак продолжает обход через супруга (подтягивая всю его линию - так два независимо
созданных дерева "сливаются" для отображения после брака между ними), расторгнутый - обрывает его
на уровне листа, без рекурсии в его семью.

**Присоединение по инвайт-коду - приоритет данных самого человека.** Когда владелец заранее
заводит живого родственника вручную, а тот позже регистрируется и присоединяется по коду -
данные, которые человек только что сам указал о себе при регистрации, побеждают то, что вписал
владелец:

```mermaid
sequenceDiagram
    actor Owner
    actor RealPerson as Реальный человек
    participant R as graph/router
    participant S as graph/service.link_existing_person_by_invite_code
    participant DB as PostgreSQL

    Owner->>R: POST /persons {last_name: "как я думаю", ...} (заводит узел заранее)
    Owner->>R: POST /persons/{id}/invite-code
    R-->>Owner: "ABCD1234" (передаётся вне приложения)

    RealPerson->>R: POST /auth/register {last_name: "как есть на самом деле", ...}
    RealPerson->>R: POST /graph/join {invite_code: "ABCD1234"}
    R->>S: link_existing_person_by_invite_code(user, code)
    S->>S: person.linked_user_id = user.id
    loop last_name, first_name, patronymic, gender, birth_country, ru, tribe, zhuz, description
        alt у user поле заполнено
            S->>S: person[field] = user[field] - данные аккаунта ПОБЕЖДАЮТ то, что вписал owner
        else у user поле пусто
            S->>S: user[field] = person[field] - как раньше, подтягивается с узла на профиль
        end
    end
    S->>S: пересчитать normalized_name, если менялось ФИО
    S->>DB: commit
    S-->>RealPerson: Person{..., linked_user_id: user.id}
```

**Брак между независимыми деревьями** - прямое ребро между узлами разных владельцев создать
нельзя, только через предложение/подтверждение:

```mermaid
sequenceDiagram
    actor OwnerA as Owner A
    actor OwnerB as Owner B
    participant R as graph/router
    participant S as graph/service

    OwnerA->>R: POST /persons/{id}/invite-code (свой узел)
    R->>S: generate_invite_code_for_person
    S-->>OwnerA: "ABCD1234" (передаётся вне приложения)

    OwnerB->>R: POST /marriage-proposals {person_a_id: свой узел, target_invite_code: "ABCD1234"}
    R->>S: create_marriage_proposal
    S->>S: can_edit_graph(A)? can_edit_graph(B)?
    alt оба узла редактируются ОДНИМ пользователем
        S->>S: создать Relationship(spouse_of) сразу + _link_clusters(marriage)
        S-->>OwnerB: RelationshipProposal{status: "confirmed"} (мгновенно)
    else разные владельцы
        S-->>OwnerB: RelationshipProposal{status: "pending"}
        OwnerB->>R: GET /marriage-proposals (видит исходящее)
        OwnerA->>R: GET /marriage-proposals (видит входящее)
        OwnerA->>R: POST /marriage-proposals/{id}/confirm
        R->>S: confirm_marriage_proposal
        S->>S: создать Relationship(spouse_of, marriage_year)
        S->>S: _link_clusters(A, B, "marriage") -> GraphLink + релейбл origin_label
        S-->>OwnerA: RelationshipProposal{status: "confirmed"}
    end
```

#### 4.2. Алгоритм мэтчинга

Цель - не "найти совпадение по имени", а собрать доказательную цепочку общих предков между двумя
независимо заполненными деревьями, и только при достаточной длине/уверенности этой цепочки
предложить её пользователям на подтверждение.

**От мутации графа до записи матча и уведомления.** Пересчёт всегда полный (по всем 5 этапам
заново) - триггерится любым созданием/правкой узла или связи (`POST /persons`,
`PATCH /persons/{id}`, `POST /persons/insert-between`, `POST /relationships`), выполняется в фоне
уже после того, как клиент получил ответ:

```mermaid
sequenceDiagram
    participant C as Client
    participant R as graph/router
    participant BG as BackgroundTasks
    participant M as matching.recompute_for_person
    participant CTE as get_ancestors_with_depth (CTE)
    participant F1 as find_candidates (Stage 1)
    participant A as align_and_score (Stage 2-5)
    participant U as _upsert_match
    participant DB as PostgreSQL
    participant N as notifications.service

    C->>R: POST /persons | PATCH /persons/{id} | POST /relationships
    R->>DB: commit мутации графа
    R-->>C: 200 (ответ уходит СРАЗУ, до пересчёта)
    R->>BG: add_task(recompute_for_person_task, person_id)

    BG->>M: recompute_for_person(person_id)  [своя DB-сессия]
    M->>CTE: предки person'а (child_of, вверх, без ограничения глубины)
    M->>F1: find_candidates(person)
    F1->>DB: similarity(normalized_name) > 0.6 AND owner_user_id != AND origin_label != , ORDER BY гео, LIMIT 200
    DB-->>F1: до 200 кандидатов
    F1-->>M: candidates[]

    loop для каждого кандидата
        M->>M: hard reject если candidate.gender != person.gender
        M->>A: align_and_score(person, ancestors, candidate)
        A->>CTE: предки кандидата
        alt gen=0 (сама якорная пара) ниже NODE_MATCH_MIN_CONFIDENCE
            A-->>M: (0.0, discard, {"reason": "root_pair_below_threshold"})
        else
            loop gen = 1..MAX_CHAIN_DEPTH(10)
                A->>A: person-сторона на глубине ровно gen, candidate-сторона на [gen-2, gen+2] минус уже использованные
                A->>A: node_confidence на каждую пару (hard gender reject), оставить >= 0.4
                A->>A: лучшая пара -> NodeMatch поколения, sibling_count = кол-во person-side узлов с уверенным совпадением
            end
            A->>A: chain_score(node_matches) -> final_match_score(chain, person, candidate)
            A->>A: порог: >=0.75 high_confidence / >=0.45 possible_match / иначе discard
            A-->>M: (final_score, status, evidence)
        end
        M->>U: _upsert_match(person, candidate, score, status, evidence)
        U->>DB: canonical_order по str(id) -> SELECT существующий MatchCandidate(person_a,person_b)
        alt уже resolved (confirmed или rejected любой стороной)
            U->>U: молча пропустить - фоновый пересчёт не переписывает решение человека
        else новая запись
            U->>DB: INSERT MatchCandidate
            alt status != discard
                U->>N: create_notification(оба владельца, NEW_MATCH)
            end
        else существующая, ещё не resolved
            U->>DB: UPDATE score/status/evidence
            alt |Δscore| > 0.15 AND status != discard
                U->>N: create_notification(оба владельца, MATCH_SCORE_CHANGED)
            end
        end
    end
```

**Формула скоринга** - три уровня весов, точные значения:

```mermaid
flowchart TD
    subgraph "Node-level - node_confidence(a, b, gen_a, gen_b)"
        NS["name_sim = rapidfuzz.ratio(a,b) / 100"]
        RAR["rarity = 1.0 / 0.7 / 0.4 / 0.15\nпо числу других persons с тем же именем\n(капа 0.4 если имя в списке частых казахских имён)"]
        GEO["geo = 0.5 неизвестно / 1.0 та же страна+регион\n/ 0.8 та же страна / 0.6 правдоподобная миграция (KZ↔RU,MN,CN,UZ) / 0.15 иначе"]
        GEN["gen_plaus = структурная{0:1.0,1:0.7,2:0.3,иначе:0.05}\nесли оба birth_year известны: 50/50 с year_score(|Δ|<=10 -> 1.0)"]
        ETH["ethnic_mod ∈ [-0.35, +0.20]\nсовпадение ru/tribe/zhuz -> бонус, конфликт -> штраф, нет данных -> 0"]
        BASE["base = name_sim·0.38 + rarity·0.24 + geo·0.18 + gen_plaus·0.13"]
        NODE["node_confidence = clamp(base + ethnic_mod·0.07)"]
        NS --> BASE
        RAR --> BASE
        GEO --> BASE
        GEN --> BASE
        BASE --> NODE
        ETH --> NODE
    end

    subgraph "Chain-level - chain_score(node_matches)"
        AVG["avg_conf = mean(confidence по всем NodeMatch)"]
        LEN["chain_length = самый длинный НЕПРЕРЫВНЫЙ участок поколений от gen=0\n(один пропуск обрывает счёт, даже если глубже есть совпадения)"]
        MULT["length_multiplier {1:0.35, 2:0.65, 3:0.90, 4+:1.0}"]
        SIB["sibling_bonus = +0.15 если на каком-то gen>0 несколько person-side узлов совпали уверенно"]
        COMP["completeness_factor = 0.6 + 0.4·(доля заполненных полей birth_year/country/region/ru/tribe/zhuz)"]
        CHAIN["chain_score = clamp((avg_conf·length_multiplier + sibling_bonus) · completeness_factor)"]
        NODE --> AVG
        AVG --> CHAIN
        LEN --> MULT --> CHAIN
        SIB --> CHAIN
        COMP --> CHAIN
    end

    subgraph "Context-level - final_match_score"
        SRC["source_factor = avg(SOURCE_TRUST[a.source_type], SOURCE_TRUST[b.source_type])\noral_tradition 0.6 / photo 0.8 / family_document 0.85 / archival_record 1.0"]
        RU["ru_bonus = +0.08 если оба ru совпадают"]
        CONF["confirmation_multiplier = 1 + min(0.1, 0.02·min(confirmation_count_a, confirmation_count_b))"]
        FINAL["final_score = clamp(chain_score·(0.7+0.3·source_factor) + ru_bonus) · confirmation_multiplier"]
        CHAIN --> FINAL
        SRC --> FINAL
        RU --> FINAL
        CONF --> FINAL
    end

    FINAL --> D{"final_score"}
    D -->|">= 0.75"| HC["high_confidence"]
    D -->|">= 0.45"| PM["possible_match"]
    D -->|"иначе"| DISC["discard"]
```

Ключевая идея весов: единичное совпадение имени (`chain_length=1`) даёт множитель всего **0.35** -
это ровно случай "однофамилец", а не родственник. Доказательная сила растёт нелинейно с длиной
непрерывной цепочки совпавших поколений, а не с одним ярким совпадением.

**Подтверждение и слияние кластеров** - автоматическое объединение веток никогда не происходит,
даже `high_confidence` остаётся предложением, требующим явного согласия обеих сторон:

```mermaid
sequenceDiagram
    actor OwnerA as Owner A
    actor OwnerB as Owner B
    participant R as graph/router
    participant S as graph/service.confirm_match
    participant LC as _link_clusters / _propagate_origin_label
    participant DB as PostgreSQL
    participant N as notifications.service

    OwnerA->>R: POST /matches/{id}/confirm
    R->>S: confirm_match(match, current_user=A)
    S->>S: person_a_confirmed = True (только своя сторона)
    S->>DB: commit (confirmed_at всё ещё NULL - ждём вторую сторону)

    OwnerB->>R: POST /matches/{id}/confirm
    R->>S: confirm_match(match, current_user=B)
    S->>S: person_b_confirmed = True
    alt обе стороны подтвердили
        S->>S: confirmed_at = now()
        S->>LC: _link_clusters(person_a, person_b, "match_confirmed", source_match_id)
        LC->>DB: INSERT GraphLink(link_type=match_confirmed)
        LC->>DB: UPDATE persons SET origin_label = origin_label(A) WHERE id IN (весь компонент B) - union-find релейбл
        S->>S: confirmation_count += 1 для обоих (ПОСЛЕ релейбла - _propagate_origin_label делает db.refresh, стёр бы несохранённые изменения)
        S->>DB: commit
    else только одна сторона (пока)
        Note over S: confirmed_at остаётся NULL, ждём вторую сторону
    end

    Note over LC,DB: С этого момента find_candidates (Этап 1) фильтрует по origin_label != -<br/>эта пара/кластер больше НЕ предложится заново при последующих пересчётах.
```

`reject_match` - зеркально, но никогда не вызывает `_link_clusters`; отклонение одной стороной
финально блокирует повторное confirm с этой же стороны.

## Запуск проекта

1. Скопировать `.env.example` в `.env` и заполнить значения (`DATABASE_URL`, `POSTGRES_*`,
   `JWT_SECRET_KEY`, порты и т.д.) - без `JWT_SECRET_KEY`/`DATABASE_URL` приложение не запустится.
2. Поднять backend + PostgreSQL одной командой:
   ```
   make up
   ```
3. Применить миграции БД:
   ```
   make migrate
   ```
4. Backend доступен на `http://localhost:<BACKEND_PORT>/api`, Swagger - на `/docs`.

Прочие полезные команды из `Makefile`:

- `make down` / `make restart` - остановить / пересобрать и перезапустить контейнеры
- `make logs` - логи backend-контейнера
- `make makemigrations m="описание"` - сгенерировать новую Alembic-миграцию по изменениям в моделях
- `make reset-db` - **полный** сброс БД (роняет volume целиком) + миграции с нуля, для чистого
  окружения
- `make sync` - синхронизировать зависимости через `uv`
- `make run` - локальный запуск без Docker (нужна доступная PostgreSQL, см. `.env`)
- `make matching-test` - нагрузочный/точностный тест алгоритма мэтчинга на синтетических деревьях
  (`Jeli-Bruno/scripts/matching_load_test.py`)

## Тестирование

Все эндпоинты покрыты автоматизированной коллекцией **Bruno** - `Jeli-Bruno/` в корне проекта.
Переменные окружения лежат в `Jeli-Bruno/environments/local.yml`, а папка `scenario/` прогоняет
реалистичный многопользовательский сценарий (несколько аккаунтов, пересекающиеся деревья, чаты,
мэтчинг, коллабораторы) целиком через реальный HTTP API. Прогнать весь набор:

```
cd Jeli-Bruno && npx --yes @usebruno/cli run . -r --env local --tests-only
```

(`--tests-only` пропускает единственный нативный `type: websocket` элемент коллекции, который CLI не
умеет исполнять - он существует только для ручной проверки в десктоп-приложении Bruno.)
