import { useEffect, useState } from 'react'

import { CloseIcon, UsersIcon, CheckIcon, BellIcon } from '../../UI/icons'
import { getMarriageProposals } from '../../api/graphService'
import { useAuth } from '../../auth/AuthContext'
import styles from './NotificationsPanel.module.css'

/**
 * Notifications modal — a tall panel that slides in from the right edge.
 *
 * There is no dedicated notifications backend yet, so items are derived
 * best-effort from the user's marriage/merge proposals (`GET /marriage-proposals`):
 * the outcome of a request the user sent, and any new incoming request. The
 * list is fetched when the panel opens and tolerates an empty result.
 */

/** Turns a proposal into a notification descriptor, relative to the viewer. */
function toNotification(proposal, userId) {
  const outgoing = proposal.proposer_user_id === userId
  if (proposal.status === 'confirmed') {
    return {
      tone: 'invite',
      icon: <CheckIcon />,
      title: outgoing ? 'Запрос на связь принят' : 'Связь семей подтверждена',
      text: 'Деревья двух семей теперь видны друг другу.',
    }
  }
  if (proposal.status === 'rejected' && outgoing) {
    return { tone: 'system', icon: <BellIcon />, title: 'Запрос на связь отклонён', text: 'Другая семья отклонила ваш запрос.' }
  }
  if (proposal.status === 'pending') {
    return outgoing
      ? { tone: 'system', icon: <UsersIcon />, title: 'Запрос отправлен', text: 'Ожидает подтверждения другой семьи.' }
      : { tone: 'match', icon: <UsersIcon />, title: 'Новый запрос на связь семей', text: 'Подтвердите его во вкладке «Запросы».' }
  }
  return null
}

export default function NotificationsPanel({ open, onClose }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!open || !user) return
    let active = true
    getMarriageProposals()
      .then((proposals) => {
        if (!active) return
        setItems(
          proposals
            .map((p) => ({ id: p.id, ...toNotification(p, user.id) }))
            .filter((n) => n.title),
        )
      })
      .catch(() => active && setItems([]))
    return () => {
      active = false
    }
  }, [open, user])

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`${styles.panel} ${open ? styles.open : ''}`}
        role="dialog"
        aria-label="Уведомления"
        aria-hidden={!open}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>Уведомления</h2>
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {items.length === 0 ? (
          <p className={styles.empty}>Пока нет уведомлений.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((n) => (
              <li key={n.id} className={styles.item}>
                <span className={`${styles.itemIcon} ${styles[n.tone]}`} aria-hidden="true">
                  {n.icon}
                </span>
                <div className={styles.itemBody}>
                  <p className={styles.itemTitle}>{n.title}</p>
                  <p className={styles.itemText}>{n.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  )
}
