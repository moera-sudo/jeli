import dagre from '@dagrejs/dagre';

/**
 * Family-graph layout — the DAG-with-union-nodes rendering from
 * docs/dag-page.md and docs/graph-data-structure.md.
 *
 * Each couple is laid out as one adjacent block: the two spouses stand right
 * next to each other with an invisible "union" node between them, and every
 * child of the couple hangs from that union — so a family reads as a unit and a
 * spouse is never flung to the far side of the row.
 *
 * Coordinates are never persisted. Y is pinned by the backend `generation` so
 * every generation stays on a level row (ancestors on top — parent generation
 * is child + 1, see the graph service). X is assigned with a couple-aware
 * Sugiyama sweep that (a) seeds left-right order from Dagre's crossing-minimised
 * order, (b) centres parents over children and children under their union, and
 * (c) guarantees a minimum gap between cards, so nothing overlaps.
 */

export const NODE_SIZE = { width: 210, height: 136 };
export const UNION_SIZE = { width: 14, height: 14 };

const ROW_GAP = 260;    // vertical distance between generations (centre to centre)
const INNER_GAP = 74;   // gap between the two cards of a couple (union sits here)
const BLOCK_GAP = 70;   // gap between neighbouring blocks in a row
const SWEEPS = 8;       // refinement iterations for the X coordinate

const unionId = (key) => `union::${key}`;
const coupleKey = (a, b) => [a, b].sort().join('::');
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// Orthogonal routing (down out of a source, into the top of a target) keeps the
// spouse/descent lines in vertical channels + row gaps so they never cut across
// cards or fan out diagonally into each other.
function treeEdge(id, source, target, style, data = {}) {
  return { id, source, target, type: 'smoothstep', pathOptions: { borderRadius: 12 }, style, data };
}

/**
 * @param {object} graph  GraphResponse { focus_person_id, persons, relationships }.
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildFlow(graph) {
  const persons = graph?.persons ?? [];
  const relationships = graph?.relationships ?? [];
  const focusId = graph?.focus_person_id;
  if (!persons.length) return { nodes: [], edges: [] };

  const personById = new Map(persons.map((p) => [p.id, p]));

  /* ----------------------------------------------------- kinship indexes --- */
  const parentsOf = new Map(persons.map((p) => [p.id, []]));  // childId → [parentId]
  const childrenOf = new Map(persons.map((p) => [p.id, []])); // parentId → [childId]
  const childOfRelId = new Map(); // `${childId}::${parentId}` → relationship id
  const spousePairs = [];         // { a, b, relId }
  const matchEdges = [];
  for (const rel of relationships) {
    if (rel.type === 'child_of') {
      // from = child, to = parent (see the child_of rename note in dag-page.md).
      if (parentsOf.has(rel.from_person_id) && personById.has(rel.to_person_id)) {
        parentsOf.get(rel.from_person_id).push(rel.to_person_id);
        childrenOf.get(rel.to_person_id).push(rel.from_person_id);
        childOfRelId.set(`${rel.from_person_id}::${rel.to_person_id}`, rel.id);
      }
    } else if (rel.type === 'spouse_of') {
      spousePairs.push({ a: rel.from_person_id, b: rel.to_person_id, relId: rel.id });
    } else if (rel.type === 'match_confirmed') {
      matchEdges.push(rel);
    }
  }

  /* --------- couples (unions): explicit spouses + parents of a shared child */
  const couples = new Map(); // key → { a, b, key }
  const spouseRelOfCouple = new Map(); // key → spouse_of relationship id (editable marriages)
  const addCouple = (a, b) => {
    if (!a || !b || a === b || !personById.has(a) || !personById.has(b)) return;
    const key = coupleKey(a, b);
    if (!couples.has(key)) couples.set(key, { a, b, key });
  };
  for (const { a, b, relId } of spousePairs) {
    addCouple(a, b);
    if (personById.has(a) && personById.has(b)) spouseRelOfCouple.set(coupleKey(a, b), relId);
  }
  for (const parents of parentsOf.values()) {
    if (parents.length >= 2) addCouple(parents[0], parents[1]);
  }

  const unionChildren = new Map(); // key → [childId]
  for (const [childId, parents] of parentsOf) {
    if (parents.length < 2) continue;
    const key = coupleKey(parents[0], parents[1]);
    if (!couples.has(key)) continue;
    if (!unionChildren.has(key)) unionChildren.set(key, []);
    unionChildren.get(key).push(childId);
  }

  // A person's parenting couple — prefer the one they actually have children with.
  const coupleHasKids = (key) => (unionChildren.get(key)?.length ?? 0) > 0;
  const personCouple = new Map();
  for (const { a, b, key } of couples.values()) {
    for (const m of [a, b]) {
      const cur = personCouple.get(m);
      if (!cur || (!coupleHasKids(cur) && coupleHasKids(key))) personCouple.set(m, key);
    }
  }

  /* --------------------------- Dagre: seed left-right order (not final X) --- */
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const p of persons) g.setNode(p.id, { width: NODE_SIZE.width, height: NODE_SIZE.height });
  for (const key of couples.keys()) g.setNode(unionId(key), { width: UNION_SIZE.width, height: UNION_SIZE.height });
  for (const { a, b, key } of couples.values()) {
    g.setEdge(a, unionId(key));
    g.setEdge(b, unionId(key));
  }
  for (const [key, kids] of unionChildren) for (const c of kids) g.setEdge(unionId(key), c);
  for (const [childId, parents] of parentsOf) if (parents.length === 1) g.setEdge(parents[0], childId);
  dagre.layout(g);
  const seedX = (id) => g.node(id)?.x ?? 0;

  /* ------------------------------------------------ blocks per generation -- */
  const genOf = (id) => personById.get(id)?.generation ?? 0;
  const rowGens = [...new Set(persons.map((p) => genOf(p.id)))].sort((m, n) => n - m); // top first
  const rowPersons = new Map(rowGens.map((gen) => [gen, []]));
  for (const p of persons) rowPersons.get(genOf(p.id)).push(p.id);

  const blockOf = new Map();       // personId → block
  const blockByCouple = new Map(); // couple key → block
  const rowBlocks = new Map();     // gen → [block]

  for (const gen of rowGens) {
    const ids = rowPersons.get(gen).slice().sort((x, y) => seedX(x) - seedX(y));
    const rowSet = new Set(ids);
    const placed = new Set();
    const blocks = [];
    for (const pid of ids) {
      if (placed.has(pid)) continue;
      const key = personCouple.get(pid);
      const couple = key && couples.get(key);
      if (couple && rowSet.has(couple.a) && rowSet.has(couple.b)) {
        const [left, right] = seedX(couple.a) <= seedX(couple.b) ? [couple.a, couple.b] : [couple.b, couple.a];
        const block = { type: 'couple', key, members: [left, right], left, right, width: 2 * NODE_SIZE.width + INNER_GAP, center: 0 };
        blocks.push(block);
        blockByCouple.set(key, block);
        blockOf.set(left, block);
        blockOf.set(right, block);
        placed.add(left);
        placed.add(right);
      } else {
        const block = { type: 'single', members: [pid], member: pid, width: NODE_SIZE.width, center: 0 };
        blocks.push(block);
        blockOf.set(pid, block);
        placed.add(pid);
      }
    }
    // Initial tight packing left-to-right.
    let cursor = 0;
    for (const block of blocks) {
      block.center = cursor + block.width / 2;
      cursor += block.width + BLOCK_GAP;
    }
    rowBlocks.set(gen, blocks);
  }

  /* ---------------- neighbour centres for the coordinate sweep ------------- */
  const parentCentersOf = (person) => {
    const parents = parentsOf.get(person) ?? [];
    if (!parents.length) return [];
    if (parents.length >= 2) {
      const cb = blockByCouple.get(coupleKey(parents[0], parents[1]));
      if (cb) return [cb.center];
    }
    return parents.map((p) => blockOf.get(p)).filter(Boolean).map((b) => b.center);
  };

  const childCentersOf = (block) => {
    const kids = block.type === 'couple'
      ? unionChildren.get(block.key) ?? []
      : (childrenOf.get(block.member) ?? []).filter((c) => (parentsOf.get(c)?.length ?? 0) < 2);
    const seen = new Set();
    const centers = [];
    for (const k of kids) {
      const kb = blockOf.get(k);
      if (kb && !seen.has(kb)) { seen.add(kb); centers.push(kb.center); }
    }
    return centers;
  };

  const resolveRow = (blocks) => {
    blocks.sort((a, b) => a.center - b.center);
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1];
      const cur = blocks[i];
      const minCenter = prev.center + prev.width / 2 + BLOCK_GAP + cur.width / 2;
      if (cur.center < minCenter) cur.center = minCenter;
    }
  };

  // Alternate pulling children under their parents and parents over children.
  for (let s = 0; s < SWEEPS; s++) {
    for (const gen of rowGens) { // top → bottom: place children under parent unions
      for (const block of rowBlocks.get(gen)) {
        const centers = block.members.flatMap(parentCentersOf);
        if (centers.length) block.center = avg(centers);
      }
      resolveRow(rowBlocks.get(gen));
    }
    for (const gen of [...rowGens].reverse()) { // bottom → top: centre unions over children
      for (const block of rowBlocks.get(gen)) {
        const centers = childCentersOf(block);
        if (centers.length) block.center = avg(centers);
      }
      resolveRow(rowBlocks.get(gen));
    }
  }

  /* ---------------------------------------------------------- RF nodes ---- */
  const maxGen = rowGens[0] ?? 0;
  const rowY = (gen) => (maxGen - gen) * ROW_GAP; // higher generation → top
  const spouseSpan = NODE_SIZE.width + INNER_GAP; // centre-to-centre of the two cards

  const nodes = [];
  for (const p of persons) {
    const block = blockOf.get(p.id);
    let cx = block.center;
    if (block.type === 'couple') cx += (p.id === block.left ? -spouseSpan / 2 : spouseSpan / 2);
    const cy = rowY(genOf(p.id));
    nodes.push({
      id: p.id,
      type: 'person',
      position: { x: cx - NODE_SIZE.width / 2, y: cy - NODE_SIZE.height / 2 },
      data: { person: p, isFocus: p.id === focusId },
    });
  }
  for (const { a, key } of couples.values()) {
    const block = blockByCouple.get(key);
    const parentY = rowY(genOf(a));
    const hasKids = coupleHasKids(key);
    // The union always sits BELOW the couple's cards so the two spouse lines drop
    // down and converge into it (orthogonal routing). With kids it sits midway to
    // the children's row (the descent branch point); childless, just under the pair.
    const cy = parentY + (hasKids ? ROW_GAP / 2 : NODE_SIZE.height / 2 + 24);
    nodes.push({
      id: unionId(key),
      type: 'union',
      position: { x: block.center - UNION_SIZE.width / 2, y: cy - UNION_SIZE.height / 2 },
      // spouseRelId is set only for real (spouse_of) marriages — those are editable.
      data: { spouseRelId: spouseRelOfCouple.get(key) ?? null },
      draggable: false,
      focusable: false,
    });
  }

  // child_of links (childId → [{parentId, relId}]) for a descent edge's data.
  const descentLinks = (childId) =>
    (parentsOf.get(childId) ?? [])
      .map((parentId) => ({ parentId, relId: childOfRelId.get(`${childId}::${parentId}`) }))
      .filter((l) => l.relId);

  /* ------------------------------------------------------------- RF edges - */
  const spouseStyle = { stroke: '#f59e0b', strokeWidth: 2 };
  const descentStyle = { stroke: 'rgba(26,26,26,0.4)', strokeWidth: 2 };
  const matchStyle = { stroke: '#c084fc', strokeWidth: 2, strokeDasharray: '6 5' };

  const edges = [];
  for (const { a, b, key } of couples.values()) {
    edges.push(treeEdge(`${key}::sa`, a, unionId(key), spouseStyle));
    edges.push(treeEdge(`${key}::sb`, b, unionId(key), spouseStyle));
  }
  for (const [key, kids] of unionChildren) {
    for (const childId of kids) {
      edges.push(treeEdge(`${key}->${childId}`, unionId(key), childId, descentStyle,
        { kind: 'descent', childId, links: descentLinks(childId) }))
    }
  }
  for (const [childId, parents] of parentsOf) {
    if (parents.length === 1) {
      edges.push(treeEdge(`${parents[0]}->${childId}`, parents[0], childId, descentStyle,
        { kind: 'descent', childId, links: descentLinks(childId) }))
    }
  }
  for (const rel of matchEdges) {
    edges.push({
      id: rel.id,
      source: rel.from_person_id,
      target: rel.to_person_id,
      type: 'straight',
      style: matchStyle,
      data: { type: rel.type },
    });
  }

  return { nodes, edges };
}
