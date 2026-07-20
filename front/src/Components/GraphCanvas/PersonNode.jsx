import { Handle, Position } from '@xyflow/react'

import { UserIcon } from '../../UI/icons'
import { formatPersonName } from '../../utils/fullName'
import styles from './GraphCanvas.module.css'

/**
 * Custom React Flow node for one family member.
 * Vertical card: the avatar sits on top with the full name (surname · name ·
 * patronymic, as stored) centred beneath it, fully visible. A "Это вы" badge
 * marks the focus (current-user) node; no relation labels — the layout conveys
 * kinship.
 *
 * Status dot (a full little circle sitting on the avatar's surface):
 *   registered + alive → green · unregistered + alive → red · deceased → none.
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

      <span className={styles.avatarWrap} aria-hidden="true">
        <span className={styles.avatar}>
          {person.avatar_url ? (
            <img className={styles.avatarImg} src={person.avatar_url} alt="" />
          ) : (
            <UserIcon />
          )}
        </span>
        {/* Deceased people get no dot ("same as right now"). */}
        {person.is_alive && (
          <span className={`${styles.statusDot} ${styles[`status_${state}`]}`} />
        )}
      </span>

      <span className={styles.nodeName}>{formatPersonName(person)}</span>
    </div>
  )
}
