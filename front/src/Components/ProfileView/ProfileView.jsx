import {
  CalendarIcon,
  LocationIcon,
  GlobeIcon,
  UsersIcon,
  BookIcon,
  UserIcon,
} from '../../UI/icons'
import { formatDate, displayValue } from '../../utils/format'
import { formatPersonName } from '../../utils/fullName'
import { resolveMediaUrl } from '../../api/mediaService'
import styles from '../../Pages/Profile/Profile.module.css'

const GENDER_LABELS = { male: 'Мужской', female: 'Женский' }

/** A label → value row used across the info cards. */
function InfoRow({ icon, label, value }) {
  return (
    <div className={styles.row}>
      {icon && <span className={styles.rowIcon} aria-hidden="true">{icon}</span>}
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

/** Card wrapper with a title. */
export function Card({ title, children, className }) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {title && (
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * Read-only profile layout shared by the Profile page and the family-member
 * modal: identity card (avatar · name · action) plus the info cards. Everything
 * cosmetic is configurable so the same markup serves both surfaces.
 *
 * @param {object}   props
 * @param {object}   props.person        UserMe / UserPublic (name parts + profile fields).
 * @param {React.ReactNode} [props.action]      Button rendered under the name.
 * @param {string}   [props.aboutTitle]  Title of the free-text card ("О себе" by default).
 * @param {React.ReactNode} [props.extraCards]  Extra cards appended to the info column (e.g. Account).
 * @param {string}   [props.gridClassName]  Extra class on the grid (e.g. to widen it in a modal).
 * @param {string}   [props.avatarAlt]
 */
export default function ProfileView({
  person,
  action,
  aboutTitle = 'О себе',
  extraCards,
  gridClassName,
  avatarAlt = 'Аватар',
}) {
  return (
    <div className={[styles.grid, gridClassName].filter(Boolean).join(' ')}>
      {/* ------------------------------------------------- profile column */}
      <Card className={styles.identity}>
        <div className={styles.avatarWrap}>
          <img className={styles.avatar} src={resolveMediaUrl(person.avatar_url)} alt={avatarAlt} />
        </div>

        <h1 className={styles.name}>{formatPersonName(person, '—')}</h1>

        {action && <div className={styles.identityActions}>{action}</div>}
      </Card>

      {/* ---------------------------------------------------- info column */}
      <div className={styles.info}>
        <Card title="Общая информация">
          <div className={styles.rows}>
            <InfoRow icon={<UserIcon />} label="Пол" value={displayValue(GENDER_LABELS[person.gender])} />
            <InfoRow icon={<CalendarIcon />} label="Дата рождения" value={formatDate(person.birth_date)} />
            <InfoRow
              icon={<LocationIcon />}
              label="Место рождения"
              value={displayValue([person.birth_city, person.birth_country].filter(Boolean).join(', '))}
            />
            <InfoRow icon={<LocationIcon />} label="Город" value={displayValue(person.current_city)} />
            <InfoRow icon={<GlobeIcon />} label="Страна" value={displayValue(person.current_country)} />
          </div>
        </Card>

        <Card title="Происхождение">
          <div className={styles.rows}>
            <InfoRow icon={<GlobeIcon />} label="Национальность" value={displayValue(person.nationality)} />
            <InfoRow icon={<UsersIcon />} label="Жүз" value={displayValue(person.zhuz)} />
            <InfoRow icon={<BookIcon />} label="Тайпа (племя)" value={displayValue(person.tribe)} />
            <InfoRow icon={<UserIcon />} label="Ру (род)" value={displayValue(person.ru)} />
          </div>
        </Card>

        <Card title={aboutTitle}>
          <p className={styles.about}>{displayValue(person.description, 'Пока ничего не рассказано.')}</p>
        </Card>

        {extraCards}
      </div>
    </div>
  )
}
