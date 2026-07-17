import { createBrowserRouter } from 'react-router-dom'

import { ROUTES } from './routes'
import HomePage from '../Pages/HomePage'
import LoginPage from '../Pages/Auth/LoginPage'
import RegisterPage from '../Pages/Auth/RegisterPage'

/**
 * Application router.
 * Route → page mapping lives here only; pages stay unaware of navigation wiring.
 */
export const router = createBrowserRouter([
  {
    path: ROUTES.home,
    element: <HomePage />,
  },
  {
    path: ROUTES.login,
    element: <LoginPage />,
  },
  {
    path: ROUTES.register,
    element: <RegisterPage />,
  },
])
