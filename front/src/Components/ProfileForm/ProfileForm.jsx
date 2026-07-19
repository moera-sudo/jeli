import { useState } from 'react'

import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { UserIcon } from '../../UI/icons'
import styles from './ProfileForm.module.css'

/**
 * Profile fields shared by the create (onboarding) and edit flows.
 * `full_name` is handled separately because it is only editable via
 * `users/profile/edit` (not `users/create`).
 */
const TEXT_FIELDS = [
  { name: 'avatar_url', label: 'Ссылка на аватар', type: 'url', placeholder: 'https://…' },
  { name: 'birth_date', label: 'Дата рождения', type: 'date' },
  { name: 'birth_country', label: 'Страна рождения', placeholder: 'Казахстан' },
  { name: 'birth_city', label: 'Город рождения', placeholder: 'Алматы' },
  { name: 'current_country', label: 'Страна проживания', placeholder: 'Казахстан' },
  { name: 'current_city', label: 'Город проживания', placeholder: 'Алматы' },
  { name: 'nationality', label: 'Национальность', placeholder: 'Казах' },
  { name: 'zhuz', label: 'Жүз', placeholder: 'Старший' },
  { name: 'ru', label: 'Ру (род)', placeholder: 'Ботбай' },
  { name: 'tribe', label: 'Тайпа (племя)', placeholder: 'Дулат' },
]

const EDITABLE_KEYS = TEXT_FIELDS.map((f) => f.name).concat('description', 'full_name')

/** Builds initial string state (null/undefined → '') from a user object. */
function toFormState(source) {
  return EDITABLE_KEYS.reduce((acc, key) => {
    acc[key] = source?.[key] ?? ''
    return acc
  }, {})
}

/** Keeps only non-empty (trimmed) fields — what actually gets sent to the API. */
function buildPayload(state, includeFullName) {
  const keys = includeFullName ? EDITABLE_KEYS : EDITABLE_KEYS.filter((k) => k !== 'full_name')
  return keys.reduce((acc, key) => {
    const value = typeof state[key] === 'string' ? state[key].trim() : state[key]
    if (value) acc[key] = value
    return acc
  }, {})
}

/**
 * Controlled profile form.
 *
 * @param {object}   props
 * @param {object}   [props.initialValues]     UserMe object to prefill; {} for onboarding.
 * @param {boolean}  [props.includeFullName]   Show/allow editing the full name.
 * @param {string[]} [props.requiredFields]    Field names that must be filled before submit.
 * @param {string}   props.submitLabel         Submit button text.
 * @param {(payload: object) => Promise<void>} props.onSubmit  Persists the payload.
 * @param {() => void} [props.onCancel]         Optional cancel handler (edit mode).
 */
export default function ProfileForm({
  initialValues = {},
  includeFullName = false,
  requiredFields = [],
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(() => toFormState(initialValues))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const requiredSet = new Set(requiredFields)
  // Submit is enabled only once every required field has a non-empty value.
  const isComplete = requiredFields.every((name) => String(values[name] ?? '').trim())

  const setField = (name) => (event) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(buildPayload(values, includeFullName))
    } catch (err) {
      setError(err.message || 'Не удалось сохранить профиль')
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {includeFullName && (
        <TextField
          label="ФИО"
          name="full_name"
          placeholder="Бекнұр Асанұлы Серіков"
          icon={<UserIcon />}
          required={requiredSet.has('full_name')}
          value={values.full_name}
          onChange={setField('full_name')}
        />
      )}

      <div className={styles.grid}>
        {TEXT_FIELDS.map(({ name, label, type, placeholder }) => (
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
        ))}
      </div>

      <TextField
        label="О себе"
        name="description"
        multiline
        rows={4}
        placeholder="Коротко расскажите о себе и своём роде…"
        required={requiredSet.has('description')}
        value={values.description}
        onChange={setField('description')}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="primary" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button type="submit" variant="accent" fullWidth={!onCancel} disabled={submitting || !isComplete}>
          {submitting ? 'Сохранение…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
