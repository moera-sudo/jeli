import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import {
  CloseIcon,
  UserIcon,
  EditIcon,
  UsersIcon,
  CalendarIcon,
  LocationIcon,
  GlobeIcon,
  BookIcon,
} from '../../UI/icons'
import { formatPersonName } from '../../utils/fullName'
import styles from './GraphCanvas.module.css'

const GENDER_LABELS = { male: 'Мужской', female: 'Женский' }

const DEATH_CONTEXT_LABELS = {
  natural: 'Естественная',
  war: 'Война',
  repression: 'Репрессии',
}

const PRECISION_PREFIX = { decade: '≈', generation_estimate: '≈' }

/** A single year with an approximation marker for non-exact precisions. */
function yearText(value, precision) {
  if (!value) return ''
  const prefix = precision && precision !== 'exact' ? PRECISION_PREFIX[precision] ?? '' : ''
  return `${prefix}${value}`
}

/** One label → value row, mirroring the profile page's InfoRow. */
function Row({ icon, label, value }) {
  return (
    <div className={styles.pmRow}>
      <span className={styles.pmRowIcon} aria-hidden="true">{icon}</span>
      <span className={styles.pmRowLabel}>{label}</span>
      <span className={styles.pmRowValue}>{value}</span>
    </div>
  )
}

/**
 * Left-click modal for a relative: the same design and layout as the profile
 * page (identity header + titled info cards), just smaller and in a dialog.
 * Read-only; owners (`can_edit`) also get edit / remove / invite actions.
 *
 * @param {object} props
 * @param {object|null} props.detail   PersonDetail, or null while loading.
 * @param {boolean} props.loading
 * @param {() => void} props.onClose
 * @param {() => void} props.onEdit
 * @param {() => void} props.onRemove
 * @param {() => void} props.onInvite
 */
export default function PersonProfileModal({ detail, loading, onClose, onEdit, onRemove, onInvite }) {
  const general = []
  const origin = []
  if (detail) {
    if (GENDER_LABELS[detail.gender]) {
      general.push({ icon: <UserIcon />, label: 'Пол', value: GENDER_LABELS[detail.gender] })
    }
    const birth = yearText(detail.birth_year_value, detail.birth_year_precision)
    if (birth) general.push({ icon: <CalendarIcon />, label: 'Год рождения', value: birth })
    const place = [detail.birth_region, detail.birth_country].filter(Boolean).join(', ')
    if (place) general.push({ icon: <LocationIcon />, label: 'Место рождения', value: place })
    if (!detail.is_alive) {
      const death = yearText(detail.death_year_value, detail.death_year_precision)
      if (death) general.push({ icon: <CalendarIcon />, label: 'Год смерти', value: death })
      if (DEATH_CONTEXT_LABELS[detail.death_context]) {
        general.push({ icon: <BookIcon />, label: 'Обстоятельства', value: DEATH_CONTEXT_LABELS[detail.death_context] })
      }
    }
    if (detail.zhuz) origin.push({ icon: <UsersIcon />, label: 'Жүз', value: detail.zhuz })
    if (detail.tribe) origin.push({ icon: <BookIcon />, label: 'Тайпа (племя)', value: detail.tribe })
    if (detail.ru) origin.push({ icon: <GlobeIcon />, label: 'Ру (род)', value: detail.ru })
  }

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.profileModalCard} role="dialog" aria-label="Профиль родственника" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className={styles.detailClose} aria-label="Закрыть" onClick={onClose}>
          <CloseIcon />
        </button>

        {loading || !detail ? (
          <Loader />
        ) : (
          <div className={styles.pmBody}>
            <div className={styles.pmIdentity}>
              <span className={styles.pmAvatar} aria-hidden="true">
                {detail.avatar_url ? <img src={detail.avatar_url} alt="" /> : <UserIcon />}
              </span>
              <p className={styles.pmName}>{formatPersonName(detail, 'Без имени')}</p>
              {detail.relation_to_viewer && <p className={styles.pmRelation}>{detail.relation_to_viewer}</p>}
            </div>

            {general.length > 0 && (
              <section className={styles.pmCard}>
                <h4 className={styles.pmCardTitle}>Общая информация</h4>
                <div className={styles.pmRows}>
                  {general.map((r) => <Row key={r.label} {...r} />)}
                </div>
              </section>
            )}

            {origin.length > 0 && (
              <section className={styles.pmCard}>
                <h4 className={styles.pmCardTitle}>Происхождение</h4>
                <div className={styles.pmRows}>
                  {origin.map((r) => <Row key={r.label} {...r} />)}
                </div>
              </section>
            )}

            {detail.can_edit && (
              <>
                {!detail.linked_user_id && (
                  <Button variant="primary" size="sm" fullWidth trailingIcon={<UsersIcon />} onClick={onInvite}>
                    Скопировать код приглашения
                  </Button>
                )}
                <div className={styles.detailRow}>
                  <Button variant="primary" size="sm" trailingIcon={<EditIcon />} onClick={onEdit}>
                    Изменить
                  </Button>
                  <Button variant="danger" size="sm" onClick={onRemove}>
                    Удалить
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
