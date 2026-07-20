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
  'gender',
  'birth_date',
  'birth_city',
  'birth_country',
  'current_city',
  'current_country',
  'nationality',
]

export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const { user, setUser, finishOnboarding } = useAuth()

  const handleSubmit = async (payload) => {
    const updated = await createProfile(payload)
    setUser(updated)
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
