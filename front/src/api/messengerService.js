import api from './axiosConfig';

/**
 * Messenger API — simple 1-on-1 chats. Real-time delivery rides the app-wide
 * `/ws` socket (see the notifications feature); these REST calls create/read/
 * send/delete. A socket client is not wired here yet.
 */

/**
 * Open (or fetch the existing) chat with a person. Idempotent — safe to wire to
 * a "message" button; the same person always returns the same chat.
 * POST /chats
 *
 * @param {string} personId  A graph node linked to a real account.
 * @returns {Promise<object>} ChatRead ({ id, peer_user_id, created_at, last_message }).
 */
export async function createChat(personId) {
  const { data } = await api.post('/chats', { person_id: personId });
  return data;
}

/**
 * The current user's chats, newest first.
 * GET /chats
 *
 * @returns {Promise<object[]>} ChatRead[]
 */
export async function listChats() {
  const { data } = await api.get('/chats');
  return data;
}

/**
 * Full message history of a chat (ascending by time; participants only).
 * GET /chats/{id}/messages
 *
 * @param {string} chatId
 * @returns {Promise<object[]>} MessageRead[] ({ id, chat_id, sender_id, content, created_at }).
 */
export async function listMessages(chatId) {
  const { data } = await api.get(`/chats/${chatId}/messages`);
  return data;
}

/**
 * Send a message (persisted + pushed to the peer over WS if online).
 * POST /chats/{id}/messages
 *
 * @param {string} chatId
 * @param {string} content  1–4000 chars.
 * @returns {Promise<object>} MessageRead
 */
export async function sendMessage(chatId, content) {
  const { data } = await api.post(`/chats/${chatId}/messages`, { content });
  return data;
}

/**
 * Delete a chat and its whole history (either participant may do this).
 * DELETE /chats/{id}
 *
 * @param {string} chatId
 * @returns {Promise<void>}
 */
export async function deleteChat(chatId) {
  await api.delete(`/chats/${chatId}`);
}
