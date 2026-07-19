import { createBrowserRouter } from 'react-router-dom'

import { ROUTES } from './Routes'
import RootLayout from './RootLayout'
import ProtectedRoute from './ProtectedRoute'
import PublicOnlyRoute from './PublicOnlyRoute'
import HomePage from '../Pages/Home/HomePage'
import Profile from '../Pages/Profile/Profile'
import ProfileSetupPage from '../Pages/SetUp/ProfileSetupPage'
import LoginPage from '../Pages/Auth/LoginPage'
import RegisterPage from '../Pages/Auth/RegisterPage'

/**
 * Application router.
 *
 * Every route lives under RootLayout (auth session provider). Access is then
 * split by guard:
 *   - PublicOnlyRoute → login / register (redirects away if already signed in)
 *   - ProtectedRoute  → home, onboarding, profile (redirects to login if not)
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: ROUTES.login, element: <LoginPage /> },
          { path: ROUTES.register, element: <RegisterPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: ROUTES.home, element: <HomePage /> },
          { path: ROUTES.onboarding, element: <ProfileSetupPage /> },
          { path: ROUTES.profile, element: <Profile /> },
        ],
      },
    ],
  },
])
