import dagre from '@dagrejs/dagre';

/**
 * Family-graph layout — the DAG-with-union-nodes rendering from
 * docs/dag-page.md and docs/graph-data-structure.md.
 *
 * Spouses share a generation row; between them sits an invisible "union" node,
 * and every child of the couple hangs from that union — so a couple and their
 * children below them read as one family, with no crossed descent lines and no
 * ambiguity about who belongs to whom.
 *
 * Coordinates are never persisted (docs/dag-page.md): X comes from Dagre, which
 * minimises edge crossings, and Y is pinned by the backend `generation` so every
 * generation stays on a level row (ancestors on top — parent generation is
 * child + 1, see graph service `_wave_traverse`).
 */

export const NODE_SIZE = { width: 210, height: 136 };
export const UNION_SIZE = { width: 14, height: 14 };

// Vertical distance between two generations (centre to centre).
const ROW_GAP = 260;

const unionId = (key) => `union::${key}`;
const coupleKey = (a, b) => [a, b].sort().join('::');

function straightEdge(id, source, target, style) {
  return { id, source, target, type: 'straight', style, data: {} };
}

/**
 * @param {object} graph  GraphResponse { focus_person_id, persons, relationships }.
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildFlow(graph) {
  const persons = graph?.persons ?? [];
  const relationships = graph?.relationships ?? [];
  const focusId = graph?.focus_person_id;
  const personById = new Map(persons.map((p) => [p.id, p]));

  /* ----------------------------------------------------- kinship indexes --- */
  const parentsOf = new Map(persons.map((p) => [p.id, []])); // childId → [parentId]
  const spousePairs = [];
  const matchEdges = [];
  for (const rel of relationships) {
    if (rel.type === 'child_of') {
      // from = child, to = parent (see the child_of rename note in dag-page.md).
      if (parentsOf.has(rel.from_person_id) && personById.has(rel.to_person_id)) {
        parentsOf.get(rel.from_person_id).push(rel.to_person_id);
      }
    } else if (rel.type === 'spouse_of') {
      spousePairs.push([rel.from_person_id, rel.to_person_id]);
    } else if (rel.type === 'match_confirmed') {
      matchEdges.push(rel);
    }
  }

  /* --------- couples (unions): explicit spouses + parents of a shared child */
  const couples = new Map(); // key → { a, b }
  const addCouple = (a, b) => {
    if (!a || !b || a === b || !personById.has(a) || !personById.has(b)) return;
    const key = coupleKey(a, b);
    if (!couples.has(key)) couples.set(key, { a, b, key });
  };
  for (const [a, b] of spousePairs) addCouple(a, b);
  for (const parents of parentsOf.values()) {
    if (parents.length >= 2) addCouple(parents[0], parents[1]);
  }

  // union key → [childId] (children of a two-parent couple hang from its union).
  const unionChildren = new Map();
  for (const [childId, parents] of parentsOf) {
    if (parents.length < 2) continue;
    const key = coupleKey(parents[0], parents[1]);
    if (!couples.has(key)) continue;
    if (!unionChildren.has(key)) unionChildren.set(key, []);
    unionChildren.get(key).push(childId);
  }

  /* ----------------------------------------------------------- Dagre (X) --- */
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 70, ranksep: 120, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of persons) g.setNode(p.id, { width: NODE_SIZE.width, height: NODE_SIZE.height });
  for (const key of couples.keys()) g.setNode(unionId(key), { width: UNION_SIZE.width, height: UNION_SIZE.height });

  for (const { a, b, key } of couples.values()) {
    g.setEdge(a, unionId(key));
    g.setEdge(b, unionId(key));
  }
  for (const [key, kids] of unionChildren) {
    for (const childId of kids) g.setEdge(unionId(key), childId);
  }
  for (const [childId, parents] of parentsOf) {
    // Single known parent → direct descent line (no couple to hang from).
    if (parents.length === 1) g.setEdge(parents[0], childId);
  }

  dagre.layout(g);

  /* ------------------------------------------------ Y from generation ----- */
  const gens = persons.map((p) => p.generation ?? 0);
  const maxGen = gens.length ? Math.max(...gens) : 0;
  const rowY = (gen) => (maxGen - (gen ?? 0)) * ROW_GAP; // higher generation → top

  /* ---------------------------------------------------------- RF nodes ---- */
  const nodes = [];
  for (const p of persons) {
    const cx = g.node(p.id)?.x ?? 0;
    const cy = rowY(p.generation);
    nodes.push({
      id: p.id,
      type: 'person',
      position: { x: cx - NODE_SIZE.width / 2, y: cy - NODE_SIZE.height / 2 },
      data: { person: p, isFocus: p.id === focusId },
    });
  }
  for (const { a, key } of couples.values()) {
    const cx = g.node(unionId(key))?.x ?? 0;
    const parentY = rowY(personById.get(a)?.generation);
    const hasKids = (unionChildren.get(key)?.length ?? 0) > 0;
    // Between the couple's row and the children's row, or on the couple's row.
    const cy = hasKids ? parentY + ROW_GAP / 2 : parentY;
    nodes.push({
      id: unionId(key),
      type: 'union',
      position: { x: cx - UNION_SIZE.width / 2, y: cy - UNION_SIZE.height / 2 },
      data: {},
      selectable: false,
      draggable: false,
      focusable: false,
    });
  }

  /* ------------------------------------------------------------- RF edges - */
  const spouseStyle = { stroke: '#f59e0b', strokeWidth: 2 };
  const descentStyle = { stroke: 'rgba(26,26,26,0.4)', strokeWidth: 2 };
  const matchStyle = { stroke: '#c084fc', strokeWidth: 2, strokeDasharray: '6 5' };

  const edges = [];
  for (const { a, b, key } of couples.values()) {
    edges.push(straightEdge(`${key}::sa`, a, unionId(key), spouseStyle));
    edges.push(straightEdge(`${key}::sb`, b, unionId(key), spouseStyle));
  }
  for (const [key, kids] of unionChildren) {
    for (const childId of kids) edges.push(straightEdge(`${key}->${childId}`, unionId(key), childId, descentStyle));
  }
  for (const [childId, parents] of parentsOf) {
    if (parents.length === 1) edges.push(straightEdge(`${parents[0]}->${childId}`, parents[0], childId, descentStyle));
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
