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
 * Family invite code: exactly 6 digits.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidFamilyCode(value) {
  return /^\d{6}$/.test(value)
}
