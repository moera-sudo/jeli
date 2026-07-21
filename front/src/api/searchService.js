import api from './axiosConfig';

/**
 * Platform-wide people search.
 * Maps onto the backend `search` feature — finds OTHER registered users across
 * every tree by name (surname / first name / patronymic, case-insensitive).
 */

/**
 * Search users by name.
 * GET /search?q=&limit=
 *
 * @param {string} q       Name substring (>= 1 char after trimming).
 * @param {number} [limit] Max results (1–50, backend default 20).
 * @returns {Promise<object[]>} UserPublic[] — each with `person_id` set only if
 *   that user already created/joined a tree (usable for POST /chats).
 */
export async function searchProfiles(q, limit) {
  const query = String(q ?? '').trim();
  if (!query) return [];
  const { data } = await api.get('/search', { params: limit ? { q: query, limit } : { q: query } });
  return data;
}
