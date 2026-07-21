import { useEffect, useState } from 'react'

import ProfileView from '../ProfileView/ProfileView'
import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { CloseIcon, ChatIcon } from '../../UI/icons'
import { getPublicProfile } from '../../api/profileService'
import styles from './GraphCanvas.module.css'

/**
 * Left-click modal for a REGISTERED relative: their full public profile in the
 * exact profile-page layout, but in a dialog. The identity action is "Открыть
 * чат" instead of the edit button, and the free-text card reads
 * «О члене семьи» rather than «О себе».
 *
 * @param {object} props
 * @param {string} props.userId        Linked user id of the registered person.
 * @param {() => void} [props.onOpenChat]  Chat button (hidden when omitted).
 * @param {() => void} [props.onRemove]    Remove-from-tree button (admin only; hidden when omitted).
 * @param {() => void} props.onClose
 */
export default function MemberProfileModal({ userId, onOpenChat, onRemove, onClose }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setProfile(null)
    setError('')
    getPublicProfile(userId)
      .then((data) => active && setProfile(data))
      .catch((err) => active && setError(err.message || 'Не удалось загрузить профиль'))
    return () => {
      active = false
    }
  }, [userId])

  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.memberModalCard} role="dialog" aria-label="Профиль родственника" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className={styles.detailClose} aria-label="Закрыть" onClick={onClose}>
          <CloseIcon />
        </button>

        {error ? (
          <p className={styles.formError} role="alert">{error}</p>
        ) : !profile ? (
          <div className={styles.memberLoading}><Loader /></div>
        ) : (
          <ProfileView
            person={profile}
            gridClassName={styles.memberGrid}
            aboutTitle="О члене семьи"
            action={
              onOpenChat || onRemove ? (
                <>
                  {onOpenChat && (
                    <Button variant="primary" size="sm" fullWidth trailingIcon={<ChatIcon />} onClick={onOpenChat}>
                      Открыть чат
                    </Button>
                  )}
                  {onRemove && (
                    <Button variant="danger" size="sm" fullWidth onClick={onRemove}>
                      Удалить
                    </Button>
                  )}
                </>
              ) : null
            }
          />
        )}
      </div>
    </div>
  )
}
