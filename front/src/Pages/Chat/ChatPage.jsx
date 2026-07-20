import { Link } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import { ArrowLeftIcon, SendIcon, ImageIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/Routes'
import styles from './ChatPage.module.css'

/**
 * Conversation page. Layout only: static message history and a composer that
 * is presentational (submitting does nothing yet).
 */
const PEER = { name: 'Ерлан Серіков', avatar: 'https://i.pravatar.cc/96?img=12' }

const MESSAGES = [
  { id: 1, from: 'them', text: 'Ассалаумағалейкум! Я нашёл нас в общем древе 🌳', time: '12:31' },
  { id: 2, from: 'me', text: 'Уағалейкум ассалам! Правда? По какой линии?', time: '12:33' },
  { id: 3, from: 'them', text: 'По роду Ботбай — наши прадеды были братьями.', time: '12:35' },
  { id: 4, from: 'them', text: 'Могу скинуть старые фотографии, если интересно.', time: '12:36' },
  { id: 5, from: 'me', text: 'Конечно, буду очень рад! Давай созвонимся на выходных.', time: '12:40' },
]

export default function ChatPage() {
  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        <section className={styles.conversation}>
          {/* --------------------------------------------------- chat header */}
          <header className={styles.chatHead}>
            <Link to={ROUTES.chats} className={styles.back} aria-label="К списку чатов">
              <ArrowLeftIcon />
            </Link>
            <img className={styles.headAvatar} src={PEER.avatar} alt="" />
            <span className={styles.headName}>{PEER.name}</span>
          </header>

          {/* ------------------------------------------------------ messages */}
          <div className={styles.messages}>
            <div className={styles.dayDivider}><span>Сегодня</span></div>

            {MESSAGES.map((m) => (
              <div
                key={m.id}
                className={`${styles.bubbleRow} ${m.from === 'me' ? styles.mine : styles.theirs}`}
              >
                <div className={styles.bubble}>
                  <p className={styles.bubbleText}>{m.text}</p>
                  <span className={styles.bubbleTime}>{m.time}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ------------------------------------------------------ composer */}
          <form className={styles.composer} onSubmit={(e) => e.preventDefault()}>
            <button type="button" className={styles.attach} aria-label="Прикрепить файл">
              <ImageIcon />
            </button>
            <textarea
              className={styles.input}
              rows={1}
              placeholder="Напишите сообщение…"
              aria-label="Текст сообщения"
            />
            <button type="submit" className={styles.send} aria-label="Отправить">
              <SendIcon />
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
