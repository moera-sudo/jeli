import { Link } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import { SearchIcon } from '../../UI/icons'
import { chatPath } from '../../Routes/Routes'
import styles from './ChatsPage.module.css'

/**
 * Chat history — the list of conversations. Layout only: the chats are static
 * sample data and the search field is not wired. Each row links to the
 * conversation page.
 */
const CHATS = [
  { id: 1, name: 'Ерлан Серіков', avatar: 'https://i.pravatar.cc/96?img=12', last: 'Нашёл общего предка по линии Ботбай!', time: '12:40', unread: 2 },
  { id: 2, name: 'Динара Ахметова', avatar: 'https://i.pravatar.cc/96?img=32', last: 'Отправила старые фотографии семьи', time: '11:05', unread: 0 },
  { id: 3, name: 'Род Ботбай · группа', avatar: 'https://i.pravatar.cc/96?img=5', last: 'Асель: спасибо за приглашение 🙌', time: 'Вчера', unread: 5 },
  { id: 4, name: 'Асан Дулатов', avatar: 'https://i.pravatar.cc/96?img=15', last: 'Вы: давайте свяжемся на выходных', time: 'Вчера', unread: 0 },
  { id: 5, name: 'Мая Серікова', avatar: 'https://i.pravatar.cc/96?img=45', last: 'Хорошо, договорились!', time: 'Пн', unread: 0 },
]

export default function ChatsPage() {
  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        <header className={styles.head}>
          <h1 className={styles.title}>Чаты</h1>
          <p className={styles.subtitle}>Общение с родственниками</p>
        </header>

        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Поиск по чатам…"
            aria-label="Поиск по чатам"
          />
        </div>

        <ul className={styles.list}>
          {CHATS.map((chat) => (
            <li key={chat.id}>
              <Link to={chatPath(chat.id)} className={styles.row}>
                <img className={styles.avatar} src={chat.avatar} alt="" />

                <span className={styles.body}>
                  <span className={styles.name}>{chat.name}</span>
                  <span className={styles.preview}>{chat.last}</span>
                </span>

                <span className={styles.meta}>
                  <span className={styles.time}>{chat.time}</span>
                  {chat.unread > 0 && <span className={styles.unread}>{chat.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
