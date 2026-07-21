/**
 * Formatting helpers for displaying profile data.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Formats an ISO date string (`YYYY-MM-DD`) for display, e.g. "23 июля 1994".
 * Returns the fallback for empty/invalid values.
 *
 * @param {string|null|undefined} isoDate
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatDate(isoDate, fallback = '—') {
  if (!isoDate) return fallback
  const date = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return fallback
  return DATE_FORMATTER.format(date)
}

/**
 * Returns the value if it is a non-empty string, otherwise the fallback.
 *
 * @param {string|null|undefined} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function displayValue(value, fallback = '—') {
  return value && String(value).trim() ? value : fallback
}
