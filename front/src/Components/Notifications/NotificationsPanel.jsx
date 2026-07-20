import { CloseIcon, CheckIcon, UsersIcon, ChatIcon, BellIcon, UserIcon } from '../../UI/icons'
import styles from './NotificationsPanel.module.css'

/**
 * Notifications modal — a tall panel that slides in from the right edge.
 * Layout only: the items are static sample data and no actions are wired.
 *
 * @param {object}     props
 * @param {boolean}    props.open     Whether the panel is shown.
 * @param {() => void} props.onClose  Dismisses the panel.
 */

const NOTIFICATIONS = [
  {
    id: 1,
    icon: <UsersIcon />,
    tone: 'match',
    title: 'Найден возможный родственник',
    text: 'Динара Ахметова совпадает с вашим древом по роду Ботбай.',
    time: '5 мин назад',
    unread: true,
  },
  {
    id: 2,
    icon: <ChatIcon />,
    tone: 'chat',
    title: 'Новое сообщение',
    text: 'Ерлан: «Ассалаумағалейкум, нашёл общего предка!»',
    time: '20 мин назад',
    unread: true,
  },
  {
    id: 3,
    icon: <UserIcon />,
    tone: 'invite',
    title: 'Приглашение принято',
    text: 'Асель Серікова присоединилась к вашему древу.',
    time: '2 ч назад',
    unread: false,
  },
  {
    id: 4,
    icon: <BellIcon />,
    tone: 'system',
    title: 'Древо обновлено',
    text: 'Добавлено новое поколение — 3 родственника.',
    time: 'Вчера',
    unread: false,
  },
]

export default function NotificationsPanel({ open, onClose }) {
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
        {/* ------------------------------------------------------------- head */}
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 className={styles.title}>Уведомления</h2>
            <span className={styles.subtitle}>2 новых</span>
          </div>
          <div className={styles.headActions}>
            <button type="button" className={styles.markAll}>
              <CheckIcon /> Прочитать все
            </button>
            <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------------------ items */}
        <ul className={styles.list}>
          {NOTIFICATIONS.map((n) => (
            <li key={n.id} className={`${styles.item} ${n.unread ? styles.itemUnread : ''}`}>
              <span className={`${styles.itemIcon} ${styles[n.tone]}`} aria-hidden="true">
                {n.icon}
              </span>
              <div className={styles.itemBody}>
                <p className={styles.itemTitle}>{n.title}</p>
                <p className={styles.itemText}>{n.text}</p>
                <span className={styles.itemTime}>{n.time}</span>
              </div>
              {n.unread && <span className={styles.unreadDot} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </aside>
    </>
  )
}
