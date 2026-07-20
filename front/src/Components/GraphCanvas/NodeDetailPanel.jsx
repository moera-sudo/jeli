import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { CloseIcon, UserIcon, EditIcon, ChatIcon, PlusIcon, UsersIcon } from '../../UI/icons'
import styles from './GraphCanvas.module.css'

/** Life-span line: "р. 1990", "1932–1998", or nothing when unknown. */
function lifespan(detail) {
  const b = detail.birth_year_value
  const d = detail.death_year_value
  if (b && d) return `${b}–${d}`
  if (d) return `? – ${d}`
  if (b) return detail.is_alive ? `р. ${b}` : `${b} – ?`
  return ''
}

const GENDER_LABELS = { male: 'Мужской', female: 'Женский' }

/**
 * Mini-card for the selected node. Everything is driven by server flags — we
 * never recompute permissions here: `can_edit` gates the edit/add/remove/invite
 * actions, `is_registered`/`linked_user_id` gates the invite code, `can_chat`
 * gates the (still disabled) chat button.
 *
 * @param {object} props
 * @param {object|null} props.detail   PersonDetail, or null while loading.
 * @param {boolean} props.loading
 * @param {object}  props.callbacks    { onAddRelative(type), onEdit, onRemove, onInvite, onClose }.
 */
export default function NodeDetailPanel({ detail, loading, callbacks }) {
  const { onAddRelative, onEdit, onRemove, onInvite, onClose } = callbacks

  return (
    <aside className={styles.detail} role="dialog" aria-label="Карточка родственника">
      <button type="button" className={styles.detailClose} aria-label="Закрыть" onClick={onClose}>
        <CloseIcon />
      </button>

      {loading || !detail ? (
        <Loader />
      ) : (
        <>
          <div className={styles.detailHead}>
            <span className={styles.detailAvatar} aria-hidden="true">
              {detail.avatar_url ? <img src={detail.avatar_url} alt="" /> : <UserIcon />}
            </span>
            <div className={styles.detailIdentity}>
              <p className={styles.detailName}>{detail.full_name}</p>
              {detail.relation_to_viewer && (
                <p className={styles.detailRelation}>{detail.relation_to_viewer}</p>
              )}
            </div>
          </div>

          <dl className={styles.detailMeta}>
            {GENDER_LABELS[detail.gender] && (
              <div><dt>Пол</dt><dd>{GENDER_LABELS[detail.gender]}</dd></div>
            )}
            {lifespan(detail) && (
              <div><dt>Годы</dt><dd>{lifespan(detail)}</dd></div>
            )}
            {(detail.birth_city || detail.birth_country || detail.birth_region) && (
              <div>
                <dt>Место рождения</dt>
                <dd>{[detail.birth_region, detail.birth_country].filter(Boolean).join(', ') || '—'}</dd>
              </div>
            )}
          </dl>

          {/* Chat — only when the server says so (currently always disabled). */}
          {detail.can_chat && (
            <Button variant="primary" size="sm" fullWidth trailingIcon={<ChatIcon />} disabled title="Мессенджер скоро появится">
              Написать
            </Button>
          )}

          {/* Owner / editor actions. */}
          {detail.can_edit && (
            <>
              <div className={styles.detailAddGroup}>
                <span className={styles.detailGroupLabel}>Добавить родственника</span>
                <div className={styles.detailAddButtons}>
                  <button type="button" className={styles.chip} onClick={() => onAddRelative('parent')}>
                    <PlusIcon /> Родитель
                  </button>
                  <button type="button" className={styles.chip} onClick={() => onAddRelative('child')}>
                    <PlusIcon /> Ребёнок
                  </button>
                  <button type="button" className={styles.chip} onClick={() => onAddRelative('spouse')}>
                    <PlusIcon /> Супруг(а)
                  </button>
                </div>
              </div>

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
        </>
      )}
    </aside>
  )
}
