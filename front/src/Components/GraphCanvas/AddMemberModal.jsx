import { useMemo, useState } from 'react'

import Button from '../../UI/Button/Button'
import { CloseIcon, UserIcon } from '../../UI/icons'
import { formatPersonName } from '../../utils/fullName'
import { resolveMediaUrl } from '../../api/mediaService'
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
 * Right-click modal: add a family member relative to the clicked node. A shared
 * role selector, then two tabs:
 *  - «Создать» — make a brand-new card (last/first name required).
 *  - «Выбрать» — link a person that already exists in the tree into that role
 *    (e.g. give a sibling the same father, instead of a duplicate). Spouses can
 *    only be created / linked by invite code, so «Выбрать» is disabled for them.
 *
 * @param {object} props
 * @param {string} props.targetName                       Display name of the clicked node.
 * @param {Array}  props.people                           Other people in the graph (pick list).
 * @param {(payload: { mode: 'create'|'select', role: string, values?: object, personId?: string }) => Promise<void>} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function AddMemberModal({ targetName, people = [], onSubmit, onClose }) {
  const [role, setRole] = useState('')
  const [tab, setTab] = useState('create') // 'create' | 'select'

  // Create-tab fields.
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [isAlive, setIsAlive] = useState(true)
  const [deathYear, setDeathYear] = useState('')

  // Select-tab state.
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const spouseSelected = role === 'spouse'
  const selectDisabled = spouseSelected // spouse links aren't creatable between existing nodes

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const named = people.map((p) => ({ p, name: formatPersonName(p, 'Без имени') }))
    return q ? named.filter(({ name }) => name.toLowerCase().includes(q)) : named
  }, [people, query])

  const canSubmit =
    !!role &&
    !submitting &&
    (tab === 'create'
      ? lastName.trim().length > 0 && firstName.trim().length > 0
      : !!pickedId && !selectDisabled)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      if (tab === 'create') {
        const values = { last_name: lastName.trim(), first_name: firstName.trim(), is_alive: isAlive }
        const patro = patronymic.trim()
        if (patro) values.patronymic = patro
        const year = birthYear.trim()
        if (year) {
          values.birth_year_value = Number(year)
          values.birth_year_precision = 'exact'
        }
        const dyear = deathYear.trim()
        if (!isAlive && dyear) {
          values.death_year_value = Number(dyear)
          values.death_year_precision = 'exact'
        }
        await onSubmit({ mode: 'create', role, values })
      } else {
        await onSubmit({ mode: 'select', role, personId: pickedId })
      }
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

          <div className={styles.addTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'create'}
              className={[styles.addTab, tab === 'create' ? styles.addTabActive : ''].filter(Boolean).join(' ')}
              onClick={() => setTab('create')}
            >
              Создать
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'select'}
              className={[styles.addTab, tab === 'select' ? styles.addTabActive : ''].filter(Boolean).join(' ')}
              onClick={() => setTab('select')}
            >
              Выбрать
            </button>
          </div>

          {tab === 'create' ? (
            <>
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
              <label className={styles.formLabel}>
                Год рождения
                <input className={styles.formInput} type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="напр. 1965" />
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={isAlive} onChange={(e) => setIsAlive(e.target.checked)} />
                <span>Жив(а)</span>
              </label>
              {!isAlive && (
                <label className={styles.formLabel}>
                  Год смерти
                  <input className={styles.formInput} type="number" inputMode="numeric" value={deathYear} onChange={(e) => setDeathYear(e.target.value)} placeholder="напр. 1998" />
                </label>
              )}
            </>
          ) : selectDisabled ? (
            <p className={styles.modalText}>
              Супруга нельзя выбрать из существующих карточек — создайте новую карточку или свяжите семьи по коду приглашения.
            </p>
          ) : (
            <>
              <input
                className={styles.formInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по имени…"
                aria-label="Поиск родственника"
              />
              <div className={styles.selectScroll}>
                {filtered.length === 0 ? (
                  <p className={styles.modalText}>Никого не найдено.</p>
                ) : (
                  <ul className={styles.pickerList}>
                    {filtered.map(({ p, name }) => (
                      <li key={p.id}>
                        <label className={styles.pickerItem}>
                          <input type="radio" name="existing-person" checked={pickedId === p.id} onChange={() => setPickedId(p.id)} />
                          {p.avatar_url ? (
                            <img src={resolveMediaUrl(p.avatar_url)} alt="" className={styles.pickerAvatar} />
                          ) : (
                            <span className={styles.pickerIcon} aria-hidden="true"><UserIcon /></span>
                          )}
                          <span>{name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {error && <p className={styles.formError} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button type="button" variant="primary" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!canSubmit}>
              {submitting ? 'Сохранение…' : tab === 'create' ? 'Добавить' : 'Связать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
