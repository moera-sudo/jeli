# Matching pipeline (5 stages) — see docs/matching-algorhitm.md. Full recompute for a single person
# on any create/edit, no partial recompute (a simplification acceptable for a small hackathon dataset).
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import AsyncSessionLocal
from src.features.graph import service as graph_service
from src.features.graph.constants import (
    MATCH_STATUS_DISCARD,
    MATCH_STATUS_HIGH_CONFIDENCE,
    MATCH_STATUS_POSSIBLE_MATCH,
)
from src.features.graph.models import MatchCandidate, Person
from src.features.graph.utils import build_display_name
from src.features.matching.constants import (
    CANDIDATE_LIMIT,
    CANDIDATE_NAME_SIMILARITY_THRESHOLD,
    GEN_OFFSET_TOLERANCE,
    MATCH_HIGH_CONFIDENCE_THRESHOLD,
    MATCH_POSSIBLE_MATCH_THRESHOLD,
    MAX_CHAIN_DEPTH,
    NODE_MATCH_MIN_CONFIDENCE,
    SIGNIFICANT_SCORE_DELTA,
)
from src.features.matching.utils import (
    NodeMatch,
    chain_score,
    ethnic_lineage_modifier,
    final_match_score,
    geo_similarity,
    has_sibling_match,
    longest_continuous_chain,
    node_confidence,
    normalized_name_similarity,
)
from src.features.notifications import service as notifications_service
from src.features.notifications.constants import (
    NOTIFICATION_TYPE_MATCH_SCORE_CHANGED,
    NOTIFICATION_TYPE_NEW_MATCH,
)

logger = logging.getLogger(__name__)


async def find_candidates(db: AsyncSession, person: Person) -> list[Person]:
    # * Stage 1 — pg_trgm similarity + soft geo-prefilter (sorting, NOT cutoff).
    sql = text(
        """
        SELECT p2.id
        FROM persons p1
        JOIN persons p2 ON similarity(p1.normalized_name, p2.normalized_name) > :threshold
        WHERE p1.id = :person_id
          AND p2.id != p1.id
          AND p1.owner_user_id != p2.owner_user_id
          AND p1.origin_label != p2.origin_label
          AND p1.normalized_name != ''
          AND p2.normalized_name != ''
        ORDER BY
          CASE
            WHEN p1.birth_country IS NULL OR p2.birth_country IS NULL THEN 0.5
            WHEN p1.birth_country = p2.birth_country AND p1.birth_region = p2.birth_region THEN 1.0
            WHEN p1.birth_country = p2.birth_country THEN 0.8
            ELSE 0.15
          END DESC,
          similarity(p1.normalized_name, p2.normalized_name) DESC
        LIMIT :limit
        """
    )
    result = await db.execute(
        sql, {"person_id": str(person.id), "threshold": CANDIDATE_NAME_SIMILARITY_THRESHOLD, "limit": CANDIDATE_LIMIT}
    )
    candidate_ids = [row.id for row in result]
    if not candidate_ids:
        return []
    persons_result = await db.execute(select(Person).where(Person.id.in_(candidate_ids)))
    by_id = {p.id: p for p in persons_result.scalars()}
    return [by_id[cid] for cid in candidate_ids if cid in by_id]


async def _name_rarity_count(
    db: AsyncSession, normalized_name: str, exclude_person_id: uuid.UUID, cache: dict[str, int]
) -> int:
    if normalized_name in cache:
        return cache[normalized_name]
    result = await db.execute(
        select(func.count()).select_from(Person).where(
            Person.normalized_name == normalized_name, Person.id != exclude_person_id
        )
    )
    count = result.scalar_one()
    cache[normalized_name] = count
    return count


def _group_by_depth(depth_map: dict[uuid.UUID, int]) -> dict[int, list[uuid.UUID]]:
    grouped: dict[int, list[uuid.UUID]] = {}
    for pid, depth in depth_map.items():
        grouped.setdefault(depth, []).append(pid)
    return grouped


async def _load_persons_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Person]:
    if not ids:
        return {}
    result = await db.execute(select(Person).where(Person.id.in_(ids)))
    return {p.id: p for p in result.scalars()}


async def align_and_score(
    db: AsyncSession,
    person: Person,
    person_ancestors: dict[uuid.UUID, int],
    candidate: Person,
    rarity_cache: dict[str, int],
) -> tuple[float, str, dict]:
    # * Stage 2+3+4+5 for ONE person/candidate pair. person_ancestors is reused by the caller
    # * across all candidates of the same person (not recomputed for each one).
    candidate_ancestors = await graph_service.get_ancestors_with_depth(db, candidate.id)
    person_by_depth = _group_by_depth(person_ancestors)
    candidate_by_depth = _group_by_depth(candidate_ancestors)

    all_ids = {person.id, candidate.id} | set(person_ancestors) | set(candidate_ancestors)
    persons_by_id = await _load_persons_by_id(db, all_ids)

    node_matches: list[NodeMatch] = []
    # ! A candidate node already used at one generation level is excluded from the following ones —
    # ! otherwise the same ancestor (falling into several overlapping ±2 tolerance windows) could
    # ! "cover" several neighboring levels at once and artificially inflate chain_length.
    used_candidate_ids: set[uuid.UUID] = set()

    for gen in range(0, MAX_CHAIN_DEPTH + 1):
        person_side_ids = [person.id] if gen == 0 else person_by_depth.get(gen, [])
        if not person_side_ids:
            continue

        if gen == 0:
            # * gen=0 is the anchor pair from Stage 1 itself: compare person ONLY against candidate,
            # * with no ±2 tolerance (otherwise the "match" could turn out to be with candidate's father/grandfather, not candidate itself).
            candidate_side_ids = {candidate.id}
        else:
            candidate_side_ids = set()
            for tol_gen in range(max(0, gen - GEN_OFFSET_TOLERANCE), gen + GEN_OFFSET_TOLERANCE + 1):
                candidate_side_ids.update([candidate.id] if tol_gen == 0 else candidate_by_depth.get(tol_gen, []))
        candidate_side_ids -= used_candidate_ids
        if not candidate_side_ids:
            continue

        confident_pairs: list[NodeMatch] = []
        for pa_id in person_side_ids:
            pa = persons_by_id[pa_id]
            gen_a = 0 if pa_id == person.id else person_ancestors[pa_id]
            rarity_count = await _name_rarity_count(db, pa.normalized_name, pa.id, rarity_cache)
            for pb_id in candidate_side_ids:
                pb = persons_by_id[pb_id]
                if pa.gender != pb.gender:
                    continue  # ! hard reject: gender must match
                gen_b = 0 if pb_id == candidate.id else candidate_ancestors[pb_id]
                confidence = node_confidence(pa, pb, gen_a, gen_b, rarity_count)
                if confidence >= NODE_MATCH_MIN_CONFIDENCE:
                    confident_pairs.append(NodeMatch(pa, pb, gen, confidence))

        if not confident_pairs:
            continue
        best = max(confident_pairs, key=lambda m: m.confidence)
        # * Distinct person-side nodes with a confident match at this level (e.g. father and mother) —
        # * not the number of pairs (one ancestor × N candidates within the ±2 tolerance is not N siblings).
        best.sibling_count = len({m.person_a.id for m in confident_pairs})
        node_matches.append(best)
        used_candidate_ids.add(best.person_b.id)

    if not any(m.gen == 0 for m in node_matches):
        # * Even the candidate pair itself from Stage 1 didn't pass the hard-reject/confidence threshold — discard right away.
        return 0.0, MATCH_STATUS_DISCARD, {"reason": "root_pair_below_threshold"}

    c_score = chain_score(node_matches)
    final_score = final_match_score(c_score, person, candidate)

    if final_score >= MATCH_HIGH_CONFIDENCE_THRESHOLD:
        status = MATCH_STATUS_HIGH_CONFIDENCE
    elif final_score >= MATCH_POSSIBLE_MATCH_THRESHOLD:
        status = MATCH_STATUS_POSSIBLE_MATCH
    else:
        status = MATCH_STATUS_DISCARD

    # * evidence is always labeled in the same order as the canonical MatchCandidate columns
    # * (person_a/person_b by str(id)) — otherwise, if the canonical order gets flipped, the labels inside
    # * evidence.chain stop matching match.person_a_id/match.person_b_id.
    canonical_a, _ = _canonical_order(person, candidate)
    swap_evidence = canonical_a.id != person.id

    evidence = {
        "chain_length": longest_continuous_chain(node_matches),
        "sibling_confirmed": has_sibling_match(node_matches),
        "chain_score": round(c_score, 4),
        "final_score": round(final_score, 4),
        "chain": [
            {
                "generation": m.gen,
                "person_a_id": str((m.person_b if swap_evidence else m.person_a).id),
                "person_a_name": build_display_name(
                    (m.person_b if swap_evidence else m.person_a).last_name,
                    (m.person_b if swap_evidence else m.person_a).first_name,
                    (m.person_b if swap_evidence else m.person_a).patronymic,
                ),
                "person_b_id": str((m.person_a if swap_evidence else m.person_b).id),
                "person_b_name": build_display_name(
                    (m.person_a if swap_evidence else m.person_b).last_name,
                    (m.person_a if swap_evidence else m.person_b).first_name,
                    (m.person_a if swap_evidence else m.person_b).patronymic,
                ),
                "confidence": round(m.confidence, 4),
                "name_similarity": round(
                    normalized_name_similarity(m.person_a.normalized_name, m.person_b.normalized_name), 4
                ),
                "geo_match": geo_similarity(m.person_a, m.person_b) >= 0.8,
                "ethnic_match": ethnic_lineage_modifier(m.person_a, m.person_b) > 0,
            }
            for m in sorted(node_matches, key=lambda m: m.gen)
        ],
    }
    return final_score, status, evidence


def _canonical_order(a: Person, b: Person) -> tuple[Person, Person]:
    return (a, b) if str(a.id) < str(b.id) else (b, a)


async def _notify_match_change(db: AsyncSession, match: MatchCandidate, person_a: Person, person_b: Person, is_new: bool) -> None:
    recipients = {person_a.owner_user_id, person_b.owner_user_id}
    notification_type = NOTIFICATION_TYPE_NEW_MATCH if is_new else NOTIFICATION_TYPE_MATCH_SCORE_CHANGED
    payload = {
        "match_id": str(match.id),
        "person_a_id": str(match.person_a_id),
        "person_b_id": str(match.person_b_id),
        "score": match.score,
        "status": match.status,
    }
    for user_id in recipients:
        await notifications_service.create_notification(db, user_id, notification_type, payload)


async def _upsert_match(db: AsyncSession, person: Person, candidate: Person, final_score: float, status: str, evidence: dict) -> None:
    person_a, person_b = _canonical_order(person, candidate)
    result = await db.execute(
        select(MatchCandidate).where(
            MatchCandidate.person_a_id == person_a.id, MatchCandidate.person_b_id == person_b.id
        )
    )
    match = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if match is not None and (match.confirmed_at is not None or match.person_a_rejected or match.person_b_rejected):
        # ! A decision confirmed/rejected by both sides is final. A background recompute
        # ! has no right to silently overwrite its score/status (e.g. back to discard).
        logger.info("Match %s already resolved (confirmed/rejected) — skipping recompute overwrite", match.id)
        return

    if match is None:
        match = MatchCandidate(
            person_a_id=person_a.id,
            person_b_id=person_b.id,
            score=final_score,
            status=status,
            evidence=evidence,
            last_computed_at=now,
        )
        db.add(match)
        await db.commit()
        await db.refresh(match)
        logger.info("New match candidate created: %s (score=%.3f, status=%s)", match.id, final_score, status)
        if status != MATCH_STATUS_DISCARD:
            await _notify_match_change(db, match, person_a, person_b, is_new=True)
        return

    old_score = match.score
    match.score = final_score
    match.status = status
    match.evidence = evidence
    match.last_computed_at = now
    await db.commit()
    await db.refresh(match)
    if abs(final_score - old_score) > SIGNIFICANT_SCORE_DELTA and status != MATCH_STATUS_DISCARD:
        logger.info("Match score changed significantly: %s (%.3f -> %.3f)", match.id, old_score, final_score)
        await _notify_match_change(db, match, person_a, person_b, is_new=False)


async def recompute_for_person(db: AsyncSession, person_id: uuid.UUID) -> None:
    person = await graph_service.get_person_or_404(db, person_id)
    person_ancestors = await graph_service.get_ancestors_with_depth(db, person.id)
    candidates = await find_candidates(db, person)
    rarity_cache: dict[str, int] = {}
    logger.info("Recomputing matches for person %s: %d Stage-1 candidates", person.id, len(candidates))

    for candidate in candidates:
        if candidate.gender != person.gender:
            continue  # ! hard reject: don't compare and don't create a MatchCandidate at all
        final_score, status, evidence = await align_and_score(db, person, person_ancestors, candidate, rarity_cache)
        try:
            await _upsert_match(db, person, candidate, final_score, status, evidence)
        except IntegrityError:
            # ! Race: a concurrent recompute for the other side of this same pair already inserted a row between
            # ! our select and insert (unique constraint on the pair). Roll back and move on to the
            # ! next candidate — the row was still correctly created by the concurrent task.
            await db.rollback()
            logger.warning("Match upsert race for pair (%s, %s) — skipped, handled by concurrent task", person.id, candidate.id)


async def recompute_for_person_task(person_id: uuid.UUID) -> None:
    # * Called from BackgroundTasks AFTER the HTTP response has been sent — opens its OWN session, since
    # * the graph router's request-scoped session is already closed by this point.
    async with AsyncSessionLocal() as db:
        try:
            await recompute_for_person(db, person_id)
        except Exception:
            logger.error("Matching recompute failed for person %s", person_id, exc_info=True)
