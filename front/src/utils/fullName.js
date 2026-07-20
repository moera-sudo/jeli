/**
 * Full-name handling for the CIS convention "Фамилия Имя Отчество"
 * (surname · first name · middle name).
 *
 * The backend stores the name as three separate columns
 * (`last_name` · `first_name` · `patronymic`). `formatPersonName` joins them
 * for display; `splitFullName`/`joinFullName` remain for the local editor state
 * (which keeps the parts under surname/firstName/middleName keys).
 */

/**
 * Joins a person's stored name parts into a single display string.
 * Accepts any object exposing `last_name` / `first_name` / `patronymic`
 * (UserMe, PersonNode, PersonDetail, SuccessorCandidate…).
 *
 * @param {{ last_name?: string, first_name?: string, patronymic?: string }|null|undefined} person
 * @param {string} [fallback]
 * @returns {string} "Фамилия Имя Отчество" with empty parts dropped.
 */
export function formatPersonName(person, fallback = '') {
  const name = [person?.last_name, person?.first_name, person?.patronymic]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
  return name || fallback
}

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
