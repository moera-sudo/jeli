import { useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

const GENDER_OPTIONS = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
]

/**
 * Click-a-descent-line modal (owner only). Two tabs:
 *  - «Вставить» — insert a new person between a parent and this child (fixes a
 *    skipped generation) → `POST /persons/insert-between`.
 *  - «Удалить» — remove a mistaken parent link → `DELETE /relationships/{id}`.
 *
 * @param {object} props
 * @param {string} props.childName
 * @param {Array<{ parentId: string, relId: string, parentName: string }>} props.links
 * @param {(payload: { values: object, parentId: string }) => Promise<void>} props.onInsert
 * @param {(relId: string) => Promise<void>} props.onDeleteLink
 * @param {() => void} props.onClose
 */
export default function RelationshipEdgeModal({ childName, links = [], onInsert, onDeleteLink, onClose }) {
  const [tab, setTab] = useState('insert') // 'insert' | 'delete'
  const [parentId, setParentId] = useState(links[0]?.parentId ?? '')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [gender, setGender] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [isAlive, setIsAlive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canInsert =
    parentId && lastName.trim() && firstName.trim() && (gender === 'male' || gender === 'female') && !busy

  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Не удалось выполнить')
      setBusy(false)
    }
  }

  const handleInsert = (event) => {
    event.preventDefault()
    if (!canInsert) return
    const values = { last_name: lastName.trim(), first_name: firstName.trim(), gender, is_alive: isAlive }
    const patro = patronymic.trim()
    if (patro) values.patronymic = patro
    const year = birthYear.trim()
    if (year) {
      values.birth_year_value = Number(year)
      values.birth_year_precision = 'exact'
    }
    run(() => onInsert({ values, parentId }))
  }

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label="Связь" onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Связь: {childName}</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className={styles.addTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'insert'}
            className={[styles.addTab, tab === 'insert' ? styles.addTabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab('insert')}
          >
            Вставить
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'delete'}
            className={[styles.addTab, tab === 'delete' ? styles.addTabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab('delete')}
          >
            Удалить
          </button>
        </div>

        {tab === 'insert' ? (
          <form className={styles.modalForm} onSubmit={handleInsert} noValidate>
            <p className={styles.modalText}>
              Новый человек встанет между «{childName}» и выбранным родителем — для пропущенного поколения.
            </p>

            {links.length > 1 && (
              <div className={styles.formLabel}>
                <span>Между родителем *</span>
                <div className={styles.roleGrid} role="radiogroup" aria-label="Родитель">
                  {links.map((l) => (
                    <button
                      key={l.parentId}
                      type="button"
                      role="radio"
                      aria-checked={parentId === l.parentId}
                      className={[styles.roleOpt, parentId === l.parentId ? styles.roleOptActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setParentId(l.parentId)}
                    >
                      {l.parentName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className={styles.formLabel}>
              Фамилия *
              <input className={styles.formInput} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Серіков" autoFocus />
            </label>
            <label className={styles.formLabel}>
              Имя *
              <input className={styles.formInput} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Бекнұр" />
            </label>
            <label className={styles.formLabel}>
              Отчество
              <input className={styles.formInput} value={patronymic} onChange={(e) => setPatronymic(e.target.value)} placeholder="Асанұлы" />
            </label>

            <div className={styles.formLabel}>
              <span>Пол *</span>
              <div className={styles.genderRow} role="radiogroup" aria-label="Пол">
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={gender === value}
                    className={[styles.genderOpt, gender === value ? styles.genderOptActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setGender(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className={styles.formLabel}>
              Год рождения
              <input className={styles.formInput} type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="напр. 1965" />
            </label>

            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={isAlive} onChange={(e) => setIsAlive(e.target.checked)} />
              <span>Жив(а)</span>
            </label>

            {error && <p className={styles.formError} role="alert">{error}</p>}

            <div className={styles.modalActions}>
              <Button type="button" variant="primary" size="sm" onClick={onClose}>Отмена</Button>
              <Button type="submit" variant="accent" size="sm" disabled={!canInsert}>
                {busy ? 'Сохранение…' : 'Вставить'}
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.modalForm}>
            <p className={styles.modalText}>Удалить ошибочную связь «{childName}» с родителем. Карточки людей останутся.</p>
            <div className={styles.linkList}>
              {links.map((l) => (
                <div key={l.relId} className={styles.linkRow}>
                  <span>{l.parentName}</span>
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => onDeleteLink(l.relId))}>
                    Удалить связь
                  </Button>
                </div>
              ))}
            </div>
            {error && <p className={styles.formError} role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
