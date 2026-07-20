/**
 * Simple, pragmatic email check: non-empty local part, an @, a domain with a
 * dot and a 2+ char TLD. Good enough for form-level UX feedback; the server
 * remains the source of truth.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/**
 * Password rule mirrored from the backend: 8–128 characters.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidPassword(value) {
  return value.length >= 8 && value.length <= 128
}

/**
 * Family invite code: exactly 8 Crockford Base32 characters.
 * The backend uses `0-9` + `A-Z` minus the ambiguous `I`, `L`, `O`, `U`
 * (see docs/graph-api.md). Codes are shared as plain text.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidFamilyCode(value) {
  return /^[0-9A-HJ-NP-TV-Z]{8}$/.test(value)
}

/**
 * Normalizes raw user input into a candidate invite code: uppercases, drops any
 * character outside the Crockford Base32 alphabet, and caps the length at 8.
 * Shared by the registration form and the "Join a tree" screen.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeInviteCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-HJ-NP-TV-Z]/g, '')
    .slice(0, 8)
}
