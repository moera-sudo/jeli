import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

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
import Loader from '../../UI/Loader/Loader'
import { getFamily, upsertFamily } from '../../api/familyService'
import { uploadMedia, resolveMediaUrl } from '../../api/mediaService'
import styles from './HistoryPanel.module.css'

const PLACEHOLDER =
  '# Наш род\n\nЗапишите историю семьи в Markdown — предания, переезды, ремёсла и памятные даты…'
/**
 * Family-history side panel — one shared markdown "story" per family tree,
 * keyed to the graph owner. EVERY member of the tree reads the SAME story
 * (`GET /family/{ownerUserId}`) and may edit it: the backend writes edits under
 * the graph owner regardless of who saves (`PUT /family`), so the one story is
 * collaborative and the final version is visible to everyone. Opens on the
 * Preview tab by default.
 *
 * @param {object}     props
 * @param {boolean}    props.open         Whether the panel is expanded.
 * @param {() => void} props.onClose      Collapses the panel.
 * @param {string}     props.ownerUserId  Graph owner's user id — the story's key.
 */
export default function HistoryPanel({ open, onClose, ownerUserId }) {
  const [tab, setTab] = useState('preview')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const editorRef = useRef(null)
  const fileRef = useRef(null)

  // Refetch every time the panel opens (or the tree owner changes) — the shared
  // story can change under us (edited by another member, ownership transfer),
  // so we never serve a stale cache.
  useEffect(() => {
    if (!open || !ownerUserId) return
    setLoading(true)
    setError('')
    // The shared story lives under the graph owner — read it for everyone.
    getFamily(ownerUserId)
      .then((family) => {
        setTitle(family?.title ?? '')
        setContent(family?.content ?? '')
      })
      .catch((err) => {
        // 404 just means the story hasn't been written yet — start blank.
        if (err.status === 404) {
          setTitle('')
          setContent('')
        } else {
          setError(err.message || 'Не удалось загрузить историю')
        }
      })
      .finally(() => setLoading(false))
  }, [open, ownerUserId])

  const markDirty = () => { if (status) setStatus('') }

  const editSelection = (transform) => {
    const ta = editorRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const { text, selStart, selEnd } = transform(content, start, end)
    setContent(text)
    markDirty()
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(selStart, selEnd)
    })
  }

  const wrap = (before, after, placeholder) => () =>
    editSelection((text, start, end) => {
      const inner = text.slice(start, end) || placeholder
      const next = text.slice(0, start) + before + inner + after + text.slice(end)
      const selStart = start + before.length
      return { text: next, selStart, selEnd: selStart + inner.length }
    })

  const linePrefix = (prefix) => () =>
    editSelection((text, start, end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1
      const next = text.slice(0, lineStart) + prefix + text.slice(lineStart)
      return { text: next, selStart: start + prefix.length, selEnd: end + prefix.length }
    })

  const insertLink = () =>
    editSelection((text, start, end) => {
      const label = text.slice(start, end) || 'текст ссылки'
      const snippet = `[${label}](https://)`
      const next = text.slice(0, start) + snippet + text.slice(end)
      // Select the URL part so the user can type it right away.
      const selStart = start + label.length + 3
      return { text: next, selStart, selEnd: selStart + 8 }
    })

  const insertImage = (url, alt = 'изображение') =>
    editSelection((text, start, end) => {
      const snippet = `![${alt}](${url})`
      const next = text.slice(0, start) + snippet + text.slice(end)
      const pos = start + snippet.length
      return { text: next, selStart: pos, selEnd: pos }
    })

  const handleImagePick = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const { url } = await uploadMedia(file)
      insertImage(url, file.name.replace(/\.[^.]+$/, ''))
    } catch (err) {
      setError(err.message || 'Не удалось загрузить изображение')
    } finally {
      setUploading(false)
    }
  }

  const tools = [
    { icon: <HeadingIcon />, label: 'Заголовок', onClick: linePrefix('# ') },
    { icon: <BoldIcon />, label: 'Жирный', onClick: wrap('**', '**', 'жирный текст') },
    { icon: <ItalicIcon />, label: 'Курсив', onClick: wrap('*', '*', 'курсив') },
    { icon: <ListIcon />, label: 'Список', onClick: linePrefix('- ') },
    { icon: <QuoteIcon />, label: 'Цитата', onClick: linePrefix('> ') },
    { icon: <LinkIcon />, label: 'Ссылка', onClick: insertLink },
    { icon: <ImageIcon />, label: 'Изображение', onClick: () => fileRef.current?.click() },
  ]

  const canSave = title.trim().length > 0 && !saving && !loading

  const handleSave = async () => {
    if (!canSave) return
    setError('')
    setSaving(true)
    try {
      const saved = await upsertFamily({ title: title.trim(), content })
      setTitle(saved.title)
      setContent(saved.content)
      setStatus('Сохранено')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const markdownComponents = {
    img: ({ node: _node, src, alt, ...props }) => <img {...props} src={resolveMediaUrl(src)} alt={alt || ''} />,
  }

  return (
    <aside className={`${styles.panel} ${open ? styles.open : ''}`} aria-hidden={!open}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 className={styles.title}>Родовая история</h2>
            <span className={styles.subtitle}>Общая хроника семьи · Markdown</span>
          </div>
          <button type="button" className={styles.close} aria-label="Свернуть панель" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {loading ? (
          <div className={styles.centered}><Loader /></div>
        ) : (
          /* ------ shared editor — every family member can edit and save --- */
          <>
            <input
              className={styles.docTitle}
              placeholder="Заголовок записи…"
              aria-label="Заголовок записи"
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty() }}
            />

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

            {tab === 'write' && (
              <div className={styles.toolbar} role="toolbar" aria-label="Форматирование">
                {tools.map((t) => (
                  <button key={t.label} type="button" className={styles.tool} aria-label={t.label} onClick={t.onClick} disabled={uploading && t.label === 'Изображение'}>
                    {t.icon}
                  </button>
                ))}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImagePick} />
              </div>
            )}

            <div className={styles.editorArea}>
              {tab === 'write' ? (
                <textarea
                  ref={editorRef}
                  className={styles.editor}
                  placeholder={PLACEHOLDER}
                  aria-label="Текст истории"
                  value={content}
                  onChange={(e) => { setContent(e.target.value); markDirty() }}
                />
              ) : (
                <div className={styles.preview}>
                  {content.trim() ? (
                    <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
                  ) : (
                    <p className={styles.previewEmpty}>Пока пусто — напишите историю на вкладке «Написать».</p>
                  )}
                </div>
              )}
            </div>

            <footer className={styles.foot}>
              <span className={error ? styles.error : styles.saved}>
                {error || (uploading ? 'Загрузка изображения…' : status)}
              </span>
              <Button variant="accent" onClick={handleSave} disabled={!canSave}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </footer>
          </>
        )}
      </div>
    </aside>
  )
}
