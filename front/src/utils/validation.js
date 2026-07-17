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
