import api, { tokenStorage } from './axiosConfig';

/**
 * Authentication API.
 * Every call that issues tokens persists them via `tokenStorage`, so callers
 * only deal with the returned user object.
 */

/**
 * Register a new account (short form).
 *
 * @param {object} payload
 * @param {string} payload.email
 * @param {string} payload.password - Min length 8, max length 128
 * @param {string} payload.last_name
 * @param {string} payload.first_name
 * @param {string|null} [payload.patronymic] - Optional patronymic
 * @param {string|null} [payload.graph_invite_code] - Family invite code, or null
 * @returns {Promise<object>} The created user (UserMe).
 */
export async function register(payload) {
  const { data } = await api.post('/auth/register', payload);
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.user;
}

/**
 * Register a new account and fill the full profile in one request (alternative
 * to `register` + `profileService.createProfile`).
 *
 * @param {object} payload  Required: email, password, last_name, first_name.
 *   Optional: patronymic, graph_invite_code, and any profile field
 *   (gender, current_city/country, birth_date, birth_city/country, description,
 *   nationality, ru/zhuz/tribe, avatar_url).
 * @returns {Promise<object>} The created user (UserMe).
 */
export async function registerWithInfo(payload) {
  const { data } = await api.post('/auth/register/with-info', payload);
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.user;
}

/**
 * Log in with email + password.
 *
 * @param {object} payload
 * @param {string} payload.email
 * @param {string} payload.password
 * @returns {Promise<object>} The authenticated user (UserMe).
 */
export async function login(payload) {
  const { data } = await api.post('/auth/login', payload);
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.user;
}

/**
 * Refresh access and refresh tokens.
 *
 * @param {string} refreshToken
 * @returns {Promise<object>} Object containing access_token, refresh_token, and token_type.
 */
export async function refresh(refreshToken) {
  const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
  tokenStorage.set(data.access_token, data.refresh_token);
  return data;
}

/** Clears the local session. Stateless backend — nothing to revoke server-side. */
export function logout() {
  tokenStorage.clear();
}