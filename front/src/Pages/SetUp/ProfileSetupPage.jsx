import { useNavigate } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import ProfileEditor from '../../Components/ProfileEditor/ProfileEditor'
import Loader from '../../UI/Loader/Loader'
import { createProfile } from '../../api/profileService'
import { useAuth } from '../../auth/AuthContext'
import { ROUTES } from '../../Routes/Routes'
import styles from './ProfileSetupPage.module.css'

// * Fields that must be filled before the fresh profile can be saved.
const REQUIRED_FIELDS = [
  'birth_date',
  'birth_city',
  'birth_country',
  'current_city',
  'current_country',
  'nationality',
]

/**
 * Onboarding: the blank profile, laid out exactly like the profile and opened
 * straight into edit mode right after registration. Saving is only possible
 * once all required fields are filled; it persists via `users/create`, updates
 * the session user, clears the onboarding flag, then goes to the home page.
 */
export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const { user, setUser, finishOnboarding } = useAuth()

  const handleSubmit = async (payload) => {
    const updated = await createProfile(payload)
    setUser(updated)
    // Clear the pending flag and navigate in the same batch so the route
    // guard sees onboarding as done and lets the home page through.
    finishOnboarding()
    navigate(ROUTES.home, { replace: true })
  }

  if (!user) return <Loader />

  return (
    <div className={styles.page}>
      <TopBar />
      <main className={styles.main}>
        <p className={styles.hint}>
          Заполните профиль. Поля со знаком <span className={styles.req}>*</span> обязательны
          для сохранения.
        </p>

        <ProfileEditor
          mode="create"
          initialValues={user}
          requiredFields={REQUIRED_FIELDS}
          submitLabel="Сохранить и продолжить"
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  )
}
