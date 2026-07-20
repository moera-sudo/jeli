import { radialLayout, NODE_SIZE } from './radialLayout';

/**
 * Maps a backend GraphResponse (`persons[]` + `relationships[]`) onto the
 * `nodes[]` / `edges[]` React Flow consumes — the one-to-one translation
 * described in docs/graph-data-structure.md. Positions come from the radial
 * layout; React Flow's origin is top-left, so we shift each centre point by
 * half the card size.
 *
 * @param {object} graph  GraphResponse { focus_person_id, persons, relationships }.
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildFlow(graph) {
  const persons = graph?.persons ?? [];
  const relationships = graph?.relationships ?? [];
  const focusId = graph?.focus_person_id;

  const positions = radialLayout(persons, relationships, focusId);

  const nodes = persons.map((person) => {
    const center = positions[person.id] ?? { x: 0, y: 0 };
    return {
      id: person.id,
      type: 'person',
      position: {
        x: center.x - NODE_SIZE.width / 2,
        y: center.y - NODE_SIZE.height / 2,
      },
      data: { person, isFocus: person.id === focusId },
    };
  });

  const edges = relationships.map((rel) => {
    const isMatch = rel.type === 'match_confirmed';
    const isSpouse = rel.type === 'spouse_of';
    return {
      id: rel.id,
      source: rel.from_person_id,
      target: rel.to_person_id,
      type: 'straight',
      // Spouse/match links read as associations, not descent — dash them.
      animated: false,
      style: {
        stroke: isMatch ? '#c084fc' : isSpouse ? '#f59e0b' : 'rgba(26,26,26,0.28)',
        strokeWidth: 2,
        strokeDasharray: isMatch || isSpouse ? '6 5' : undefined,
      },
      data: { type: rel.type },
    };
  });

  return { nodes, edges };
}
