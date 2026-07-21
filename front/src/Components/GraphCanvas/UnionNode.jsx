import { Handle, Position } from '@xyflow/react'

import styles from './GraphCanvas.module.css'

/**
 * Invisible "union" node (docs/dag-page.md): the junction that a couple's
 * descent lines pass through, so children read as belonging to the pair rather
 * than to one parent. Renders as a small muted dot; the disabled handles at its
 * top (incoming from the two parents) and bottom (outgoing to the children) are
 * fixed anchors for the orthogonal edges.
 */
export default function UnionNode() {
  const handleStyle = { opacity: 0, pointerEvents: 'none' }
  return (
    <div className={styles.unionNode} aria-hidden="true">
      {/* left/right receive the two spouse lines (horizontal marriage); bottom
          sends the descent trunk down to the children. */}
      <Handle id="l" type="target" position={Position.Left} style={handleStyle} isConnectable={false} />
      <Handle id="r" type="target" position={Position.Right} style={handleStyle} isConnectable={false} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />
    </div>
  )
}
