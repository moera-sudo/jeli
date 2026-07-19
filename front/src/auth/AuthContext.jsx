import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { tokenStorage } from '../api/axiosConfig'
import * as authApi from '../api/authService'
import { getMyProfile } from '../api/profileService'

/**
 * Auth session state for the whole app.
 *
 * `status` is the single source of truth for routing:
 *   'loading'          → still verifying stored tokens (render nothing/guarded)
 *   'authenticated'    → `user` is populated
 *   'unauthenticated'  → no valid session
 *
 * `onboardingRequired` is set ONLY by registration. It forces the just-created
 * user through the blank profile form before entering the app. Login never
 * sets it, so returning users go straight to the home page. It is persisted so
 * a page refresh mid-onboarding keeps the user on the form.
 */
const AuthContext = createContext(null)

const ONBOARDING_KEY = 'jeli.onboarding_pending'

function readOnboardingFlag() {
  return localStorage.getItem(ONBOARDING_KEY) === '1'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [onboardingRequired, setOnboardingRequired] = useState(readOnboardingFlag)

  // * Keeps the onboarding flag mirrored to localStorage so it survives refresh.
  const markOnboarding = useCallback((required) => {
    setOnboardingRequired(required)
    if (required) localStorage.setItem(ONBOARDING_KEY, '1')
    else localStorage.removeItem(ONBOARDING_KEY)
  }, [])

  const clearSession = useCallback(() => {
    authApi.logout()
    markOnboarding(false)
    setUser(null)
    setStatus('unauthenticated')
  }, [markOnboarding])

  // On startup: if tokens exist, validate them by loading the profile.
  useEffect(() => {
    let active = true

    async function bootstrap() {
      if (!tokenStorage.hasTokens()) {
        setStatus('unauthenticated')
        return
      }
      try {
        const me = await getMyProfile()
        if (!active) return
        setUser(me)
        setStatus('authenticated')
      } catch {
        if (active) clearSession()
      }
    }

    bootstrap()
    return () => {
      active = false
    }
  }, [clearSession])

  // The axios layer emits this when a token refresh ultimately fails.
  useEffect(() => {
    window.addEventListener('auth:logout', clearSession)
    return () => window.removeEventListener('auth:logout', clearSession)
  }, [clearSession])

  const login = useCallback(
    async (credentials) => {
      const me = await authApi.login(credentials)
      markOnboarding(false)
      setUser(me)
      setStatus('authenticated')
      return me
    },
    [markOnboarding],
  )

  const register = useCallback(
    async (payload) => {
      const me = await authApi.register(payload)
      markOnboarding(true)
      setUser(me)
      setStatus('authenticated')
      return me
    },
    [markOnboarding],
  )

  const finishOnboarding = useCallback(() => markOnboarding(false), [markOnboarding])

  const logout = useCallback(() => clearSession(), [clearSession])

  const value = {
    user,
    status,
    isAuthenticated: status === 'authenticated',
    onboardingRequired,
    login,
    register,
    finishOnboarding,
    logout,
    setUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
