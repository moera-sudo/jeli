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
 * @param {string} payload.password
 * @param {string} payload.full_name
 * @param {string|null} [payload.graph_invite_code]  Family invite code, or null
 *        when the user is the first family member (family admin).
 * @returns {Promise<object>} The created user (UserMe).
 */
export async function register(payload) {
  const { data } = await api.post('/auth/register', payload);
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.user;
}

/**
 * Log in with email + password.
 *
 * @param {{ email: string, password: string }} payload
 * @returns {Promise<object>} The authenticated user (UserMe).
 */
export async function login(payload) {
  const { data } = await api.post('/auth/login', payload);
  tokenStorage.set(data.access_token, data.refresh_token);
  return data.user;
}

/** Clears the local session. Stateless backend — nothing to revoke server-side. */
export function logout() {
  tokenStorage.clear();
}
