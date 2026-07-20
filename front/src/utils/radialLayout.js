/**
 * Radial (circular) layout for the family graph.
 *
 * The backend gives each person a `generation` (its depth from the focus node);
 * we turn that into concentric rings around the focus, who sits at the centre.
 * X/Y are always derived from the graph structure here — never persisted — so
 * the tree can never be dragged into an invalid shape (see docs/dag-page.md).
 *
 * Returns a map of `personId → { x, y }` in **centre** coordinates (the node's
 * midpoint). `buildFlow` shifts these to React Flow's top-left origin.
 */

// Card footprint + breathing room, used to keep a crowded ring from overlapping.
const NODE_W = 190;
const NODE_H = 96;
const RING_STEP = 260; // radius added per generation of distance from focus

/**
 * @param {Array<{id:string, generation:number}>} persons
 * @param {Array<{from_person_id:string, to_person_id:string, type:string}>} relationships
 * @param {string} focusId
 * @returns {Record<string, {x:number, y:number}>}
 */
export function radialLayout(persons, relationships, focusId) {
  const positions = {};
  if (!persons?.length) return positions;

  const focus = persons.find((p) => p.id === focusId) ?? persons[0];
  const focusGen = focus.generation ?? 0;

  // Focus is pinned to the centre.
  positions[focus.id] = { x: 0, y: 0 };

  // Undirected adjacency for a stable, crossing-reducing traversal order.
  const adjacency = new Map(persons.map((p) => [p.id, []]));
  for (const rel of relationships ?? []) {
    if (adjacency.has(rel.from_person_id) && adjacency.has(rel.to_person_id)) {
      adjacency.get(rel.from_person_id).push(rel.to_person_id);
      adjacency.get(rel.to_person_id).push(rel.from_person_id);
    }
  }

  // BFS from the focus → a visit order that keeps related people near each other.
  const order = new Map();
  const queue = [focus.id];
  const seen = new Set([focus.id]);
  let counter = 0;
  while (queue.length) {
    const id = queue.shift();
    order.set(id, counter++);
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  // Any node not reached by BFS still needs a deterministic order.
  for (const p of persons) if (!order.has(p.id)) order.set(p.id, counter++);

  // Effective ring distance → each *signed* generation gets its own ring, so
  // ancestors and descendants that are the same number of steps away don't land
  // on one circle. Same-generation relatives (spouse/siblings) sit on a small
  // inner ring so the focus stays visually alone at the centre.
  const ringDistance = (gen) => {
    const offset = (gen ?? 0) - focusGen;
    if (offset === 0) return 0.55;
    // Nudge descendants (below the focus) outward by half a step from the
    // ancestors at the same absolute distance.
    return Math.abs(offset) + (offset < 0 ? 0.5 : 0);
  };

  // Group every non-focus person by their ring.
  const rings = new Map();
  for (const p of persons) {
    if (p.id === focus.id) continue;
    const key = ringDistance(p.generation);
    if (!rings.has(key)) rings.set(key, []);
    rings.get(key).push(p);
  }

  let ringIndex = 0;
  for (const key of [...rings.keys()].sort((a, b) => a - b)) {
    const members = rings.get(key).sort((a, b) => order.get(a.id) - order.get(b.id));
    const count = members.length;

    // Grow the radius if a ring is too crowded to fit its cards without overlap.
    const baseRadius = RING_STEP * key;
    const circumferenceNeed = (NODE_W + 60) * count;
    const radius = Math.max(baseRadius, circumferenceNeed / (2 * Math.PI));

    // Stagger each ring's starting angle so nodes don't line up radially.
    const angleStep = (2 * Math.PI) / count;
    const angleOffset = -Math.PI / 2 + ringIndex * 0.5;

    members.forEach((p, i) => {
      const angle = angleOffset + i * angleStep;
      positions[p.id] = {
        x: Math.round(radius * Math.cos(angle)),
        y: Math.round(radius * Math.sin(angle)),
      };
    });
    ringIndex += 1;
  }

  return positions;
}

export const NODE_SIZE = { width: NODE_W, height: NODE_H };
