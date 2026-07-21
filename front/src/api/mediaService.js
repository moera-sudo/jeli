import api, { STATIC_URL } from './axiosConfig';

/**
 * Media API — image upload + avatar helpers. Uploads are multipart/form-data;
 * axios sets the correct boundary automatically for a `FormData` body.
 * Accepted: JPEG/PNG/WebP/GIF, up to 10 MB.
 */

function fileForm(file) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/**
 * Upload an image and get back its URL (e.g. to embed in family-history markdown).
 * POST /media
 *
 * @param {File} file
 * @returns {Promise<{ url: string }>} MediaUploadResponse ({ url: '/api/media/{id}' }).
 */
export async function uploadMedia(file) {
  const { data } = await api.post('/media', fileForm(file));
  return data;
}

/**
 * Upload the current user's profile avatar (saves file + sets avatar_url).
 * POST /users/profile/avatar
 *
 * @param {File} file
 * @returns {Promise<object>} UserMe
 */
export async function uploadProfileAvatar(file) {
  const { data } = await api.post('/users/profile/avatar', fileForm(file));
  return data;
}

/**
 * Upload a graph node's avatar (owner/collaborator/self).
 * POST /persons/{id}/avatar
 *
 * @param {string} personId
 * @param {File} file
 * @returns {Promise<object>} PersonDetail
 */
export async function uploadPersonAvatar(personId, file) {
  const { data } = await api.post(`/persons/${personId}/avatar`, fileForm(file));
  return data;
}

/**
 * Resolve a backend-relative media/avatar URL (`/api/media/{id}`) to an absolute
 * one usable in `<img src>` (the media endpoint is public — no auth header).
 *
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
export function resolveMediaUrl(url) {
  if (!url) return url;
  return /^(https?:|data:|blob:)/.test(url) ? url : `${STATIC_URL}${url}`;
}
