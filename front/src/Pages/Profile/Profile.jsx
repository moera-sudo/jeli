import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import ProfileEditor from '../../Components/ProfileEditor/ProfileEditor'
import ProfileView, { Card } from '../../Components/ProfileView/ProfileView'
import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { EditIcon, MailIcon, CloseIcon } from '../../UI/icons'
import { getMyProfile, updateProfile, deleteAccount } from '../../api/profileService'
import { getSuccessorCandidates } from '../../api/graphService'
import { useAuth } from '../../auth/AuthContext'
import { ROUTES } from '../../Routes/Routes'
import { formatPersonName } from '../../utils/fullName'
import { resolveMediaUrl } from '../../api/mediaService'
import styles from './Profile.module.css'

/** Small centred dialog used by the account-deletion flow. */
function DeleteModal({ title, onClose, children }) {
  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** A label → value row for the account card. */
function InfoRow({ icon, label, value }) {
  return (
    <div className={styles.row}>
      {icon && <span className={styles.rowIcon} aria-hidden="true">{icon}</span>}
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuth()

  const [editing, setEditing] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Account deletion: null → confirm dialog → (if sole owner) successor picker.
  const [deleteStep, setDeleteStep] = useState(null) // null | 'confirm' | 'successor'
  const [successors, setSuccessors] = useState([])
  const [pickedSuccessor, setPickedSuccessor] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

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

  const openDelete = () => {
    setDeleteError('')
    setPickedSuccessor('')
    setDeleteStep('confirm')
  }

  // Runs the deletion. If the server needs a successor (409), switch to the
  // picker and retry with the chosen owner.
  const runDelete = async (newOwnerUserId) => {
    setDeleteError('')
    setDeleting(true)
    try {
      await deleteAccount(newOwnerUserId)
      logout()
      navigate(ROUTES.login, { replace: true })
    } catch (err) {
      if (err.status === 409 && !newOwnerUserId) {
        try {
          const candidates = await getSuccessorCandidates()
          if (candidates.length) {
            setSuccessors(candidates)
            setPickedSuccessor(candidates[0].id)
            setDeleteStep('successor')
            return
          }
        } catch { /* fall through to the generic error */ }
      }
      setDeleteError(err.message || 'Не удалось удалить аккаунт')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.page}>
      <TopBar />

      <main className={styles.main}>
        {loadError && <p className={styles.loadError} role="alert">{loadError}</p>}

        {editing ? (
          <ProfileEditor
            mode="edit"
            initialValues={user}
            submitLabel="Сохранить изменения"
            onSubmit={handleSave}
            onCancel={() => setEditing(false)}
            onAvatarChange={setUser}
          />
        ) : (
          <ProfileView
            person={user}
            avatarAlt="Аватар пользователя"
            action={
              <Button variant="primary" size="sm" trailingIcon={<EditIcon />} onClick={() => setEditing(true)}>
                Редактировать профиль
              </Button>
            }
            extraCards={
              <Card title="Аккаунт">
                <div className={styles.rows}>
                  <InfoRow icon={<MailIcon />} label="E-mail" value={user.email} />
                </div>
                <div className={styles.accountActions}>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => { logout(); navigate(ROUTES.login, { replace: true }) }}
                  >
                    Выйти
                  </Button>
                  <Button variant="primary" size="sm" onClick={openDelete}>
                    Удалить аккаунт
                  </Button>
                </div>
              </Card>
            }
          />
        )}
      </main>

      {deleteStep === 'confirm' && (
        <DeleteModal title="Удалить аккаунт" onClose={() => setDeleteStep(null)}>
          <p className={styles.modalText}>
            Аккаунт и профиль будут удалены безвозвратно. Ваш узел в чужом дереве просто отвяжется, данные в нём сохранятся.
          </p>
          {deleteError && <p className={styles.notice} role="alert">{deleteError}</p>}
          <div className={styles.modalActions}>
            <Button variant="primary" size="sm" onClick={() => setDeleteStep(null)}>Отмена</Button>
            <Button variant="accent" size="sm" disabled={deleting} onClick={() => runDelete()}>
              {deleting ? 'Удаление…' : 'Удалить'}
            </Button>
          </div>
        </DeleteModal>
      )}

      {deleteStep === 'successor' && (
        <DeleteModal title="Кому передать дерево" onClose={() => setDeleteStep(null)}>
          <p className={styles.modalText}>
            Вы — единственный владелец дерева, в котором есть другие участники. Выберите, кто станет его владельцем.
          </p>
          <ul className={styles.pickerList}>
            {successors.map((c) => (
              <li key={c.id}>
                <label className={styles.pickerItem}>
                  <input
                    type="radio"
                    name="successor"
                    checked={pickedSuccessor === c.id}
                    onChange={() => setPickedSuccessor(c.id)}
                  />
                  {c.avatar_url && <img src={resolveMediaUrl(c.avatar_url)} alt="" className={styles.pickerAvatar} />}
                  <span>{formatPersonName(c, 'Без имени')}</span>
                </label>
              </li>
            ))}
          </ul>
          {deleteError && <p className={styles.notice} role="alert">{deleteError}</p>}
          <div className={styles.modalActions}>
            <Button variant="primary" size="sm" onClick={() => setDeleteStep(null)}>Отмена</Button>
            <Button variant="accent" size="sm" disabled={deleting || !pickedSuccessor} onClick={() => runDelete(pickedSuccessor)}>
              {deleting ? 'Удаление…' : 'Передать и удалить'}
            </Button>
          </div>
        </DeleteModal>
      )}
    </div>
  )
}
