import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import Loader from '../../UI/Loader/Loader'
import { ArrowLeftIcon, SendIcon, ImageIcon, UserIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/Routes'
import { listMessages, sendMessage, listChats } from '../../api/messengerService'
import { getPublicProfile } from '../../api/profileService'
import { uploadMedia, resolveMediaUrl } from '../../api/mediaService'
import { useAuth } from '../../utils/AuthContext'
import { formatPersonName } from '../../utils/fullName'
import styles from './ChatPage.module.css'

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
function formatTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : TIME_FMT.format(d)
}

const IMAGE_RE = /^!\[[^\]]*\]\((.+)\)$/
/** Renders a message as an image if it's an image-markdown, else as text. */
function MessageBody({ content }) {
  const match = content.match(IMAGE_RE)
  if (match) return <img className={styles.bubbleImg} src={resolveMediaUrl(match[1])} alt="" />
  return <p className={styles.bubbleText}>{content}</p>
}

/** One conversation — history + composer, backed by /chats/{id}/messages. */
export default function ChatPage() {
  const { id: chatId } = useParams()
  const { user } = useAuth()

  const [messages, setMessages] = useState(null)
  const [peer, setPeer] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let active = true
    setMessages(null)
    listMessages(chatId)
      .then((list) => active && setMessages(list))
      .catch((err) => { if (active) { setMessages([]); setError(err.message || 'Не удалось загрузить сообщения') } })
    // Peer identity comes from the chat list.
    listChats()
      .then(async (chats) => {
        const chat = chats.find((c) => c.id === chatId)
        if (chat && active) setPeer(await getPublicProfile(chat.peer_user_id).catch(() => null))
      })
      .catch(() => {})
    return () => { active = false }
  }, [chatId])

  // Keep the view pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const push = (message) => setMessages((prev) => [...(prev ?? []), message])

  const send = async (content) => {
    setError('')
    setSending(true)
    try {
      push(await sendMessage(chatId, content))
    } catch (err) {
      setError(err.message || 'Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setText('')
    send(content)
  }

  const handleAttach = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { url } = await uploadMedia(file)
      await send(`![image](${url})`)
    } catch (err) {
      setError(err.message || 'Не удалось отправить изображение')
    }
  }

  const peerName = formatPersonName(peer, 'Родственник')
  const peerAvatar = resolveMediaUrl(peer?.avatar_url)

  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        <section className={styles.conversation}>
          <header className={styles.chatHead}>
            <Link to={ROUTES.chats} className={styles.back} aria-label="К списку чатов">
              <ArrowLeftIcon />
            </Link>
            {peerAvatar ? (
              <img className={styles.headAvatar} src={peerAvatar} alt="" />
            ) : (
              <span className={styles.headAvatarFallback} aria-hidden="true"><UserIcon /></span>
            )}
            <span className={styles.headName}>{peerName}</span>
          </header>

          <div className={styles.messages} ref={scrollRef}>
            {messages === null ? (
              <div className={styles.centered}><Loader /></div>
            ) : messages.length === 0 ? (
              <p className={styles.emptyMsg}>Сообщений пока нет. Напишите первым!</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`${styles.bubbleRow} ${m.sender_id === user?.id ? styles.mine : styles.theirs}`}
                >
                  <div className={styles.bubble}>
                    <MessageBody content={m.content} />
                    <span className={styles.bubbleTime}>{formatTime(m.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <form className={styles.composer} onSubmit={handleSubmit}>
            <button type="button" className={styles.attach} aria-label="Прикрепить изображение" onClick={() => fileRef.current?.click()}>
              <ImageIcon />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAttach} />
            <textarea
              className={styles.input}
              rows={1}
              placeholder="Напишите сообщение…"
              aria-label="Текст сообщения"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e) }}
            />
            <button type="submit" className={styles.send} aria-label="Отправить" disabled={!text.trim() || sending}>
              <SendIcon />
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
