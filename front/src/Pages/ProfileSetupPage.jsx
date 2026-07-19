import { useNavigate } from 'react-router-dom'

import TopBar from '../Components/TopBar/TopBar'
import ProfileForm from '../Components/ProfileForm/ProfileForm'
import { createProfile } from '../api/profileService'
import { useAuth } from '../auth/AuthContext'
import { ROUTES } from '../Routes/routes'
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
 * Onboarding: the blank profile, opened straight into edit mode right after
 * registration. Saving is only possible once all required fields are filled;
 * it persists via `users/create`, updates the session user, then sends the
 * user to the home page.
 */
export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const { setUser, finishOnboarding } = useAuth()

  const handleSubmit = async (payload) => {
    const updated = await createProfile(payload)
    setUser(updated)
    // Clear the pending flag and navigate in the same batch so the route
    // guard sees onboarding as done and lets the home page through.
    finishOnboarding()
    navigate(ROUTES.home, { replace: true })
  }

  return (
    <div className={styles.page}>
      <TopBar />
      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.head}>
            <h1 className={styles.title}>Заполните профиль</h1>
            <p className={styles.subtitle}>
              Эти данные помогут находить ваших родственников. Поля со знаком
              <span className={styles.req}> *</span> обязательны для сохранения.
            </p>
          </header>

          <ProfileForm
            requiredFields={REQUIRED_FIELDS}
            submitLabel="Сохранить и продолжить"
            onSubmit={handleSubmit}
          />
        </section>
      </main>
    </div>
  )
}
