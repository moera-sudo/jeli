import { Handle, Position } from '@xyflow/react'

import styles from './GraphCanvas.module.css'

/**
 * Invisible "union" node (docs/dag-page.md): the junction that a couple's
 * descent lines pass through, so children read as belonging to the pair rather
 * than to one parent. Renders as a small muted dot; the two centred, disabled
 * handles only serve as fixed edge endpoints.
 */
export default function UnionNode() {
  const handleStyle = { opacity: 0, left: '50%', top: '50%', pointerEvents: 'none' }
  return (
    <div className={styles.unionNode} aria-hidden="true">
      <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />
    </div>
  )
}
