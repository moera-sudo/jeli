import { useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

// * Roles offered to the user. Each maps onto a backend relation + gender in
// * GraphCanvas.submitAdd — the modal itself only collects the choice.
const ROLES = [
  { value: 'father', label: 'Отец' },
  { value: 'mother', label: 'Мать' },
  { value: 'grandfather', label: 'Дедушка' },
  { value: 'grandmother', label: 'Бабушка' },
  { value: 'brother', label: 'Брат' },
  { value: 'sister', label: 'Сестра' },
  { value: 'uncle', label: 'Дядя' },
  { value: 'aunt', label: 'Тётя' },
  { value: 'spouse', label: 'Супруг(а)' },
  { value: 'son', label: 'Сын' },
  { value: 'daughter', label: 'Дочь' },
  { value: 'grandson', label: 'Внук' },
  { value: 'granddaughter', label: 'Внучка' },
  { value: 'nephew', label: 'Племянник' },
  { value: 'niece', label: 'Племянница' },
]

/**
 * Right-click modal: add a new family member relative to the clicked node.
 * A role selector (father/mother/spouse/son/daughter/brother/sister) plus the
 * fields the backend needs to create a Person (last/first name required,
 * patronymic + birth year optional). Gender is derived from the role by the
 * caller, so it is not asked here.
 *
 * @param {object} props
 * @param {string} props.targetName                        Display name of the clicked node.
 * @param {(payload: { role: string, values: object }) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function AddMemberModal({ targetName, onSubmit, onClose }) {
  const [role, setRole] = useState('')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [isAlive, setIsAlive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canSubmit =
    role && lastName.trim().length > 0 && firstName.trim().length > 0 && !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const values = {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        is_alive: isAlive,
      }
      const patro = patronymic.trim()
      if (patro) values.patronymic = patro
      const year = birthYear.trim()
      if (year) {
        values.birth_year_value = Number(year)
        values.birth_year_precision = 'exact'
      }
      await onSubmit({ role, values })
    } catch (err) {
      setError(err.message || 'Не удалось добавить родственника')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label="Добавить родственника" onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Добавить родственника</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form className={styles.modalForm} onSubmit={handleSubmit} noValidate>
          <div className={styles.formLabel}>
            <span>Кем приходится «{targetName}» *</span>
            <div className={styles.roleGrid} role="radiogroup" aria-label="Роль родственника">
              {ROLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={role === value}
                  className={[styles.roleOpt, role === value ? styles.roleOptActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setRole(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.formLabel}>
            Фамилия *
            <input
              className={styles.formInput}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Серіков"
              autoFocus
            />
          </label>

          <label className={styles.formLabel}>
            Имя *
            <input
              className={styles.formInput}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Бекнұр"
            />
          </label>

          <label className={styles.formLabel}>
            Отчество
            <input
              className={styles.formInput}
              value={patronymic}
              onChange={(e) => setPatronymic(e.target.value)}
              placeholder="Асанұлы"
            />
          </label>

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
              {submitting ? 'Сохранение…' : 'Добавить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
