import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import Loader from '../UI/Loader/Loader'
import { ROUTES } from './routes'

/**
 * Gate for auth screens (login / register).
 * Already-authenticated users are sent away: to the onboarding form if a
 * freshly registered profile is still pending, otherwise to the home page.
 */
export default function PublicOnlyRoute() {
  const { status, onboardingRequired } = useAuth()

  if (status === 'loading') return <Loader />
  if (status === 'authenticated') {
    return <Navigate to={onboardingRequired ? ROUTES.onboarding : ROUTES.home} replace />
  }

  return <Outlet />
}
