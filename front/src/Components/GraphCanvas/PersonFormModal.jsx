import { useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

const GENDER_OPTIONS = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
]

/**
 * Add-a-relative / edit-a-node form. Collects the fields the backend needs to
 * create or patch a Person (`full_name`, `gender` are required; birth year and
 * alive flag are optional). Presentational shell + local state only — the
 * caller performs the API call in `onSubmit` and closes on success.
 *
 * @param {object}   props
 * @param {string}   props.title
 * @param {object}   [props.initial]   Prefill { full_name, gender, birth_year_value, is_alive }.
 * @param {string}   props.submitLabel
 * @param {(values: object) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function PersonFormModal({ title, initial = {}, submitLabel, onSubmit, onClose }) {
  const [fullName, setFullName] = useState(initial.full_name ?? '')
  const [gender, setGender] = useState(initial.gender ?? '')
  const [birthYear, setBirthYear] = useState(
    initial.birth_year_value != null ? String(initial.birth_year_value) : '',
  )
  const [isAlive, setIsAlive] = useState(initial.is_alive ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = fullName.trim().length > 0 && (gender === 'male' || gender === 'female') && !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const values = { full_name: fullName.trim(), gender, is_alive: isAlive }
      const year = birthYear.trim()
      if (year) {
        values.birth_year_value = Number(year)
        values.birth_year_precision = 'exact'
      }
      await onSubmit(values)
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form className={styles.modalForm} onSubmit={handleSubmit} noValidate>
          <label className={styles.formLabel}>
            ФИО *
            <input
              className={styles.formInput}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Фамилия Имя Отчество"
              autoFocus
            />
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
            <input
              className={styles.formInput}
              type="number"
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="напр. 1965"
            />
          </label>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={isAlive} onChange={(e) => setIsAlive(e.target.checked)} />
            <span>Жив(а)</span>
          </label>

          {error && <p className={styles.formError} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button type="button" variant="primary" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!canSubmit}>
              {submitting ? 'Сохранение…' : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
