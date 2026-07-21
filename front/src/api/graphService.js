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

/**
 * Suggest tribe (тайпа) + zhuz (жүз) for a given ru (род) from the backend
 * glossary (exact + fuzzy). Both fields are null when there's no match.
 * GET /ru-taxonomy?ru=
 *
 * @param {string} ru
 * @returns {Promise<{ tribe: string|null, zhuz: string|null }>}
 */
export async function suggestRuTaxonomy(ru) {
  const q = String(ru ?? '').trim();
  if (!q) return { tribe: null, zhuz: null };
  const { data } = await api.get('/ru-taxonomy', { params: { ru: q } });
  return data;
}

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
 * @returns {Promise<object[]>} SuccessorCandidate[] ({ id: userId, last_name, first_name, patronymic, avatar_url }).
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
 * The full household graph around a focus node — blood line + siblings/nephews
 * (no depth limit) + spouses (with their families for active marriages) +
 * confirmed match bridges. Unlike `getGraph`, nothing is cut off by a depth
 * horizon, so newly added relatives always appear.
 *
 * @param {string} focusId
 * @returns {Promise<object>} GraphResponse { focus_person_id, persons[], relationships[] }.
 */
export async function getHouseholdGraph(focusId) {
  const { data } = await api.get(`/persons/${focusId}/household-graph`);
  return data;
}

/**
 * Strict blood line only (child_of ancestors + descendants, no spouses, no depth
 * limit). Separate view / debugging aid — the main tree uses `getHouseholdGraph`.
 *
 * @param {string} personId
 * @returns {Promise<object>} GraphResponse
 */
export async function getBloodline(personId) {
  const { data } = await api.get(`/persons/${personId}/bloodline`);
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
 * @param {object} payload  { last_name, first_name, patronymic?, gender, ...optional,
 *   relation?: { to_person_id, type: 'parent'|'child'|'spouse', marriage_year?, marriage_end_reason? } }.
 *   `relation.type` is read relative to `to_person_id`.
 * @returns {Promise<object>} PersonDetail
 */
export async function createPerson(payload) {
  const { data } = await api.post('/persons', payload);
  return data;
}

/**
 * Insert a new person BETWEEN two already directly-linked nodes
 * (child --child_of--> parent) — for fixing a skipped generation without the
 * cascade risk of deleting and recreating the edge.
 *
 * @param {object} payload  Person fields (last_name, first_name, gender, …) plus
 *   `parent_id` and `child_id` of the existing edge to split.
 * @returns {Promise<object>} PersonDetail
 */
export async function insertPersonBetween(payload) {
  const { data } = await api.post('/persons/insert-between', payload);
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

/**
 * Link two people that already exist in the graph — used when a relative is
 * picked from the tree instead of created (e.g. giving your brother the same
 * father you already have). Only `child_of` is accepted (from = child, to =
 * parent); spouse links go through `createMarriageProposal`.
 *
 * @param {object} body  { from_person_id, to_person_id }.
 * @returns {Promise<object>} RelationshipRead
 */
export async function createRelationship(body) {
  const { data } = await api.post('/relationships', { type: 'child_of', ...body });
  return data;
}

/**
 * Edit a marriage's year / end reason without deleting the edge — divorce and
 * widowhood are kept as marriage history, not erased.
 * PATCH /relationships/{id}
 *
 * @param {string} id
 * @param {object} changes  { marriage_year?, marriage_end_reason? ('divorce'|'widowed') }.
 * @returns {Promise<object>} RelationshipRead
 */
export async function updateRelationship(id, changes) {
  const { data } = await api.patch(`/relationships/${id}`, changes);
  return data;
}

/**
 * Delete a relationship edge created wholly by mistake. For divorce/widowhood
 * use `updateRelationship` instead (keeps the marriage history).
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRelationship(id) {
  await api.delete(`/relationships/${id}`);
}

/* ------------------------------------------------------------ collaborators */

/**
 * Registered members the graph owner has granted full edit rights to.
 * @returns {Promise<object[]>} CollaboratorRead[] ({ id, graph_owner_id, collaborator_user_id, created_at }).
 */
export async function listCollaborators() {
  const { data } = await api.get('/graph/collaborators');
  return data;
}

/**
 * Grant a live, registered node of your own graph the right to edit the whole
 * graph (add/edit relatives) alongside you. Owner-only.
 *
 * @param {string} personId  A node you own that is linked to a real account.
 * @returns {Promise<object>} CollaboratorRead
 */
export async function grantCollaborator(personId) {
  const { data } = await api.post('/graph/collaborators', { person_id: personId });
  return data;
}

/** Revoke a collaborator's edit rights (by their user id). */
export async function revokeCollaborator(userId) {
  await api.delete(`/graph/collaborators/${userId}`);
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
 * A single marriage/merge proposal by id (status, participants, result).
 * @param {string} id
 * @returns {Promise<object>} RelationshipProposalRead
 */
export async function getMarriageProposal(id) {
  const { data } = await api.get(`/marriage-proposals/${id}`);
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

/**
 * Matches for a single person's blood line (sorted by score). Narrower than
 * `getUserMatches`, which aggregates the whole household graph.
 *
 * @param {string} personId
 * @returns {Promise<object[]>} MatchCandidateRead[]
 */
export async function getPersonMatches(personId) {
  const { data } = await api.get(`/persons/${personId}/matches`);
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
