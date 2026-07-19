import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import Loader from '../UI/Loader/Loader'
import { ROUTES } from './routes'

/**
 * Gate for authenticated-only routes.
 * - Unauthenticated visitors → login.
 * - Freshly registered users with a pending profile are pinned to the
 *   onboarding form until they save it (registration-only flow).
 * While the session is being verified a loader is shown to avoid a flash.
 */
export default function ProtectedRoute() {
  const { status, onboardingRequired } = useAuth()
  const { pathname } = useLocation()

  if (status === 'loading') return <Loader />
  if (status === 'unauthenticated') return <Navigate to={ROUTES.login} replace />

  if (onboardingRequired && pathname !== ROUTES.onboarding) {
    return <Navigate to={ROUTES.onboarding} replace />
  }

  return <Outlet />
}
