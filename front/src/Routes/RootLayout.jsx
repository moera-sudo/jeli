import { Outlet } from 'react-router-dom'

import { AuthProvider } from '../auth/AuthContext'

/**
 * Root layout: wraps every route in the auth session provider so guards and
 * pages can read/refresh the session. Rendered inside the router, so child
 * routes may use router hooks freely.
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
