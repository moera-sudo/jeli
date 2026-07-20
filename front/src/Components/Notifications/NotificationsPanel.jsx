import { useCallback, useEffect, useState } from 'react'

import { CloseIcon, UsersIcon, BellIcon } from '../../UI/icons'
import { listNotifications, markAllNotificationsRead } from '../../api/notificationsService'
import styles from './NotificationsPanel.module.css'

/**
 * Notifications panel — a tall panel that slides in from the right edge.
 * Backed by the real `/notifications` feature (match found / score changed /
 * node unlinked). Fetched when the panel opens; "mark all read" clears them.
 */

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** Turns a NotificationRead into a display descriptor. */
function describe(n) {
  const p = n.payload || {}
  const pct = p.score != null ? ` — совпадение ${Math.round(p.score * 100)}%` : ''
  switch (n.type) {
    case 'new_match':
      return { tone: 'match', icon: <UsersIcon />, title: 'Новое совпадение', text: `Найден возможный родственник${pct}.` }
    case 'match_score_changed':
      return { tone: 'match', icon: <UsersIcon />, title: 'Совпадение обновлено', text: `Оценка возможного родства изменилась${pct}.` }
    case 'excluded_from_graph':
      return { tone: 'system', icon: <BellIcon />, title: 'Узел отвязан', text: `«${p.person_display_name || 'Ваш узел'}» больше не связан с вашим аккаунтом.` }
    default:
      return { tone: 'system', icon: <BellIcon />, title: 'Уведомление', text: '' }
  }
}

function formatTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d)
}

export default function NotificationsPanel({ open, onClose }) {
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications())
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const hasUnread = items.some((n) => !n.is_read)

  const markAll = async () => {
    try {
      await markAllNotificationsRead()
      await load()
    } catch { /* keep the list as-is on failure */ }
  }

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
          <div className={styles.headActions}>
            {hasUnread && (
              <button type="button" className={styles.markAll} onClick={markAll}>
                Прочитать все
              </button>
            )}
            <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <p className={styles.empty}>Пока нет уведомлений.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((n) => {
              const d = describe(n)
              return (
                <li key={n.id} className={`${styles.item} ${n.is_read ? '' : styles.unread}`}>
                  <span className={`${styles.itemIcon} ${styles[d.tone]}`} aria-hidden="true">
                    {d.icon}
                  </span>
                  <div className={styles.itemBody}>
                    <p className={styles.itemTitle}>{d.title}</p>
                    {d.text && <p className={styles.itemText}>{d.text}</p>}
                    <span className={styles.itemTime}>{formatTime(n.created_at)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </>
  )
}
