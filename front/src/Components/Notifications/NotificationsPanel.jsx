import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CloseIcon, UsersIcon, BellIcon, ChatIcon } from '../../UI/icons'
import { listNotifications, markAllNotificationsRead } from '../../api/notificationsService'
import { ROUTES, chatPath } from '../../Routes/Routes'
import styles from './NotificationsPanel.module.css'

/**
 * Notifications panel — a tall panel that slides in from the right edge.
 * Backed by the real `/notifications` feature (new message / match found /
 * score changed / node unlinked). Opening the panel IS the read action:
 * everything is marked read automatically, so there is no manual button.
 * Tapping an item takes the user to its source — the chat for a message, or
 * the relevant tab for anything else.
 */

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Turns a NotificationRead into a display + navigation descriptor.
 * `source` names where it came from (Чаты / Совпадения / Древо); `nav` is the
 * route to open on tap (with optional router state to open a specific tab).
 */
function describe(n) {
  const p = n.payload || {}
  const pct = p.score != null ? ` — совпадение ${Math.round(p.score * 100)}%` : ''
  switch (n.type) {
    case 'new_message':
      return {
        tone: 'chat',
        icon: <ChatIcon />,
        source: 'Чаты',
        title: 'Новое сообщение',
        text: 'Вам написал родственник — откройте, чтобы прочитать и ответить.',
        nav: { to: p.chat_id ? chatPath(p.chat_id) : ROUTES.chats },
      }
    case 'new_match':
      return {
        tone: 'match',
        icon: <UsersIcon />,
        source: 'Совпадения',
        title: 'Новое совпадение',
        text: `Найден возможный родственник${pct}. Откройте вкладку совпадений, чтобы подтвердить.`,
        nav: { to: ROUTES.home, state: { openMatches: true } },
      }
    case 'match_score_changed':
      return {
        tone: 'match',
        icon: <UsersIcon />,
        source: 'Совпадения',
        title: 'Совпадение обновлено',
        text: `Оценка возможного родства изменилась${pct}.`,
        nav: { to: ROUTES.home, state: { openMatches: true } },
      }
    case 'excluded_from_graph':
      return {
        tone: 'system',
        icon: <BellIcon />,
        source: 'Древо',
        title: 'Узел отвязан',
        text: `«${p.person_display_name || 'Ваш узел'}» больше не связан с вашим аккаунтом.`,
        nav: { to: ROUTES.home },
      }
    default:
      return {
        tone: 'system',
        icon: <BellIcon />,
        source: 'Система',
        title: 'Уведомление',
        text: '',
        nav: { to: ROUTES.home },
      }
  }
}

function formatTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d)
}

export default function NotificationsPanel({ open, onClose }) {
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const list = await listNotifications()
      setItems(list)
      // Opening the panel is the read action — clear unread server-side so the
      // header dot stays consistent. Best-effort; the list already rendered.
      if (list.some((n) => !n.is_read)) {
        markAllNotificationsRead().catch(() => {})
      }
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // Tap → go to the source: the chat for a message, or the matching/tree tab
  // for everything else (via router state the target page reads to open it).
  const handleOpen = (n) => {
    const { nav } = describe(n)
    onClose()
    if (nav?.to) navigate(nav.to, nav.state ? { state: nav.state } : undefined)
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
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {items.length === 0 ? (
          <p className={styles.empty}>Пока нет уведомлений.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((n) => {
              const d = describe(n)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${n.is_read ? '' : styles.unread}`}
                    onClick={() => handleOpen(n)}
                  >
                    <span className={`${styles.itemIcon} ${styles[d.tone]}`} aria-hidden="true">
                      {d.icon}
                    </span>
                    <div className={styles.itemBody}>
                      <span className={styles.itemSource}>{d.source}</span>
                      <p className={styles.itemTitle}>{d.title}</p>
                      {d.text && <p className={styles.itemText}>{d.text}</p>}
                      <span className={styles.itemTime}>{formatTime(n.created_at)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </>
  )
}
