import api from './axiosConfig';

/**
 * Notifications API.
 * Maps onto the backend `notifications` feature. Real-time delivery is a single
 * app-wide WebSocket at `/ws` (see the backend `ws_manager`); these REST calls
 * cover listing and read-state. A socket client is not wired here yet.
 */

/**
 * The current user's notifications, newest first.
 * GET /notifications
 *
 * @param {boolean} [unreadOnly=false]  Return only unread notifications.
 * @returns {Promise<object[]>} NotificationRead[] ({ id, type, payload, is_read, created_at }).
 */
export async function listNotifications(unreadOnly = false) {
  const { data } = await api.get('/notifications', {
    params: unreadOnly ? { unread_only: true } : undefined,
  });
  return data;
}

/**
 * Mark a single notification as read.
 * POST /notifications/{id}/read
 *
 * @param {string} id
 * @returns {Promise<object>} NotificationRead
 */
export async function markNotificationRead(id) {
  const { data } = await api.post(`/notifications/${id}/read`);
  return data;
}

/**
 * Mark all of the current user's notifications as read.
 * POST /notifications/read-all
 *
 * @returns {Promise<void>}
 */
export async function markAllNotificationsRead() {
  await api.post('/notifications/read-all');
}

/**
 * Delete a single notification.
 * DELETE /notifications/{id}
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteNotification(id) {
  await api.delete(`/notifications/${id}`);
}
