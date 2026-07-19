import axios from 'axios';

/**
 * Central axios configuration for the whole app.
 *
 * Responsibilities kept in this single module:
 *  - base URL / static-asset URL
 *  - JWT token storage (localStorage)
 *  - request interceptor  → attaches the access token
 *  - response interceptor → transparently refreshes an expired access token
 *    once, then retries the original request; on failure it clears the
 *    session and notifies the app via an `auth:logout` event.
 */

// Origin can be overridden per-environment via VITE_API_URL (see .env).
const ORIGIN = (import.meta.env?.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

export const STATIC_URL = ORIGIN;

const api = axios.create({
  baseURL: `${ORIGIN}/api`,
  headers: { 'Content-Type': 'application/json' },
});

/* -------------------------------------------------------------- token store */

const ACCESS_KEY = 'jeli.access_token';
const REFRESH_KEY = 'jeli.refresh_token';

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  hasTokens: () => Boolean(localStorage.getItem(ACCESS_KEY)),
  set: (access, refresh) => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Broadcasts an unrecoverable auth failure so the AuthProvider can react. */
function emitLogout() {
  window.dispatchEvent(new Event('auth:logout'));
}

/* ------------------------------------------------------- request interceptor */

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ------------------------------------------------ response / refresh handling */

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) throw new Error('No refresh token');

  // Bare axios call (not `api`) to avoid recursive interceptors.
  const { data } = await axios.post(`${ORIGIN}/api/auth/refresh`, {
    refresh_token: refreshToken,
  });
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // Only try to recover from an expired/invalid access token, and only once.
    const canRetry =
      response?.status === 401 &&
      config &&
      !config._retry &&
      tokenStorage.getRefresh() &&
      !config.url?.includes('/auth/');

    if (!canRetry) {
      return Promise.reject(normalizeError(error));
    }

    config._retry = true;
    try {
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newAccess = await refreshPromise;
      config.headers.Authorization = `Bearer ${newAccess}`;
      return api(config);
    } catch (refreshError) {
      tokenStorage.clear();
      emitLogout();
      return Promise.reject(normalizeError(refreshError));
    } finally {
      refreshPromise = null;
    }
  },
);

/**
 * Normalizes an axios error into a plain `Error` carrying a human-readable
 * message (from FastAPI's `detail`) and the HTTP status.
 */
function normalizeError(error) {
  const detail = error.response?.data?.detail;
  let message;

  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ msg, loc, ... }]
    message = detail.map((item) => item.msg).filter(Boolean).join(', ');
  } else if (typeof detail === 'string') {
    message = detail;
  }

  const normalized = new Error(message || error.message || 'Request failed');
  normalized.status = error.response?.status;
  return normalized;
}

export default api;
