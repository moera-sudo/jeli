import { Handle, Position } from '@xyflow/react'

import { UserIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

/**
 * Custom React Flow node for one family member.
 * Renders exactly what the brief asks for — an avatar and the full name — plus
 * a small status dot and a "Это вы" badge on the focus (current-user) node.
 * No relation labels (son/mother/…): the layout itself conveys kinship.
 *
 * The two handles are centred and invisible; with `nodesConnectable={false}`
 * they only serve as fixed endpoints so edges run node-centre to node-centre.
 */
export default function PersonNode({ data, selected }) {
  const { person, isFocus } = data
  const state = !person.is_alive ? 'deceased' : person.is_registered ? 'registered' : 'unregistered'

  const className = [
    styles.node,
    styles[`node_${state}`],
    isFocus ? styles.nodeFocus : '',
    selected ? styles.nodeSelected : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleStyle = { opacity: 0, left: '50%', top: '50%', pointerEvents: 'none' }

  return (
    <div className={className}>
      <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />

      {isFocus && <span className={styles.youBadge}>Это вы</span>}

      <span className={styles.nodeAvatar} aria-hidden="true">
        {person.avatar_url ? (
          <img className={styles.nodeAvatarImg} src={person.avatar_url} alt="" />
        ) : (
          <UserIcon />
        )}
        {person.is_alive && <span className={`${styles.statusDot} ${styles[`status_${state}`]}`} />}
      </span>

      <span className={styles.nodeName}>{person.full_name}</span>
    </div>
  )
}
