import { BaseEdge } from '@xyflow/react'

// The sibling bar sits this many px above the children's top edge — a fixed,
// low offset (not the midpoint) so all children of one union share one clean bar.
export const CHILD_STUB = 28

/**
 * Descent edge — the classic genealogy connector with SHARP right angles:
 * a vertical trunk drops from the source (a couple's union dot, or a single
 * parent), turns once at the sibling bar just above the children's row, then a
 * short vertical stub drops into the child's top. Siblings share source + row,
 * so their trunks/bar overlap into a single tidy bus instead of crossing.
 */
export default function DescentEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerEnd, interactionWidth = 18 }) {
  // Bar sits CHILD_STUB above the child, raised further by the source's stagger
  // offset so neighbouring families' buses land at different heights.
  const barY = targetY - CHILD_STUB - (data?.barOffset ?? 0)
  const path = `M ${sourceX},${sourceY} L ${sourceX},${barY} L ${targetX},${barY} L ${targetX},${targetY}`
  // BaseEdge draws the visible line plus a fat transparent interaction path
  // (interactionWidth) so the owner can still click the connector to manage it.
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
}
