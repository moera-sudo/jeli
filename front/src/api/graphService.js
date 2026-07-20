import api from './axiosConfig';

/**
 * Family-graph API.
 * Thin wrappers over the backend `graph` feature (see docs/graph-api.md).
 * All routes live under `/api`; the configured axios instance already adds it,
 * attaches the JWT and normalizes errors to `Error` objects carrying `.status`.
 *
 * Permission/visibility logic (`can_edit`, `is_registered`, `can_chat`) is never
 * reimplemented here — the server sends those flags ready to render.
 */

/* ----------------------------------------------------------- tree bootstrap */

/**
 * The current user's own graph node, or `null` when they don't have one yet
 * (backend answers 404 — the signal that the user must Join or Create a tree).
 *
 * @returns {Promise<object|null>} PersonDetail or null.
 */
export async function getMyPerson() {
  try {
    const { data } = await api.get('/persons/me');
    return data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Create a brand-new root node — the caller becomes the graph owner (admin).
 * Uses `gender` from the user profile; rejects with 409 if it isn't set yet.
 *
 * @returns {Promise<object>} PersonDetail
 */
export async function createGraph() {
  const { data } = await api.post('/graph/create');
  return data;
}

/**
 * Claim a pre-existing node by its invite code — joins an existing family tree.
 *
 * @param {string} inviteCode  8-char Crockford Base32 code.
 * @returns {Promise<object>} PersonDetail
 */
export async function joinGraph(inviteCode) {
  const { data } = await api.post('/graph/join', { invite_code: inviteCode });
  return data;
}

/**
 * Registered relatives who could take over the graph when the owner leaves.
 * @returns {Promise<object[]>} SuccessorCandidate[] ({ id: userId, full_name, avatar_url }).
 */
export async function getSuccessorCandidates() {
  const { data } = await api.get('/graph/successor-candidates');
  return data;
}

/* ------------------------------------------------------------- graph read */

/**
 * The graph around a focus node, bounded by `depth` generations, for rendering.
 *
 * @param {string} focusId
 * @param {number} [depth=3]  1–8.
 * @returns {Promise<object>} GraphResponse { focus_person_id, persons[], relationships[] }.
 */
export async function getGraph(focusId, depth = 3) {
  const { data } = await api.get('/graph', { params: { focus: focusId, depth } });
  return data;
}

/**
 * Heavy detail for a single node (relation_to_viewer, can_edit, …).
 * @param {string} id
 * @returns {Promise<object>} PersonDetail
 */
export async function getPerson(id) {
  const { data } = await api.get(`/persons/${id}`);
  return data;
}

/* ------------------------------------------------------------ mutations */

/**
 * Atomically create a node, optionally wired to an existing one via `relation`.
 *
 * @param {object} payload  { full_name, gender, ...optional,
 *   relation?: { to_person_id, type: 'parent'|'child'|'spouse', marriage_year?, marriage_end_reason? } }.
 *   `relation.type` is read relative to `to_person_id`.
 * @returns {Promise<object>} PersonDetail
 */
export async function createPerson(payload) {
  const { data } = await api.post('/persons', payload);
  return data;
}

/**
 * Patch a node (any subset of person fields).
 * @param {string} id
 * @param {object} changes
 * @returns {Promise<object>} PersonDetail
 */
export async function updatePerson(id, changes) {
  const { data } = await api.patch(`/persons/${id}`, changes);
  return data;
}

/**
 * Delete/unlink a node. Deleting your own node may need a successor: on 409
 * (`SuccessorRequiredError`) call `getSuccessorCandidates()` and retry with
 * `newOwnerUserId`.
 *
 * @param {string} id
 * @param {string} [newOwnerUserId]
 * @returns {Promise<void>}
 */
export async function deletePerson(id, newOwnerUserId) {
  await api.delete(`/persons/${id}`, {
    params: newOwnerUserId ? { new_owner_user_id: newOwnerUserId } : undefined,
  });
}

/**
 * Generate (or fetch) the shareable invite code for a node the caller owns.
 * @param {string} personId
 * @returns {Promise<string>} the 8-char code.
 */
export async function generateInviteCode(personId) {
  const { data } = await api.post(`/persons/${personId}/invite-code`);
  return data.invite_code;
}

/* -------------------------------------------------- cross-family proposals */

/**
 * All marriage/merge proposals involving the current user (incoming + outgoing).
 * @returns {Promise<object[]>} RelationshipProposalRead[]
 */
export async function getMarriageProposals() {
  const { data } = await api.get('/marriage-proposals');
  return data;
}

/**
 * Propose linking one of your nodes to another family's node via its code.
 *
 * @param {object} body  { person_a_id, target_invite_code, marriage_year? }.
 * @returns {Promise<object>} RelationshipProposalRead
 */
export async function createMarriageProposal(body) {
  const { data } = await api.post('/marriage-proposals', body);
  return data;
}

/** Approve an incoming proposal (responder side). */
export async function confirmProposal(id) {
  const { data } = await api.post(`/marriage-proposals/${id}/confirm`);
  return data;
}

/** Reject an incoming proposal (responder side). */
export async function rejectProposal(id) {
  const { data } = await api.post(`/marriage-proposals/${id}/reject`);
  return data;
}

/* --------------------------------------------------------------- matches */

/**
 * Aggregated relative-match suggestions across the user's household graph.
 * (Endpoint is live but returns [] until the matching pipeline ships.)
 *
 * @param {string} userId
 * @returns {Promise<object[]>} MatchCandidateRead[]
 */
export async function getUserMatches(userId) {
  const { data } = await api.get(`/users/${userId}/matches`);
  return data;
}

/** Confirm a suggested match. */
export async function confirmMatch(id) {
  const { data } = await api.post(`/matches/${id}/confirm`);
  return data;
}

/** Reject a suggested match. */
export async function rejectMatch(id) {
  const { data } = await api.post(`/matches/${id}/reject`);
  return data;
}
