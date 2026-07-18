import { useState } from 'react'

import {
  CloseIcon,
  BoldIcon,
  ItalicIcon,
  HeadingIcon,
  ListIcon,
  QuoteIcon,
  LinkIcon,
  ImageIcon,
} from '../../UI/icons'
import Button from '../../UI/Button/Button'
import styles from './HistoryPanel.module.css'

/**
 * Family-history side panel — a Markdown editor that slides in beside the
 * graph. Layout only: the formatting toolbar and the Write/Preview tabs are
 * presentational; wiring a real Markdown engine comes later.
 *
 * @param {object}     props
 * @param {boolean}    props.open       Whether the panel is expanded.
 * @param {() => void} props.onClose    Collapses the panel.
 */
export default function HistoryPanel({ open, onClose }) {
  const [tab, setTab] = useState('write')

  const tools = [
    { icon: <HeadingIcon />, label: 'Заголовок' },
    { icon: <BoldIcon />, label: 'Жирный' },
    { icon: <ItalicIcon />, label: 'Курсив' },
    { icon: <ListIcon />, label: 'Список' },
    { icon: <QuoteIcon />, label: 'Цитата' },
    { icon: <LinkIcon />, label: 'Ссылка' },
    { icon: <ImageIcon />, label: 'Изображение' },
  ]

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : ''}`}
      aria-hidden={!open}
    >
      <div className={styles.inner}>
        {/* -------------------------------------------------------------- head */}
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 className={styles.title}>Родовая история</h2>
            <span className={styles.subtitle}>Хроника семьи · Markdown</span>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Свернуть панель"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        {/* Title of the entry. */}
        <input
          className={styles.docTitle}
          placeholder="Заголовок записи…"
          aria-label="Заголовок записи"
        />

        {/* Write / Preview tabs. */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'write'}
            className={`${styles.tab} ${tab === 'write' ? styles.tabActive : ''}`}
            onClick={() => setTab('write')}
          >
            Написать
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            className={`${styles.tab} ${tab === 'preview' ? styles.tabActive : ''}`}
            onClick={() => setTab('preview')}
          >
            Предпросмотр
          </button>
        </div>

        {/* Formatting toolbar. */}
        <div className={styles.toolbar} role="toolbar" aria-label="Форматирование">
          {tools.map((t) => (
            <button key={t.label} type="button" className={styles.tool} aria-label={t.label}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Editor / preview surface. */}
        <div className={styles.editorArea}>
          {tab === 'write' ? (
            <textarea
              className={styles.editor}
              placeholder={
                '# Наш род\n\nЗапишите историю семьи в Markdown — предания, переезды, ремёсла и памятные даты…\n\n- **Асан** родился в 1938 году\n- Переезд рода в 1954 году\n\n> Легенда о происхождении рода Ботбай.'
              }
              aria-label="Текст истории"
            />
          ) : (
            <div className={styles.preview}>
              <h1>Наш род</h1>
              <p>
                Запишите историю семьи в Markdown — предания, переезды, ремёсла и
                памятные даты…
              </p>
              <ul>
                <li><strong>Асан</strong> родился в 1938 году</li>
                <li>Переезд рода в 1954 году</li>
              </ul>
              <blockquote>Легенда о происхождении рода Ботбай.</blockquote>
            </div>
          )}
        </div>

        {/* Footer actions. */}
        <footer className={styles.foot}>
          <span className={styles.saved}>Черновик сохранён локально</span>
          <Button variant="accent">Сохранить</Button>
        </footer>
      </div>
    </aside>
  )
}
