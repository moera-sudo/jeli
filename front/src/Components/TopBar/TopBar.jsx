import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ROUTES } from '../../Routes/Routes'
import { SearchIcon, BellIcon, BookIcon, ChatIcon, UsersIcon } from '../../UI/icons'
import NotificationsPanel from '../Notifications/NotificationsPanel'
import { useAuth } from '../../auth/AuthContext'
import { resolveMediaUrl } from '../../api/mediaService'
import logo from '../../assets/logo_2.png'
import styles from './TopBar.module.css'

/**
 * Global application header: brand mark, a central search field, and the
 * right-hand cluster of actions (family history, notifications, account).
 *
 * The history toggle is rendered only when `onToggleHistory` is supplied, so
 * screens without a history panel (e.g. the profile) stay unchanged.
 *
 * @param {object}   props
 * @param {string}   [props.searchPlaceholder]  Placeholder for the search field.
 * @param {boolean}  [props.historyActive]      Whether the history panel is open.
 * @param {() => void} [props.onToggleHistory]  Toggles the history panel.
 */
export default function TopBar({
  searchPlaceholder = 'Найти родственника по имени…',
  historyActive = false,
  onToggleHistory,
  matchesActive = false,
  onToggleMatches,
}) {
  const { user } = useAuth()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  // Opening the panel marks everything as read → the unread dot clears.
  const [notificationsSeen, setNotificationsSeen] = useState(false)

  const toggleNotifications = () =>
    setNotificationsOpen((open) => {
      if (!open) setNotificationsSeen(true)
      return !open
    })

  return (
    <header className={styles.bar}>
      <Link to={ROUTES.home} aria-label="На главную">
        <img src={logo} alt="" className={styles.logo} />
      </Link>

      <div className={styles.search}>
        <span className={styles.searchIcon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={searchPlaceholder}
          aria-label="Поиск"
        />
      </div>

      <div className={styles.actions}>
        {onToggleMatches && (
          <button
            type="button"
            className={`${styles.iconButton} ${matchesActive ? styles.iconButtonActive : ''}`}
            aria-label="Совпадения и запросы"
            aria-pressed={matchesActive}
            onClick={onToggleMatches}
          >
            <UsersIcon />
          </button>
        )}
        {onToggleHistory && (
          <button
            type="button"
            className={`${styles.iconButton} ${historyActive ? styles.iconButtonActive : ''}`}
            aria-label="Родовая история"
            aria-pressed={historyActive}
            onClick={onToggleHistory}
          >
            <BookIcon />
          </button>
        )}
        <button
          type="button"
          className={`${styles.iconButton} ${notificationsOpen ? styles.iconButtonActive : ''}`}
          aria-label="Уведомления"
          aria-expanded={notificationsOpen}
          onClick={toggleNotifications}
        >
          <BellIcon />
          {!notificationsSeen && <span className={styles.badge} aria-hidden="true" />}
        </button>
        <Link to={ROUTES.chats} className={styles.iconButton} aria-label="Мои чаты">
          <ChatIcon />
        </Link>
        <Link to={ROUTES.profile} className={styles.avatar} aria-label="Профиль">
          <img
            src={resolveMediaUrl(user?.avatar_url) || 'https://placehold.co/80x80?text=%20'}
            alt=""
            className={styles.avatarImg}
          />
        </Link>
      </div>

      <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </header>
  )
}
