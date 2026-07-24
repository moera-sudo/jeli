# Constants for the graph feature: edge/relationship types, statuses, graph traversal limits.
RELATIONSHIP_TYPE_CHILD_OF = "child_of"
RELATIONSHIP_TYPE_SPOUSE_OF = "spouse_of"

GRAPH_LINK_TYPE_MARRIAGE = "marriage"
GRAPH_LINK_TYPE_MATCH_CONFIRMED = "match_confirmed"

PROPOSAL_STATUS_PENDING = "pending"
PROPOSAL_STATUS_CONFIRMED = "confirmed"
PROPOSAL_STATUS_REJECTED = "rejected"

MATCH_STATUS_HIGH_CONFIDENCE = "high_confidence"
MATCH_STATUS_POSSIBLE_MATCH = "possible_match"
MATCH_STATUS_DISCARD = "discard"

DEFAULT_BIRTH_YEAR_PRECISION = "unknown"
DEFAULT_DEATH_YEAR_PRECISION = "unknown"
DEFAULT_ETHNIC_SOURCE = "none"
ETHNIC_SOURCE_DERIVED_FROM_RU = "derived_from_ru"
DEFAULT_SOURCE_TYPE = "oral_tradition"

MAX_PARENTS_PER_PERSON = 2
DEFAULT_GRAPH_DEPTH = 3
MAX_GRAPH_DEPTH = 8
TOP_MATCHES_LIMIT = 3

# * Crockford Base32 without I/L/O/U — unambiguous for manual entry (codes are shared as text, not a link).
INVITE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
INVITE_CODE_LENGTH = 8
