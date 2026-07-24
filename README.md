# Jeli

**A crowdsourced platform for reconstructing family trees**

Contributors
- https://github.com/moera-sudo
- https://github.com/itszhdi

The **Jeli** project was built during the **TechVision** hackathon, held from July 17 to July 21.

# Backend Description

## Stack

The backend is built entirely in **Python 3.14** using the **FastAPI** web framework. The project's key dependencies are:

1) UV - the Python package manager used in the project
2) FastAPI - the web framework
3) SQLAlchemy - the ORM for database interaction
4) asyncpg - the asynchronous driver for database interaction
5) rapidfuzz - a fuzzy string matching library, used in the matching algorithm
   to score full-name similarity between nodes from different trees (`fuzz.ratio`)
6) alembic - the database migration tool
7) pyjwt + passlib/bcrypt - issuing/verifying JWT tokens and password hashing (authentication)
8) python-multipart - handling multipart requests (file uploads in the media feature)

### Additional tools
- PostgreSQL - the primary database (including the `pg_trgm` extension - fuzzy name search in matching)
- docker/docker-compose - containerization tools for running the project
- make - a console command runner utility for convenient project management. If make is unavailable on your OS, you'll need to run the commands from the Makefile directly
- bruno - an API endpoint testing tool. The entire Bruno collection is available on GitHub in Jeli-Bruno

## Architecture

The project follows a client-server monolithic architecture: a FastAPI backend + PostgreSQL,
both spun up together via Docker Compose. The client is deployed separately. Documentation for all endpoints is available once the project is running, at `/api/docs` and `/api/redoc`.

### 1. Database, FastAPI, and Project Structure

Top-level structure of `src/`:

```
src/
├── config/            # settings.py (Pydantic Settings from .env), database.py (async engine/session), logging.py
├── dependencies.py     # shared FastAPI dependencies - get_user, get_user_ws
├── exceptions.py       # base AppException hierarchy + unified error handler
├── models.py           # ORM model aggregator for all features (needed by Alembic for autogenerate)
├── router.py            # route aggregator for all features under the common /api prefix
├── ws_manager.py        # ConnectionManager singleton - shared WebSocket manager
├── main.py             # FastAPI application entry point
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

Each feature under `features/` is a self-contained module with its own `router.py` (endpoints), `schemas.py`
(Pydantic request/response models), `models.py` (ORM models), `service.py` (business logic),
`exceptions.py` (feature-specific exceptions, inheriting from the shared hierarchy in `src/exceptions.py`),
`constants.py`, and `utils.py` - with no single project-wide "God" folder. This separation:

- **keeps feature code from mixing** - changes in `graph` don't drag along accidental changes in
  `matching` or `messenger`; each feature has clearly defined dependencies on others (for example,
  `matching` depends on `graph`, but not the other way around - this rule is enforced throughout the
  project to avoid circular imports);
- **simplifies onboarding and review** - a developer opening `features/media/` immediately sees the
  entire feature contract (what it accepts, what it stores, what it returns) without jumping around
  the whole repository;
- **scales linearly** - adding a new feature (like `family` or `search` at a later development
  stage) doesn't require touching existing modules, only registering the router/models in
  `src/router.py`/`src/models.py`;
- **`dependencies.py`** - a place for dependencies needed by SEVERAL features at once (`get_user` -
  a universal Bearer token check, `get_user_ws` - the same thing for WebSocket via the
  `?token=` query parameter, since the browser `WebSocket` API can't send headers);
- **`exceptions.py`** - all domain errors inherit from `AppException` with their own
  `status_code`; a single global handler turns them into a consistent JSON
  `{"detail": "..."}` response - features don't need to manually build HTTP error responses.

#### Database Schema (ERD)

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
        string avatar_url "default placeholder, link like /api/media/{id}"
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
        uuid origin_label "union-find cluster"
        string last_name "nullable"
        string first_name "nullable"
        string patronymic "nullable"
        string normalized_name "lower+trim, for pg_trgm"
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

`MEDIA` has no incoming foreign keys - it is referenced simply as a string `/api/media/{id}` from
the `avatar_url`/`file_url`/`content` (family markdown) fields, not via FK. The file is stored on disk
under the name `id`; `content_type` in the DB is needed only so that `GET /media/{id}` returns the
correct `Content-Type`.

### 2. Auth, Family, Media, Search, User

- **auth** - responsible for account creation and issuing sessions; it knows nothing else about
  the graph or the profile. Registration is deliberately available in two variants - a short one
  (email, password, full name only) and a full one (including city, date of birth, ethnic
  attributes, etc. right away), so as not to force the user through a multi-step questionnaire if
  they're already ready to fill everything in at once. The password is never stored in plain text -
  only as a bcrypt hash. The session is fully stateless: both the access and refresh tokens are
  plain JWTs; the server keeps no list of active sessions and cannot revoke them early - refreshing a
  token is simply verifying the old refresh token's signature and issuing a new pair. A tree invite
  code can be supplied right at registration, so a person can register and join their own node in a
  single action instead of two separate ones.
- **user** - stores the account's personal profile (contacts, geography, date of birth, ethnic
  attributes, biography) separately from the tree node - these are two different objects, because
  the same person may not yet have their own node in the graph, or conversely a node may have no
  linked account. Data from this profile is treated as authoritative: when a person joins their node
  via a code, it overrides whatever the tree owner had entered on their behalf (see the Graph
  section). Account deletion doesn't happen "in a vacuum" - if the user was the sole owner of a
  graph that contains other registered relatives, the system first requires ownership to be
  transferred to one of them, otherwise it refuses.
- **family** - a shared written family history, not a personal diary for each user: one entry
  **per whole graph**, not per person. The idea is that all members of one family - the graph owner,
  collaborators, relatives linked to nodes - read and edit the same text, and the result is visible
  identically to everyone rather than diverging into separate versions. Photos can be embedded in the
  history text via the shared media feature.
- **media** - a minimal file storage layer, not a standalone feature but a supporting layer for
  the others (avatars, photos in the family history). It's deliberately built to serve an already
  uploaded file without authorization - otherwise a plain `<img>` tag on the frontend simply wouldn't
  display the picture, since the browser doesn't attach a Bearer token to image loads. There's also
  a shortcut path for "upload and immediately attach" - a single call can set an avatar both for
  yourself and for any tree node, including the node of a deceased person: having a photo in the
  family archive doesn't depend on whether the person is alive.
- **search** - a way to find a specific relative in the system by name, when you don't yet have
  their invite code. It searches by fuzzy substring match against the full names of registered users
  (not tree nodes), never returns the searcher themselves, and immediately reports whether the found
  person is linked to any node - this is exactly what lets the UI show a "message" button right in
  the search results, without a separate request.

### 3. WebSocket, Chats, and Notifications

The entire real-time application rests on a **single** WebSocket endpoint - `GET /api/ws?token=...` -
and one `ws_manager.ConnectionManager` singleton (`src/ws_manager.py`): a dictionary of `user_id ->
active connection`, at most one connection per user. Authorization uses the access JWT in the
`token` query parameter rather than the `Authorization` header: the standard browser `WebSocket` API
can't send custom headers during the handshake, so the token is passed in the URL. If the token is
missing or invalid, the connection is closed with code `1008` **before** `accept()`, so the client
gets an honest handshake rejection rather than an already-established connection being torn down.

All events, regardless of which feature produced them, travel through the same socket and are
distinguished only by the `"type"` field in the JSON body - this is what's called multiplexing:

```jsonc
{"type": "message", "message": {...}}          // messenger
{"type": "notification", "notification": {...}} // notifications
```

The channel is strictly server push-only: the client isn't required to send anything, and
whatever it does send is simply ignored by the server (`async for _ in websocket.iter_text(): pass`).

**Notifications** (`src/features/notifications/`) - a user's personal events.
`create_notification()` **always** saves a record to the DB (for history and offline access) and
**additionally** pushes it via `ConnectionManager.send_to_user` if the recipient is currently online -
if not, the event simply waits in the history until the next `GET /notifications`. Notification types
originate in other features through events: a new match, a noticeable change in a match's score, a
new chat message. Endpoints: `GET /notifications` (list, with an `unread_only` filter),
`POST /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`.

**Messenger** (`src/features/messenger/`) - simple 1-on-1 text chats on top of the same socket.
`Chat.user_a_id`/`user_b_id` are stored in canonical order (by `str(id)`, the same scheme as
`MatchCandidate.person_a_id/person_b_id`) - this makes `POST /chats` idempotent: calling it again
with the same `person_id` returns the already-existing chat instead of creating a duplicate,
regardless of which of the two initiated the conversation first. When sending a message
(`POST /chats/{id}/messages`) the service:
1. saves the `Message` to the DB;
2. pushes `{"type": "message", ...}` to the recipient (if online) - for instant rendering in an open
   chat;
3. in parallel creates a `new_message` notification via `notifications` - it lands in the
   notification history and arrives over the same socket as `{"type": "notification", ...}`,
   regardless of whether the recipient currently has this exact chat open.

Other endpoints: `GET /chats` (a list with the last message and `peer_user_id` - so the frontend
can immediately open the interlocutor's profile), `GET /chats/{id}/messages` (history),
`DELETE /chats/{id}` (cascades to delete both the chat itself and all messages).

### 4. Graph and Matching

#### 4.1. Graph Design

There is no separate "graph" entity in the DB - a user's graph is simply the set of `Person`
nodes sharing a common `owner_user_id`; everything else is edges between them. Key invariants:

- `Relationship.type = "child_of"` is directed **child → parent** (`from_person_id` = the child).
  A maximum of 2 outgoing `child_of` edges per node (`MAX_PARENTS_PER_PERSON = 2`).
- `generation` (depth/generation) is not stored anywhere - it's computed on the fly with a
  recursive CTE from the viewpoint on every request.
- `origin_label` - a cluster label (union-find). All nodes of one originally disconnected branch
  share the same label; on a confirmed marriage or match, the entire component on one side is
  relabeled to the other side's label - without physically merging records.
- There are three permission levels on a node: the graph owner (`owner_user_id`) - full access;
  a collaborator (`graph_collaborators`) - access to the owner's entire graph, though only a node
  already linked to a live account can be assigned as one; the living person themselves
  (`linked_user_id == current user`) - can edit their own node even without being the graph owner.
  Reading the graph is fully open to any authenticated user - only mutations are restricted.

**Traversing ancestors/generations - the spouse rule.** The same wave algorithm
(`_wave_traverse`) is used both for `GET /graph` (with a depth limit) and for `household-graph`
(unlimited):

```mermaid
sequenceDiagram
    participant C as Client
    participant R as graph/router
    participant S as graph/service._wave_traverse
    participant DB as PostgreSQL

    C->>R: GET /graph?focus={id}&depth=n (or /household-graph, depth=∞)
    R->>S: _wave_traverse(seed={focus}, max_iterations)
    loop while frontier is non-empty and iterations < max_iterations
        S->>DB: SELECT relationships WHERE type=child_of AND from_person_id IN frontier
        DB-->>S: edges "up" (to parents)
        S->>DB: SELECT relationships WHERE type=child_of AND to_person_id IN frontier
        DB-->>S: edges "down" (to children - siblings/nephews and nieces get included too)
        S->>DB: SELECT relationships WHERE type=spouse_of AND (from/to) IN frontier
        DB-->>S: marriage edges
        alt marriage_end_reason IS NULL (marriage still active)
            S->>S: spouse is added to next_frontier - traversal CONTINUES through their ancestors/descendants
        else marriage_end_reason = divorce/widowed
            S->>S: spouse is added as a leaf - WITHOUT recursing into their family
        end
        S->>S: next_frontier -> frontier, generation[id] = depth from focus
    end
    S->>DB: SELECT persons WHERE id IN generation.keys()
    DB-->>S: nodes with computed generation
    S-->>R: GraphResponse{persons[], relationships[]}
    R-->>C: 200
```

An active marriage continues the traversal through the spouse (pulling in their entire line -
this is how two independently created trees "merge" for display once there's a marriage between
them), while a dissolved one cuts it off at the leaf level, without recursing into their family.

**Joining via invite code - the person's own data takes priority.** When an owner manually
creates a node for a living relative in advance, and that person later registers and joins via the
code, the data the person just entered about themselves at registration overrides what the owner had
entered:

```mermaid
sequenceDiagram
    actor Owner
    actor RealPerson as Real Person
    participant R as graph/router
    participant S as graph/service.link_existing_person_by_invite_code
    participant DB as PostgreSQL

    Owner->>R: POST /persons {last_name: "as I imagine it", ...} (creates a node in advance)
    Owner->>R: POST /persons/{id}/invite-code
    R-->>Owner: "ABCD1234" (shared outside the app)

    RealPerson->>R: POST /auth/register {last_name: "as it actually is", ...}
    RealPerson->>R: POST /graph/join {invite_code: "ABCD1234"}
    R->>S: link_existing_person_by_invite_code(user, code)
    S->>S: person.linked_user_id = user.id
    loop last_name, first_name, patronymic, gender, birth_country, ru, tribe, zhuz, description
        alt user's field is filled in
            S->>S: person[field] = user[field] - account data OVERRIDES what the owner entered
        else user's field is empty
            S->>S: user[field] = person[field] - as before, pulled from the node onto the profile
        end
    end
    S->>S: recompute normalized_name if the full name changed
    S->>DB: commit
    S-->>RealPerson: Person{..., linked_user_id: user.id}
```

**Marriage between independent trees** - a direct edge between nodes of different owners cannot
be created directly, only through a proposal/confirmation:

```mermaid
sequenceDiagram
    actor OwnerA as Owner A
    actor OwnerB as Owner B
    participant R as graph/router
    participant S as graph/service

    OwnerA->>R: POST /persons/{id}/invite-code (their own node)
    R->>S: generate_invite_code_for_person
    S-->>OwnerA: "ABCD1234" (shared outside the app)

    OwnerB->>R: POST /marriage-proposals {person_a_id: their own node, target_invite_code: "ABCD1234"}
    R->>S: create_marriage_proposal
    S->>S: can_edit_graph(A)? can_edit_graph(B)?
    alt both nodes are edited by THE SAME user
        S->>S: create Relationship(spouse_of) immediately + _link_clusters(marriage)
        S-->>OwnerB: RelationshipProposal{status: "confirmed"} (instantly)
    else different owners
        S-->>OwnerB: RelationshipProposal{status: "pending"}
        OwnerB->>R: GET /marriage-proposals (sees the outgoing one)
        OwnerA->>R: GET /marriage-proposals (sees the incoming one)
        OwnerA->>R: POST /marriage-proposals/{id}/confirm
        R->>S: confirm_marriage_proposal
        S->>S: create Relationship(spouse_of, marriage_year)
        S->>S: _link_clusters(A, B, "marriage") -> GraphLink + relabel origin_label
        S-->>OwnerA: RelationshipProposal{status: "confirmed"}
    end
```

#### 4.2. Matching Algorithm

The goal isn't to "find a name match," but to assemble an evidentiary chain of common ancestors
between two independently filled-in trees, and only when that chain is long/confident enough to
offer it to the users for confirmation.

**From a graph mutation to a recorded match and notification.** The recomputation is always
full (all 5 stages from scratch) - triggered by any node or relationship creation/edit
(`POST /persons`, `PATCH /persons/{id}`, `POST /persons/insert-between`, `POST /relationships`), and
runs in the background after the client has already received a response:

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
    R->>DB: commit the graph mutation
    R-->>C: 200 (the response is sent IMMEDIATELY, before recomputation)
    R->>BG: add_task(recompute_for_person_task, person_id)

    BG->>M: recompute_for_person(person_id)  [its own DB session]
    M->>CTE: person's ancestors (child_of, upward, unlimited depth)
    M->>F1: find_candidates(person)
    F1->>DB: similarity(normalized_name) > 0.6 AND owner_user_id != AND origin_label != , ORDER BY geography, LIMIT 200
    DB-->>F1: up to 200 candidates
    F1-->>M: candidates[]

    loop for each candidate
        M->>M: hard reject if candidate.gender != person.gender
        M->>A: align_and_score(person, ancestors, candidate)
        A->>CTE: candidate's ancestors
        alt gen=0 (the anchor pair itself) below NODE_MATCH_MIN_CONFIDENCE
            A-->>M: (0.0, discard, {"reason": "root_pair_below_threshold"})
        else
            loop gen = 1..MAX_CHAIN_DEPTH(10)
                A->>A: person side at exactly depth gen, candidate side at [gen-2, gen+2] minus already used ones
                A->>A: node_confidence for each pair (hard gender reject), keep >= 0.4
                A->>A: best pair -> generation's NodeMatch, sibling_count = number of person-side nodes with a confident match
            end
            A->>A: chain_score(node_matches) -> final_match_score(chain, person, candidate)
            A->>A: threshold: >=0.75 high_confidence / >=0.45 possible_match / otherwise discard
            A-->>M: (final_score, status, evidence)
        end
        M->>U: _upsert_match(person, candidate, score, status, evidence)
        U->>DB: canonical_order by str(id) -> SELECT existing MatchCandidate(person_a,person_b)
        alt already resolved (confirmed or rejected by either side)
            U->>U: silently skip - background recomputation doesn't override a human decision
        else new record
            U->>DB: INSERT MatchCandidate
            alt status != discard
                U->>N: create_notification(both owners, NEW_MATCH)
            end
        else existing, not yet resolved
            U->>DB: UPDATE score/status/evidence
            alt |Δscore| > 0.15 AND status != discard
                U->>N: create_notification(both owners, MATCH_SCORE_CHANGED)
            end
        end
    end
```

**Scoring formula** - three levels of weights, exact values:

```mermaid
flowchart TD
    subgraph "Node-level - node_confidence(a, b, gen_a, gen_b)"
        NS["name_sim = rapidfuzz.ratio(a,b) / 100"]
        RAR["rarity = 1.0 / 0.7 / 0.4 / 0.15\nby the number of other persons with the same name\n(capped at 0.4 if the name is in the list of common Kazakh names)"]
        GEO["geo = 0.5 unknown / 1.0 same country+region\n/ 0.8 same country / 0.6 plausible migration (KZ↔RU,MN,CN,UZ) / 0.15 otherwise"]
        GEN["gen_plaus = structural{0:1.0,1:0.7,2:0.3,otherwise:0.05}\nif both birth_year known: 50/50 with year_score(|Δ|<=10 -> 1.0)"]
        ETH["ethnic_mod ∈ [-0.35, +0.20]\nru/tribe/zhuz match -> bonus, conflict -> penalty, no data -> 0"]
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
        AVG["avg_conf = mean(confidence across all NodeMatch)"]
        LEN["chain_length = the longest CONTINUOUS run of generations from gen=0\n(a single gap breaks the count, even if there are matches deeper)"]
        MULT["length_multiplier {1:0.35, 2:0.65, 3:0.90, 4+:1.0}"]
        SIB["sibling_bonus = +0.15 if at some gen>0 multiple person-side nodes matched confidently"]
        COMP["completeness_factor = 0.6 + 0.4·(share of filled fields birth_year/country/region/ru/tribe/zhuz)"]
        CHAIN["chain_score = clamp((avg_conf·length_multiplier + sibling_bonus) · completeness_factor)"]
        NODE --> AVG
        AVG --> CHAIN
        LEN --> MULT --> CHAIN
        SIB --> CHAIN
        COMP --> CHAIN
    end

    subgraph "Context-level - final_match_score"
        SRC["source_factor = avg(SOURCE_TRUST[a.source_type], SOURCE_TRUST[b.source_type])\noral_tradition 0.6 / photo 0.8 / family_document 0.85 / archival_record 1.0"]
        RU["ru_bonus = +0.08 if both ru match"]
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
    D -->|"otherwise"| DISC["discard"]
```

The key idea behind the weights: a single name match (`chain_length=1`) yields a multiplier of
only **0.35** - this is exactly the "same surname, unrelated" case, not an actual relative.
Evidentiary strength grows nonlinearly with the length of a continuous chain of matched
generations, rather than with one striking match.

**Confirmation and cluster merging** - automatic merging of branches never happens; even
`high_confidence` remains a proposal requiring explicit consent from both sides:

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
    S->>S: person_a_confirmed = True (only their own side)
    S->>DB: commit (confirmed_at is still NULL - waiting for the other side)

    OwnerB->>R: POST /matches/{id}/confirm
    R->>S: confirm_match(match, current_user=B)
    S->>S: person_b_confirmed = True
    alt both sides confirmed
        S->>S: confirmed_at = now()
        S->>LC: _link_clusters(person_a, person_b, "match_confirmed", source_match_id)
        LC->>DB: INSERT GraphLink(link_type=match_confirmed)
        LC->>DB: UPDATE persons SET origin_label = origin_label(A) WHERE id IN (B's entire component) - union-find relabel
        S->>S: confirmation_count += 1 for both (AFTER the relabel - _propagate_origin_label calls db.refresh, which would wipe out unsaved changes)
        S->>DB: commit
    else only one side (so far)
        Note over S: confirmed_at remains NULL, waiting for the other side
    end

    Note over LC,DB: From this point on, find_candidates (Stage 1) filters by origin_label != -<br/>this pair/cluster will NOT be proposed again in subsequent recomputations.
```

`reject_match` is the mirror image, but never calls `_link_clusters`; rejection by one side
permanently blocks a repeat confirm from that same side.

## Running the Project

1. Copy `.env.example` to `.env` and fill in the values (`DATABASE_URL`, `POSTGRES_*`,
   `JWT_SECRET_KEY`, ports, etc.) - the application won't start without `JWT_SECRET_KEY`/`DATABASE_URL`.
2. Bring up the backend + PostgreSQL with a single command:
   ```
   make up
   ```
3. Apply DB migrations:
   ```
   make migrate
   ```
4. The backend is available at `http://localhost:<BACKEND_PORT>/api`, Swagger at `/docs`.

Other useful commands from the `Makefile`:

- `make down` / `make restart` - stop / rebuild and restart the containers
- `make logs` - backend container logs
- `make makemigrations m="description"` - generate a new Alembic migration from model changes
- `make reset-db` - a **full** DB reset (drops the entire volume) + migrations from scratch, for
  a clean environment
- `make sync` - sync dependencies via `uv`
- `make run` - local run without Docker (requires an available PostgreSQL, see `.env`)
- `make matching-test` - a load/accuracy test of the matching algorithm on synthetic trees
  (`Jeli-Bruno/scripts/matching_load_test.py`)

## Testing

All endpoints are covered by an automated **Bruno** collection - `Jeli-Bruno/` at the project
root. Environment variables live in `Jeli-Bruno/environments/local.yml`, and the `scenario/` folder
runs a realistic multi-user scenario (several accounts, overlapping trees, chats, matching,
collaborators) entirely through the real HTTP API. To run the whole suite:

```
cd Jeli-Bruno && npx --yes @usebruno/cli run . -r --env local --tests-only
```

(`--tests-only` skips the collection's single native `type: websocket` item, which the CLI can't
execute - it exists only for manual verification in the Bruno desktop app.)



# Frontend Description

## Stack

The frontend is built entirely in **JavaScript (JSX)** using **React 19**, bundled with **Vite 8**. Key dependencies:

1. **Vite** — the bundler and dev server (`npm run dev` / `npm run build` / `npm run preview`)
2. **React 19** + **react-dom** — the UI library
3. **react-router-dom v7** — routing (protected/public routes, nested layout)
4. **@xyflow/react (React Flow) v12** — rendering the family graph (custom nodes/edges, zoom, panning)
5. **@dagrejs/dagre** — an auxiliary layout engine, used in `utils/buildFlow.js` only to "seed" the initial left-to-right node ordering (crossing minimization); the final coordinates are computed by a custom sweep algorithm on top of Dagre
6. **axios** — the HTTP client, a single instance with interceptors (`api/axiosConfig.js`)
7. **react-markdown** — rendering the family history
8. **react-icons** — icons

## Architecture

An SPA (Single Page Application), fully decoupled from the backend — deployed separately, communicating with `jeli-server` only via a REST API (JSON) at the base URL configured in `api/axiosConfig.js`. Authentication is JWT-based, stored and attached to headers via an axios interceptor; on a 401, it redirects to login via `ProtectedRoute`.

## Project Structure

```
front/
├── index.html                  # Vite entry point
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx                 # React entry point, mounts into the DOM
    ├── index.css                # global styles
    ├── Routes/                  # routing
    ├── Pages/                    # screens tied to routes
    ├── Components/               # reusable composite blocks, 
    ├── UI/                       # low-level design-system primitives
    └── utils/                    # pure helpers and React context
```

## Key Architectural Decisions

- **The graph is not the library's declarative layout but a custom algorithm** (`buildFlow.js`): Dagre is used only to obtain the relative ordering of nodes (crossing minimization), while the final coordinates are the result of a manual sweep that keeps pairs (`couple`/`union`) next to each other and centers generations above one another. This is a deliberate choice for a "family-style" graph view (a couple is always adjacent, children sit under their shared union), which the standard Dagre layout doesn't provide out of the box.
- **The API layer is fully decoupled from components** — components never work with axios directly, only through `api/*Service.js`, which mirrors the backend feature structure (`graph`, `auth`, `media`, `messenger`, `notifications`).
- **Routes are protected at the wrapper level** (`ProtectedRoute`/`PublicOnlyRoute`), rather than with checks inside each individual page.

## Running the Project

1. Node.js must be installed:
```
node -v
```

2. Run the command to install all dependencies:
```
npm install
```

3. Start the local server
```
npm run dev
```

4. The platform is available at: http://localhost:5173
