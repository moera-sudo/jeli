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
 * Public profile of another user by their user id (email/password hidden).
 * Used to show a registered relative's full profile from the graph.
 * GET /users/profile/{id}
 *
 * @param {string} userId
 * @returns {Promise<object>} UserPublic
 */
export async function getPublicProfile(userId) {
  const { data } = await api.get(`/users/profile/${userId}`);
  return data;
}

/**
 * Fill in additional profile details right after registration (onboarding).
 * POST /users/create — does not accept name fields and issues no new tokens.
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
 * PATCH /users/profile/edit — accepts any subset of profile fields (incl. last_name/first_name/patronymic).
 *
 * @param {object} changes  Only the fields to change.
 * @returns {Promise<object>} UserMe
 */
export async function updateProfile(changes) {
  const { data } = await api.patch('/users/profile/edit', changes);
  return data;
}

/**
 * Permanently delete the current user's account.
 * DELETE /users/delete
 *
 * If the user solely owns a graph that still has other registered members, the
 * backend requires handing ownership over first via `newOwnerUserId` (pick from
 * `graphService.getSuccessorCandidates`), otherwise it responds with an error.
 * A node owned by someone else is merely unlinked, not deleted.
 *
 * @param {string} [newOwnerUserId]  Whom to transfer graph ownership to.
 * @returns {Promise<void>}
 */
export async function deleteAccount(newOwnerUserId) {
  await api.delete('/users/delete', {
    params: newOwnerUserId ? { new_owner_user_id: newOwnerUserId } : undefined,
  });
}
