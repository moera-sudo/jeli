import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ROUTES, chatPath } from '../../Routes/Routes'
import { SearchIcon, BellIcon, BookIcon, ChatIcon, UsersIcon, UserIcon } from '../../UI/icons'
import NotificationsPanel from '../Notifications/NotificationsPanel'
import MemberProfileModal from '../GraphCanvas/MemberProfileModal'
import { listNotifications } from '../../api/notificationsService'
import { searchProfiles } from '../../api/searchService'
import { createChat } from '../../api/messengerService'
import { useAuth } from '../../utils/AuthContext'
import { resolveMediaUrl } from '../../api/mediaService'
import { formatPersonName } from '../../utils/fullName'
import logo from '../../assets/logo_2.png'
import styles from './TopBar.module.css'

/**
 * Global application header: brand mark, a platform-wide people search, and the
 * right-hand cluster of actions (family history, notifications, account).
 *
 * The search queries EVERY registered user across all trees by name (backend
 * `/search`); clicking a result opens that person's public profile (with a chat
 * button when they have a tree node). The history toggle only renders when
 * `onToggleHistory` is supplied, so other screens stay unchanged.
 */
export default function TopBar({
  searchPlaceholder = 'Поиск людей по имени — по всей платформе…',
  historyActive = false,
  onToggleHistory,
  matchesActive = false,
  onToggleMatches,
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  /* ------------------------------------------------------ platform search */
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null) // clicked UserPublic → profile modal

  // Debounced platform-wide search (by name) whenever the query changes.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setSearching(false); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        setResults(await searchProfiles(q))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const openProfile = (u) => {
    setSelected(u)
    setSearchFocused(false)
  }

  // Chat is only possible if the found user already has a tree node (person_id).
  const openChatWith = async (u) => {
    if (!u?.person_id) return
    try {
      const chat = await createChat(u.person_id)
      setSelected(null)
      navigate(chatPath(chat.id))
    } catch { /* surfaced elsewhere; keep the modal open */ }
  }

  const q = query.trim()
  const showDrop = searchFocused
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
          aria-label="Поиск людей"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />

        {showDrop && (
          // onMouseDown-preventDefault keeps focus so the click lands before blur.
          <div className={styles.searchDrop} onMouseDown={(e) => e.preventDefault()}>
            {!q ? (
              <p className={styles.searchHint}>
                Ищите людей по всей платформе — по фамилии, имени или отчеству. Найдёте — откроете профиль и сможете написать.
              </p>
            ) : searching ? (
              <p className={styles.searchHint}>Поиск…</p>
            ) : results.length === 0 ? (
              <p className={styles.searchHint}>Никого не найдено по запросу «{q}».</p>
            ) : (
              <ul className={styles.searchList}>
                {results.map((p) => {
                  const place = [p.current_city, p.current_country].filter(Boolean).join(', ')
                  return (
                    <li key={p.id}>
                      <button type="button" className={styles.searchItem} onClick={() => openProfile(p)}>
                        {p.avatar_url ? (
                          <img className={styles.searchAvatar} src={resolveMediaUrl(p.avatar_url)} alt="" />
                        ) : (
                          <span className={styles.searchAvatarFallback} aria-hidden="true"><UserIcon /></span>
                        )}
                        <span className={styles.searchBody}>
                          <span className={styles.searchName}>{formatPersonName(p, 'Без имени')}</span>
                          {place && <span className={styles.searchSub}>{place}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {selected && (
        <MemberProfileModal
          userId={selected.id}
          onOpenChat={selected.person_id ? () => openChatWith(selected) : undefined}
          onClose={() => setSelected(null)}
        />
      )}

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
