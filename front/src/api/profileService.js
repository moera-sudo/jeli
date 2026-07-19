import api from './axiosConfig';

/**
 * User profile API.
 * Maps directly onto the backend `users` feature endpoints.
 */

/**
 * Full profile of the current user.
 * GET /users/profile/me
 *
 * @returns {Promise<object>} UserMe
 */
export async function getMyProfile() {
  const { data } = await api.get('/users/profile/me');
  return data;
}

/**
 * Fill in additional profile details right after registration (onboarding).
 * POST /users/create — does not accept `full_name` and issues no new tokens.
 *
 * @param {object} details  Optional profile fields (city, birth data, ru/zhuz/tribe…).
 * @returns {Promise<object>} UserMe
 */
export async function createProfile(details) {
  const { data } = await api.post('/users/create', details);
  return data;
}

/**
 * Partially update the current user's profile.
 * PATCH /users/profile/edit — accepts any subset of profile fields (incl. full_name).
 *
 * @param {object} changes  Only the fields to change.
 * @returns {Promise<object>} UserMe
 */
export async function updateProfile(changes) {
  const { data } = await api.patch('/users/profile/edit', changes);
  return data;
}
