import { useEffect, useState } from 'react'

import TextField from '../../UI/TextField/TextField'
import NameFields from '../NameFields/NameFields'
import Button from '../../UI/Button/Button'
import { CameraIcon } from '../../UI/icons'
import { splitFullName, joinFullName } from '../../utils/fullName'
// * Shared profile visuals — same stylesheet as the read-only Profile page,
// * so the editable form looks exactly like the profile itself.
import styles from '../../Pages/Profile/Profile.module.css'

/** Info-card field groups — mirror the read-only profile cards. */
const GENERAL_FIELDS = [
  { name: 'birth_date', label: 'Дата рождения', type: 'date' },
  { name: 'birth_country', label: 'Страна рождения', placeholder: 'Казахстан' },
  { name: 'birth_city', label: 'Город рождения', placeholder: 'Ваш город' },
  { name: 'current_country', label: 'Страна проживания', placeholder: 'Казахстан' },
  { name: 'current_city', label: 'Город проживания', placeholder: 'Ваш город' },
]

// * Национальность lives with the origin fields (see requirement).
const ORIGIN_FIELDS = [
  { name: 'nationality', label: 'Национальность', placeholder: 'Казах' },
  { name: 'zhuz', label: 'Жүз', placeholder: 'Старший' },
  { name: 'tribe', label: 'Тайпа (племя)', placeholder: 'Аргын' },
  { name: 'ru', label: 'Ру (род)', placeholder: 'Куандык' },
]

const FIELD_NAMES = [...GENERAL_FIELDS, ...ORIGIN_FIELDS].map((f) => f.name).concat('description')

/**
 * Initial string state (null/undefined → '') from a user object.
 * The single `full_name` is split into CIS parts (surname/first/middle) for
 * editing.
 */
function toFormState(source) {
  const base = FIELD_NAMES.reduce((acc, key) => {
    acc[key] = source?.[key] ?? ''
    return acc
  }, {})
  return { ...base, ...splitFullName(source?.full_name) }
}

/**
 * Keeps only non-empty (trimmed) fields for the request.
 * The three name parts are recombined into a single `full_name` string.
 * `avatar_url` is intentionally omitted — the avatar is a file upload that the
 * backend does not accept yet (layout only).
 */
function buildPayload(state, includeFullName) {
  const payload = FIELD_NAMES.reduce((acc, key) => {
    const value = String(state[key] ?? '').trim()
    if (value) acc[key] = value
    return acc
  }, {})

  if (includeFullName) {
    const fullName = joinFullName(state)
    if (fullName) payload.full_name = fullName
  }

  return payload
}

/**
 * Editable profile, laid out exactly like the read-only profile.
 *
 * @param {object}   props
 * @param {object}   [props.initialValues]   UserMe to prefill; {} for onboarding.
 * @param {'create'|'edit'} props.mode        create → onboarding (no full_name edit); edit → profile.
 * @param {string[]} [props.requiredFields]  Field names that must be filled before submit.
 * @param {string}   props.submitLabel
 * @param {(payload: object) => Promise<void>} props.onSubmit
 * @param {() => void} [props.onCancel]       Optional cancel handler (edit mode).
 */
export default function ProfileEditor({
  initialValues = {},
  mode,
  requiredFields = [],
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const isEdit = mode === 'edit'
  const [values, setValues] = useState(() => toFormState(initialValues))
  const [avatarPreview, setAvatarPreview] = useState(isEdit ? initialValues.avatar_url : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const requiredSet = new Set(requiredFields)
  const isComplete = requiredFields.every((name) => String(values[name] ?? '').trim())

  const setField = (name) => (event) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }))

  const handleNameChange = (field, value) =>
    setValues((prev) => ({ ...prev, [field]: value }))

  // Local-only preview; the file is not uploaded (backend not ready).
  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (file) setAvatarPreview(URL.createObjectURL(file))
  }

  // Revoke the object URL created for the preview on unmount/replace.
  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(buildPayload(values, isEdit))
    } catch (err) {
      setError(err.message || 'Не удалось сохранить профиль')
      setSubmitting(false)
    }
  }

  const renderField = ({ name, label, type, placeholder }) => (
    <TextField
      key={name}
      label={label}
      name={name}
      type={type}
      placeholder={placeholder}
      required={requiredSet.has(name)}
      value={values[name]}
      onChange={setField(name)}
    />
  )

  return (
    <form className={styles.grid} onSubmit={handleSubmit} noValidate>
      {/* ---------------------------------------------------- identity column */}
      <section className={[styles.card, styles.identity].join(' ')}>
        <label className={styles.avatarUpload}>
          <input
            type="file"
            accept="image/*"
            className={styles.avatarInput}
            onChange={handleAvatarChange}
          />
          {avatarPreview ? (
            <img className={styles.avatar} src={avatarPreview} alt="Загруженный аватар" />
          ) : (
            <span className={styles.avatarPlaceholder} aria-hidden="true">
              <CameraIcon />
            </span>
          )}
          <span className={styles.avatarBadge} aria-hidden="true">
            <CameraIcon />
          </span>
        </label>

        <h1 className={styles.name}>
          {isEdit ? joinFullName(values) || 'Ваше имя' : initialValues.full_name}
        </h1>

        {error && <p className={styles.formError} role="alert">{error}</p>}

        <div className={styles.identityActions}>
          <Button type="submit" variant="accent" size="sm" fullWidth disabled={submitting || !isComplete}>
            {submitting ? 'Сохранение…' : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="primary" size="sm" fullWidth onClick={onCancel}>
              Отмена
            </Button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- info column */}
      <div className={styles.info}>
        {isEdit && (
          <section className={styles.card}>
            <header className={styles.cardHead}>
              <h2 className={styles.cardTitle}>ФИО</h2>
            </header>
            <NameFields values={values} onChange={handleNameChange} layout="grid" />
          </section>
        )}

        <section className={styles.card}>
          <header className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Общая информация</h2>
          </header>
          <div className={styles.fields}>{GENERAL_FIELDS.map(renderField)}</div>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Происхождение</h2>
          </header>
          <div className={styles.fields}>{ORIGIN_FIELDS.map(renderField)}</div>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHead}>
            <h2 className={styles.cardTitle}>О себе</h2>
          </header>
          <TextField
            label="О себе"
            name="description"
            multiline
            rows={4}
            placeholder="Коротко расскажите о себе и своём роде…"
            value={values.description}
            onChange={setField('description')}
          />
        </section>
      </div>
    </form>
  )
}
