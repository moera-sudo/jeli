import api from './axiosConfig';

/**
 * Family-history API — a single markdown "story" per graph owner
 * (title + content). Photos are embedded in `content` as markdown links to
 * `/api/media/{id}` (see `mediaService.uploadMedia`).
 */

/**
 * The current user's family history, or `null` if not created yet (404).
 * GET /family
 *
 * @returns {Promise<object|null>} FamilyRead or null.
 */
export async function getMyFamily() {
  try {
    const { data } = await api.get('/family');
    return data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Another user's family history (public read).
 * GET /family/{ownerUserId}
 *
 * @param {string} ownerUserId
 * @returns {Promise<object>} FamilyRead
 */
export async function getFamily(ownerUserId) {
  const { data } = await api.get(`/family/${ownerUserId}`);
  return data;
}

/**
 * Create or fully replace the current user's family history (single resource).
 * PUT /family
 *
 * @param {object} payload  { title (required), content }.
 * @returns {Promise<object>} FamilyRead
 */
export async function upsertFamily({ title, content = '' }) {
  const { data } = await api.put('/family', { title, content });
  return data;
}
