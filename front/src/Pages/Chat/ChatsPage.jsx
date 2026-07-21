import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import Loader from '../../UI/Loader/Loader'
import { SearchIcon, UserIcon } from '../../UI/icons'
import { chatPath } from '../../Routes/Routes'
import { listChats } from '../../api/messengerService'
import { getPublicProfile } from '../../api/profileService'
import { resolveMediaUrl } from '../../api/mediaService'
import { formatPersonName } from '../../utils/fullName'
import styles from './ChatsPage.module.css'

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d)
}

const IMAGE_MD = /^\s*!\[[^\]]*]\([^)]*\)\s*$/
function previewText(content) {
  if (!content) return ''
  return IMAGE_MD.test(content) ? 'Фото' : content
}

export default function ChatsPage() {
  const [chats, setChats] = useState(null)
  const [peers, setPeers] = useState({})
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    listChats()
      .then(async (list) => {
        if (!active) return
        setChats(list)
        const ids = [...new Set(list.map((c) => c.peer_user_id))]
        const entries = await Promise.all(
          ids.map(async (id) => {
            try { return [id, await getPublicProfile(id)] } catch { return [id, null] }
          }),
        )
        if (active) setPeers(Object.fromEntries(entries))
      })
      .catch(() => active && setChats([]))
    return () => { active = false }
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (chats ?? [])
      .map((c) => ({
        id: c.id,
        name: formatPersonName(peers[c.peer_user_id], 'Родственник'),
        avatar: resolveMediaUrl(peers[c.peer_user_id]?.avatar_url),
        last: previewText(c.last_message?.content),
        time: formatTime(c.last_message?.created_at ?? c.created_at),
      }))
      .filter((r) => r.name.toLowerCase().includes(q))
  }, [chats, peers, query])

  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        <header className={styles.head}>
          <h1 className={styles.title}>Чаты</h1>
        </header>

        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true"><SearchIcon /></span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Поиск по чатам…"
            aria-label="Поиск по чатам"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {chats === null ? (
          <div className={styles.centered}><Loader /></div>
        ) : rows.length === 0 ? (
          <p className={styles.empty}>Пока нет чатов. Откройте карточку родственника и нажмите «Открыть чат».</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((chat) => (
              <li key={chat.id}>
                <Link to={chatPath(chat.id)} className={styles.row}>
                  {chat.avatar ? (
                    <img className={styles.avatar} src={chat.avatar} alt="" />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden="true"><UserIcon /></span>
                  )}
                  <span className={styles.body}>
                    <span className={styles.name}>{chat.name}</span>
                    {chat.last && <span className={styles.preview}>{chat.last}</span>}
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.time}>{chat.time}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
