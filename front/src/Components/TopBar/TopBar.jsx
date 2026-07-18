import { Link } from 'react-router-dom'

import { ROUTES } from '../../Routes/routes'
import { SearchIcon, BellIcon, BookIcon, ChatIcon } from '../../UI/icons'
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
}) {
  return (
    <header className={styles.bar}>
      <Link to={ROUTES.home} aria-label="На главную">
        <img src="src/assets/logo_2.png" alt="" className={styles.logo} />
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
        <button type="button" className={styles.iconButton} aria-label="Уведомления">
          <BellIcon />
          <span className={styles.badge} aria-hidden="true" />
        </button>
        <Link to={ROUTES.chat} className={styles.iconButton} aria-label="Мои чаты">
          <ChatIcon />
        </Link>
        <Link to={ROUTES.profile} className={styles.avatar} aria-label="Профиль">
          <img
            src="https://i.pravatar.cc/80?img=47"
            alt=""
            className={styles.avatarImg}
          />
        </Link>
      </div>
    </header>
  )
}
