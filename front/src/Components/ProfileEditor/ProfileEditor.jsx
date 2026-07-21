import { useEffect, useState } from 'react'

import TextField from '../../UI/TextField/TextField'
import NameFields from '../NameFields/NameFields'
import Button from '../../UI/Button/Button'
import { CameraIcon } from '../../UI/icons'
import { joinFullName, formatPersonName } from '../../utils/fullName'
import { uploadProfileAvatar, resolveMediaUrl } from '../../api/mediaService'
import { getMyPerson, updatePerson, suggestRuTaxonomy } from '../../api/graphService'
import styles from '../../Pages/Profile/Profile.module.css'

const GENERAL_FIELDS = [
  { name: 'birth_date', label: 'Дата рождения', type: 'date' },
  { name: 'birth_country', label: 'Страна рождения', placeholder: 'Казахстан' },
  { name: 'birth_city', label: 'Город рождения', placeholder: 'Ваш город' },
  { name: 'current_country', label: 'Страна проживания', placeholder: 'Казахстан' },
  { name: 'current_city', label: 'Город проживания', placeholder: 'Ваш город' },
]
const ORIGIN_FIELDS = [
  { name: 'nationality', label: 'Национальность', placeholder: 'Казах' },
  { name: 'zhuz', label: 'Жүз', placeholder: 'Старший' },
  { name: 'tribe', label: 'Тайпа (племя)', placeholder: 'Аргын' },
  { name: 'ru', label: 'Ру (род)', placeholder: 'Куандык' },
]

const FIELD_NAMES = [...GENERAL_FIELDS, ...ORIGIN_FIELDS].map((f) => f.name).concat('description', 'gender')

const GENDER_OPTIONS = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
]

function toFormState(source) {
  const base = FIELD_NAMES.reduce((acc, key) => {
    acc[key] = source?.[key] ?? ''
    return acc
  }, {})
  return {
    ...base,
    surname: source?.last_name ?? '',
    firstName: source?.first_name ?? '',
    middleName: source?.patronymic ?? '',
  }
}

function buildPayload(state, includeName) {
  const payload = FIELD_NAMES.reduce((acc, key) => {
    const value = String(state[key] ?? '').trim()
    if (value) acc[key] = value
    return acc
  }, {})

  if (includeName) {
    const surname = String(state.surname ?? '').trim()
    const firstName = String(state.firstName ?? '').trim()
    const middleName = String(state.middleName ?? '').trim()
    if (surname) payload.last_name = surname
    if (firstName) payload.first_name = firstName
    payload.patronymic = middleName || null
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
 * @param {(user: object) => void} [props.onAvatarChange]  Called with the updated UserMe after an avatar upload.
 */
export default function ProfileEditor({
  initialValues = {},
  mode,
  requiredFields = [],
  submitLabel,
  onSubmit,
  onCancel,
  onAvatarChange,
}) {
  const isEdit = mode === 'edit'
  const [values, setValues] = useState(() => toFormState(initialValues))
  const [avatarPreview, setAvatarPreview] = useState(isEdit ? initialValues.avatar_url : '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const requiredSet = new Set(requiredFields)
  const isComplete = requiredFields.every((name) => String(values[name] ?? '').trim())

  const setField = (name) => (event) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }))

  const setGender = (value) => setValues((prev) => ({ ...prev, gender: value }))

  const handleNameChange = (field, value) =>
    setValues((prev) => ({ ...prev, [field]: value }))

  // Instant local preview, then upload and persist the avatar server-side.
  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setError('')
    setAvatarUploading(true)
    try {
      const updated = await uploadProfileAvatar(file)
      setAvatarPreview(updated.avatar_url)
      onAvatarChange?.(updated)
      // The profile endpoint only sets the user's avatar_url, not the avatar on
      // their own graph node (a separate field the tree renders). Mirror the same
      // media URL onto that node so the face shows up in the graph too. Best-effort:
      // the profile avatar is already saved even if this node sync fails.
      try {
        const me = await getMyPerson()
        if (me?.id) await updatePerson(me.id, { avatar_url: updated.avatar_url })
      } catch { /* user may not have a tree node yet, or lack edit rights */ }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить аватар')
    } finally {
      setAvatarUploading(false)
    }
  }

  // Revoke the object URL created for the preview on unmount/replace.
  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  // Suggest тайпа/жуз from ру via the backend glossary. Fills ONLY empty fields,
  // so it never overwrites what the user typed; re-runs (debounced) when ру changes.
  useEffect(() => {
    const ru = String(values.ru ?? '').trim()
    if (!ru) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const { tribe, zhuz } = await suggestRuTaxonomy(ru)
        if (!active) return
        setValues((prev) => {
          const next = { ...prev }
          if (tribe && !String(prev.tribe ?? '').trim()) next.tribe = tribe
          if (zhuz && !String(prev.zhuz ?? '').trim()) next.zhuz = zhuz
          return next
        })
      } catch { /* suggestion is best-effort — silent on failure */ }
    }, 400)
    return () => { active = false; clearTimeout(timer) }
  }, [values.ru])

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
            <img className={styles.avatar} src={resolveMediaUrl(avatarPreview)} alt="Загруженный аватар" style={avatarUploading ? { opacity: 0.6 } : undefined} />
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
          {isEdit ? joinFullName(values) || 'Ваше имя' : formatPersonName(initialValues, 'Ваше имя')}
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

          <div className={styles.genderField}>
            <span className={styles.genderLabel}>
              Пол
              {requiredSet.has('gender') && <span className={styles.requiredMark} aria-hidden="true"> *</span>}
            </span>
            <div className={styles.genderOptions} role="radiogroup" aria-label="Пол">
              {GENDER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={values.gender === value}
                  className={[styles.genderOption, values.gender === value ? styles.genderOptionActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setGender(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

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
