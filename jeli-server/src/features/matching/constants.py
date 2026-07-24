# Thresholds and weights of the matching algorithm — see docs/matching-algorhitm.md. Weights were tuned
# by hand, without ML, calibrated against the test cases from section 8 of the doc.
CANDIDATE_NAME_SIMILARITY_THRESHOLD = 0.6
CANDIDATE_LIMIT = 200

MAX_CHAIN_DEPTH = 10
GEN_OFFSET_TOLERANCE = 2
# * Threshold for selecting a node into a chain — not explicitly set in the doc, introduced as a reasonable minimum confidence.
NODE_MATCH_MIN_CONFIDENCE = 0.4

CHAIN_LENGTH_MULTIPLIER = {1: 0.35, 2: 0.65, 3: 0.90, 4: 1.0}
SIBLING_BONUS = 0.15

SOURCE_TRUST = {
    "oral_tradition": 0.6,
    "family_document": 0.85,
    "photo": 0.8,
    "archival_record": 1.0,
}

# * Real Kazakh diaspora (Mongolia, China, Uzbekistan, Russia) — migration between these countries
# * should not be penalized as "foreign", unlike an arbitrary pair of countries.
MIGRATION_PLAUSIBILITY: dict[tuple[str, str], float] = {
    ("KZ", "RU"): 0.6,
    ("RU", "KZ"): 0.6,
    ("KZ", "MN"): 0.6,
    ("MN", "KZ"): 0.6,
    ("KZ", "CN"): 0.6,
    ("CN", "KZ"): 0.6,
    ("KZ", "UZ"): 0.6,
    ("UZ", "KZ"): 0.6,
}
MIGRATION_PLAUSIBILITY_DEFAULT = 0.15

MATCH_HIGH_CONFIDENCE_THRESHOLD = 0.75
MATCH_POSSIBLE_MATCH_THRESHOLD = 0.45

# * Common Kazakh first names (normalized, lower) — not from the doc, introduced as a safeguard against
# * an objectively common name getting 0 matches in the DB on a small hackathon dataset and incorrectly
# * receiving name_rarity_score=1.0 ("unique"). Best-effort list, does not claim to be exhaustive.
COMMON_KAZAKH_FIRST_NAMES: set[str] = {
    "nurlan", "нурлан", "yerlan", "ерлан", "arman", "арман", "alibek", "алибек",
    "bekzat", "бекзат", "dias", "диас", "daniyar", "данияр", "azamat", "азамат",
    "askar", "аскар", "bauyrzhan", "бауыржан", "nurbol", "нурбол", "olzhas", "олжас",
    "sanzhar", "санжар", "yerbol", "ербол", "kanat", "канат", "serik", "серик",
    "talgat", "талгат", "marat", "марат", "yerzhan", "ержан", "bekarys", "бекарыс",
    "aigerim", "айгерим", "aizhan", "айжан", "aidana", "айдана", "dana", "дана",
    "dinara", "динара", "gulnara", "гульнара", "zhanar", "жанар", "madina", "мадина",
    "saltanat", "салтанат", "aliya", "алия", "asel", "асель", "zhibek", "жибек",
    "gulmira", "гульмира", "aruzhan", "аружан", "zere", "зере", "inkar", "инкар",
    "nazerke", "назерке", "sabina", "сабина", "aisha", "айша",
}

# * Threshold for a significant score change to trigger a notification (docs/matching-algorhitm.md, section 5).
SIGNIFICANT_SCORE_DELTA = 0.15

RU_BONUS = 0.08
