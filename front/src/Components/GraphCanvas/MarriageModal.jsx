import { useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

const END_OPTIONS = [
  { value: '', label: 'В браке' },
  { value: 'divorce', label: 'Развод' },
  { value: 'widowed', label: 'Вдовство' },
]

/**
 * Click-a-union modal (owner only): edit a marriage's year and end reason, or
 * remove the marriage link entirely. The light graph doesn't carry the current
 * year, so fields start empty — saving overwrites.
 *
 * @param {object} props
 * @param {(values: { marriage_year?: number, marriage_end_reason: string|null }) => Promise<void>} props.onSave
 * @param {() => Promise<void>} props.onDelete
 * @param {() => void} props.onClose
 */
export default function MarriageModal({ onSave, onDelete, onClose }) {
  const [year, setYear] = useState('')
  const [endReason, setEndReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
      setBusy(false)
    }
  }

  const handleSave = (event) => {
    event.preventDefault()
    const values = { marriage_end_reason: endReason || null }
    const y = year.trim()
    if (y) values.marriage_year = Number(y)
    run(() => onSave(values))
  }

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label="Брак" onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Брак</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form className={styles.modalForm} onSubmit={handleSave} noValidate>
          <label className={styles.formLabel}>
            Год заключения брака
            <input
              className={styles.formInput}
              type="number"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="напр. 1998"
              autoFocus
            />
          </label>

          <div className={styles.formLabel}>
            <span>Статус</span>
            <div className={styles.roleGrid} role="radiogroup" aria-label="Статус брака">
              {END_OPTIONS.map(({ value, label }) => (
                <button
                  key={value || 'active'}
                  type="button"
                  role="radio"
                  aria-checked={endReason === value}
                  className={[styles.roleOpt, endReason === value ? styles.roleOptActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setEndReason(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className={styles.formError} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => run(onDelete)}>
              Удалить связь
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
