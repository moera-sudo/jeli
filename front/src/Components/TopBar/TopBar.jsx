import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ROUTES } from '../../Routes/Routes'
import { SearchIcon, BellIcon, BookIcon, ChatIcon, UsersIcon, UserIcon } from '../../UI/icons'
import NotificationsPanel from '../Notifications/NotificationsPanel'
import { listNotifications } from '../../api/notificationsService'
import { useAuth } from '../../auth/AuthContext'
import { resolveMediaUrl } from '../../api/mediaService'
import { formatPersonName } from '../../utils/fullName'
import logo from '../../assets/logo_2.png'
import styles from './TopBar.module.css'

// Fields the tree search matches against — everything the graph node carries
// (name parts + birth/death year). Geo/ethnic fields aren't in the graph payload.
function personHaystack(p) {
  return [formatPersonName(p, ''), p.birth_year, p.death_year].filter(Boolean).join(' ').toLowerCase()
}

/**
 * Global application header: brand mark, a central search field, and the
 * right-hand cluster of actions (family history, notifications, account).
 *
 * The search bar filters the loaded family tree (when `searchPeople` is given)
 * and reports the chosen person via `onSearchPick`; the history toggle only
 * renders when `onToggleHistory` is supplied, so other screens stay unchanged.
 *
 * @param {object}   props
 * @param {string}   [props.searchPlaceholder]  Placeholder for the search field.
 * @param {Array}    [props.searchPeople]       People to search (graph nodes).
 * @param {(id: string) => void} [props.onSearchPick]  Called with the picked person id.
 * @param {boolean}  [props.historyActive]      Whether the history panel is open.
 * @param {() => void} [props.onToggleHistory]  Toggles the history panel.
 */
export default function TopBar({
  searchPlaceholder = 'Поиск по дереву — имя, фамилия, отчество, год…',
  searchPeople = [],
  onSearchPick,
  historyActive = false,
  onToggleHistory,
  matchesActive = false,
  onToggleMatches,
}) {
  const { user } = useAuth()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const searchable = searchPeople.length > 0
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !searchable) return []
    return searchPeople
      .filter((p) => personHaystack(p).includes(q))
      .slice(0, 8)
  }, [query, searchPeople, searchable])

  const pickResult = (id) => {
    onSearchPick?.(id)
    setQuery('')
    setSearchFocused(false)
  }

  const showDrop = searchFocused && searchable
  const q = query.trim()
  // Whether the server still has unread notifications — drives the dot. Derived
  // from the backend (not local state) so it survives a page reload.
  const [hasUnread, setHasUnread] = useState(false)

  const refreshUnread = useCallback(async () => {
    try {
      const unread = await listNotifications(true)
      setHasUnread(unread.length > 0)
    } catch {
      setHasUnread(false)
    }
  }, [])

  // Check for unread on mount (and whenever the account changes).
  useEffect(() => {
    refreshUnread()
  }, [refreshUnread, user?.id])

  // Opening the panel marks everything read server-side → clear the dot now.
  const toggleNotifications = () =>
    setNotificationsOpen((open) => {
      if (!open) setHasUnread(false)
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
          aria-label="Поиск по дереву"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          disabled={!searchable}
        />

        {showDrop && (
          // onMouseDown-preventDefault keeps focus so the click lands before blur.
          <div className={styles.searchDrop} onMouseDown={(e) => e.preventDefault()}>
            {!q ? (
              <p className={styles.searchHint}>
                Искать можно по имени, фамилии, отчеству или году рождения — по всем родственникам в дереве.
              </p>
            ) : results.length === 0 ? (
              <p className={styles.searchHint}>Никого не найдено по запросу «{q}».</p>
            ) : (
              <ul className={styles.searchList}>
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={styles.searchItem} onClick={() => pickResult(p.id)}>
                      {p.avatar_url ? (
                        <img className={styles.searchAvatar} src={resolveMediaUrl(p.avatar_url)} alt="" />
                      ) : (
                        <span className={styles.searchAvatarFallback} aria-hidden="true"><UserIcon /></span>
                      )}
                      <span className={styles.searchName}>{formatPersonName(p, 'Без имени')}</span>
                      {p.birth_year && <span className={styles.searchYear}>{p.birth_year}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
          {hasUnread && <span className={styles.badge} aria-hidden="true" />}
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
