import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import TopBar from '../Components/TopBar/TopBar'
import ProfileForm from '../Components/ProfileForm/ProfileForm'
import Button from '../UI/Button/Button'
import Loader from '../UI/Loader/Loader'
import {
  EditIcon,
  MailIcon,
  ChatIcon,
  CalendarIcon,
  LocationIcon,
  GlobeIcon,
  UsersIcon,
} from '../UI/icons'
import { getMyProfile, updateProfile } from '../api/profileService'
import { useAuth } from '../auth/AuthContext'
import { ROUTES } from '../Routes/routes'
import { formatDate, displayValue } from '../utils/format'
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
function Card({ title, onEdit, children, className }) {
  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {title && (
        <header className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {onEdit && (
            <button type="button" className={styles.editBtn} aria-label="Редактировать" onClick={onEdit}>
              <EditIcon />
            </button>
          )}
        </header>
      )}
      {children}
    </section>
  )
}

/** Builds the origin subtitle (e.g. "Старший жүз · Дулат · Ботбай"). */
function originLine(user) {
  return [user.zhuz && `${user.zhuz} жүз`, user.tribe, user.ru].filter(Boolean).join(' · ')
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuth()

  const [editing, setEditing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')

  // Always refresh from the server when opening the profile.
  useEffect(() => {
    let active = true
    getMyProfile()
      .then((me) => active && setUser(me))
      .catch((err) => active && setLoadError(err.message || 'Не удалось загрузить профиль'))
    return () => {
      active = false
    }
    // setUser is stable (useCallback); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!user) return <Loader />

  const handleSave = async (payload) => {
    const updated = await updateProfile(payload)
    setUser(updated)
    setEditing(false)
  }

  const handleDelete = () => {
    // No backend endpoint yet — surface an honest notice instead of failing.
    setDeleteNotice('Удаление аккаунта пока недоступно.')
  }

  const origin = originLine(user)

  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        {loadError && <p className={styles.loadError} role="alert">{loadError}</p>}

        <div className={styles.grid}>
          {/* ---------------------------------------------------- profile column */}
          <Card className={styles.identity}>
            <div className={styles.avatarWrap}>
              <img className={styles.avatar} src={user.avatar_url} alt="Аватар пользователя" />
            </div>

            <h1 className={styles.name}>{user.full_name}</h1>
            {origin && <p className={styles.handle}>{origin}</p>}

            <div className={styles.contacts}>
              <a className={styles.contact} href={`mailto:${user.email}`}>
                <MailIcon /> {user.email}
              </a>
            </div>

            <div className={styles.identityActions}>
              {!editing && (
                <Button variant="accent" fullWidth trailingIcon={<EditIcon />} onClick={() => setEditing(true)}>
                  Редактировать профиль
                </Button>
              )}
              <Button variant="primary" fullWidth trailingIcon={<ChatIcon />}>
                Открыть чат рода
              </Button>
            </div>
          </Card>

          {/* ------------------------------------------------------- info column */}
          <div className={styles.info}>
            {editing ? (
              <Card title="Редактирование профиля">
                <ProfileForm
                  initialValues={user}
                  includeFullName
                  submitLabel="Сохранить изменения"
                  onSubmit={handleSave}
                  onCancel={() => setEditing(false)}
                />
              </Card>
            ) : (
              <>
                <Card title="Общая информация" onEdit={() => setEditing(true)}>
                  <div className={styles.rows}>
                    <InfoRow icon={<CalendarIcon />} label="Дата рождения" value={formatDate(user.birth_date)} />
                    <InfoRow
                      icon={<LocationIcon />}
                      label="Место рождения"
                      value={displayValue([user.birth_city, user.birth_country].filter(Boolean).join(', '))}
                    />
                    <InfoRow icon={<LocationIcon />} label="Город" value={displayValue(user.current_city)} />
                    <InfoRow icon={<GlobeIcon />} label="Страна" value={displayValue(user.current_country)} />
                    <InfoRow icon={<GlobeIcon />} label="Национальность" value={displayValue(user.nationality)} />
                  </div>
                </Card>

                <Card title="Происхождение" onEdit={() => setEditing(true)}>
                  <div className={styles.rows}>
                    <InfoRow icon={<UsersIcon />} label="Жүз" value={displayValue(user.zhuz)} />
                    <InfoRow icon={<UsersIcon />} label="Тайпа (племя)" value={displayValue(user.tribe)} />
                    <InfoRow icon={<UsersIcon />} label="Ру (род)" value={displayValue(user.ru)} />
                  </div>
                </Card>

                <Card title="О себе" onEdit={() => setEditing(true)}>
                  <p className={styles.about}>{displayValue(user.description, 'Пока ничего не рассказано.')}</p>
                </Card>

                <Card title="Аккаунт">
                  <div className={styles.rows}>
                    <InfoRow icon={<MailIcon />} label="Эл. почта" value={user.email} />
                  </div>
                  <div className={styles.accountActions}>
                    <Button variant="primary" onClick={() => { logout(); navigate(ROUTES.login, { replace: true }) }}>
                      Выйти
                    </Button>
                    <button type="button" className={styles.dangerBtn} onClick={handleDelete}>
                      Удалить аккаунт
                    </button>
                  </div>
                  {deleteNotice && <p className={styles.notice} role="alert">{deleteNotice}</p>}
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
