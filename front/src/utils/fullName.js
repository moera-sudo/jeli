/**
 * Full-name handling for the CIS convention "Фамилия Имя Отчество"
 * (surname · first name · middle name).
 *
 * The backend stores a single `full_name` string, so the three parts are
 * joined with spaces on save and split back on load. Splitting keeps the first
 * two tokens as surname and first name; any remaining tokens become the middle
 * name — reversible for standard two/three-part names.
 */

/**
 * @param {string|null|undefined} fullName
 * @returns {{ surname: string, firstName: string, middleName: string }}
 */
export function splitFullName(fullName) {
  const tokens = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    surname: tokens[0] ?? '',
    firstName: tokens[1] ?? '',
    middleName: tokens.slice(2).join(' '),
  }
}

/**
 * @param {{ surname?: string, firstName?: string, middleName?: string }} parts
 * @returns {string} "Фамилия Имя Отчество" with empty parts dropped.
 */
export function joinFullName({ surname, firstName, middleName }) {
  return [surname, firstName, middleName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
}
