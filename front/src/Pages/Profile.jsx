import TopBar from '../Components/TopBar/TopBar'
import Button from '../UI/Button/Button'
import {
  EditIcon,
  PhoneIcon,
  MailIcon,
  ChatIcon,
  CalendarIcon,
  LocationIcon,
  GlobeIcon,
  UsersIcon,
  LockIcon,
} from '../UI/icons'
import styles from './Profile.module.css'

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

/** Card wrapper with a title and an optional edit affordance. */
function Card({ title, editable, children, className }) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {title && (
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {editable && (
            <button type="button" className={styles.editBtn} aria-label="Редактировать">
              <EditIcon />
            </button>
          )}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * User profile — layout only.
 * A profile column beside stacked information cards, matching the reference
 * mockup and the app's black / white / orange system.
 */
export default function Profile() {
  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        <div className={styles.grid}>
          {/* ---------------------------------------------------- profile column */}
          <Card className={styles.identity}>
            <div className={styles.avatarWrap}>
              <img
                className={styles.avatar}
                src="https://i.pravatar.cc/240?img=12"
                alt="Аватар пользователя"
              />
              <button type="button" className={styles.avatarEdit} aria-label="Сменить аватар">
                <EditIcon />
              </button>
            </div>

            <h1 className={styles.name}>Бекнұр Асанұлы Серіков</h1>
            <p className={styles.handle}>Старший жүз · Дулат · Ботбай</p>

            <div className={styles.contacts}>
              <a className={styles.contact} href="tel:+77010000000">
                <PhoneIcon /> +7 (701) 000-00-00
              </a>
              <a className={styles.contact} href="mailto:beknur@example.com">
                <MailIcon /> beknur@example.com
              </a>
            </div>

            <div className={styles.identityActions}>
              <Button variant="accent" fullWidth trailingIcon={<ChatIcon />}>
                Открыть чат рода
              </Button>
            </div>
          </Card>

          {/* ------------------------------------------------------- info column */}
          <div className={styles.info}>
            <Card title="Общая информация" editable>
              <div className={styles.rows}>
                <InfoRow icon={<CalendarIcon />} label="Дата рождения" value="23 июля 1994" />
                <InfoRow icon={<LocationIcon />} label="Место рождения" value="г. Алматы, Казахстан" />
                <InfoRow icon={<LocationIcon />} label="Город" value="Алматы" />
                <InfoRow icon={<GlobeIcon />} label="Страна" value="Казахстан" />
                <InfoRow icon={<GlobeIcon />} label="Национальность" value="Казах" />
              </div>
            </Card>

            <Card title="Происхождение" editable>
              <div className={styles.rows}>
                <InfoRow icon={<UsersIcon />} label="Жүз" value="Старший (Ұлы жүз)" />
                <InfoRow icon={<UsersIcon />} label="Племя (тайпа)" value="Дулат" />
                <InfoRow icon={<UsersIcon />} label="Род (ру)" value="Ботбай" />
              </div>
            </Card>

            <Card title="О себе" editable>
              <p className={styles.about}>
                Собираю родословную семьи по обеим линиям. Ищу потомков рода Ботбай
                и рад связаться с родственниками по Старшему жузу.
              </p>
            </Card>

            <Card title="Аккаунт" editable>
              <div className={styles.rows}>
                <InfoRow icon={<MailIcon />} label="Эл. почта" value="beknur@example.com" />
                <div className={styles.row}>
                  <span className={styles.rowIcon} aria-hidden="true"><LockIcon /></span>
                  <span className={styles.rowLabel}>Пароль</span>
                  <span className={styles.rowValue}>••••••••••</span>
                  <button type="button" className={styles.rowAction}>Изменить</button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
