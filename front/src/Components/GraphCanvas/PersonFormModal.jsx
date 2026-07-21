import { useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon, CameraIcon, UserIcon } from '../../UI/icons'
import { uploadPersonAvatar, resolveMediaUrl } from '../../api/mediaService'
import styles from './GraphCanvas.module.css'

const GENDER_OPTIONS = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
]

/**
 * Edit-a-node form. Collects the fields the backend needs to patch a Person
 * (`last_name` / `first_name` / `gender` are required; patronymic, birth year
 * and the alive flag are optional). Presentational shell + local state only —
 * the caller performs the API call in `onSubmit` and closes on success.
 *
 * @param {object}   props
 * @param {string}   props.title
 * @param {object}   [props.initial]   Prefill { last_name, first_name, patronymic, gender, birth_year_value, is_alive }.
 * @param {string}   props.submitLabel
 * @param {(values: object) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 * @param {string}   [props.personId]      When set, shows an avatar uploader for that node.
 * @param {() => void} [props.onAvatarChange]  Called after an avatar upload (to refresh the graph).
 */
export default function PersonFormModal({ title, initial = {}, submitLabel, onSubmit, onClose, personId, onAvatarChange }) {
  const [lastName, setLastName] = useState(initial.last_name ?? '')
  const [firstName, setFirstName] = useState(initial.first_name ?? '')
  const [patronymic, setPatronymic] = useState(initial.patronymic ?? '')
  const [gender, setGender] = useState(initial.gender ?? '')
  const [birthYear, setBirthYear] = useState(
    initial.birth_year_value != null ? String(initial.birth_year_value) : '',
  )
  const [isAlive, setIsAlive] = useState(initial.is_alive ?? true)
  const [deathYear, setDeathYear] = useState(
    initial.death_year_value != null ? String(initial.death_year_value) : '',
  )
  const [avatar, setAvatar] = useState(initial.avatar_url ?? '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !personId) return
    setAvatar(URL.createObjectURL(file))
    setError('')
    setAvatarUploading(true)
    try {
      const updated = await uploadPersonAvatar(personId, file)
      setAvatar(updated.avatar_url)
      onAvatarChange?.()
    } catch (err) {
      setError(err.message || 'Не удалось загрузить аватар')
    } finally {
      setAvatarUploading(false)
    }
  }

  const canSubmit =
    lastName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    (gender === 'male' || gender === 'female') &&
    !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const values = {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        patronymic: patronymic.trim() || null,
        gender,
        is_alive: isAlive,
      }
      const year = birthYear.trim()
      if (year) {
        values.birth_year_value = Number(year)
        values.birth_year_precision = 'exact'
      }
      // Death year only when deceased; toggling back to alive clears it.
      if (!isAlive) {
        const dyear = deathYear.trim()
        if (dyear) {
          values.death_year_value = Number(dyear)
          values.death_year_precision = 'exact'
        }
      } else {
        values.death_year_value = null
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
          {personId && (
            <label className={styles.avatarPick}>
              <input type="file" accept="image/*" hidden onChange={handleAvatarChange} />
              <span className={styles.avatarPickImg} style={avatarUploading ? { opacity: 0.6 } : undefined}>
                {avatar ? <img src={resolveMediaUrl(avatar)} alt="" /> : <UserIcon />}
              </span>
              <span className={styles.avatarPickBadge} aria-hidden="true"><CameraIcon /></span>
              <span className={styles.avatarPickHint}>{avatarUploading ? 'Загрузка…' : 'Сменить фото'}</span>
            </label>
          )}

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

          {!isAlive && (
            <label className={styles.formLabel}>
              Год смерти
              <input
                className={styles.formInput}
                type="number"
                inputMode="numeric"
                value={deathYear}
                onChange={(e) => setDeathYear(e.target.value)}
                placeholder="напр. 1998"
              />
            </label>
          )}

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
