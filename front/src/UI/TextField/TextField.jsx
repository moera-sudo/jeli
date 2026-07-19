import { useId } from 'react'

import styles from './TextField.module.css'

/**
 * A labelled, icon-prefixed text input.
 * Presentational only — validation logic lives in the caller; this component
 * just renders the error message it is handed.
 *
 * @param {object}   props
 * @param {string}   props.label       Visible field label.
 * @param {React.ReactNode} props.icon  Leading icon element.
 * @param {string}  [props.type]        Input type (text, email, password…).
 * @param {string}  [props.placeholder]
 * @param {string}  [props.name]
 * @param {string}  [props.autoComplete]
 * @param {string}  [props.value]       Controlled value.
 * @param {(e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => void} [props.onChange]
 * @param {string}  [props.error]       Validation message; shown when truthy.
 * @param {boolean} [props.multiline]   Render a textarea instead of an input.
 * @param {number}  [props.rows]        Textarea row count (multiline only).
 * @param {boolean} [props.required]    Mark the field as required (label asterisk + aria).
 */
export default function TextField({
  label,
  icon,
  type = 'text',
  placeholder,
  name,
  autoComplete,
  value,
  onChange,
  error,
  multiline = false,
  rows = 4,
  required = false,
  ...rest
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hasError = Boolean(error)

  const controlClassName = [
    styles.control,
    multiline ? styles.controlMultiline : '',
    hasError ? styles.controlError : '',
  ]
    .filter(Boolean)
    .join(' ')

  const sharedProps = {
    id,
    name,
    placeholder,
    value,
    onChange,
    className: styles.input,
    'aria-invalid': hasError,
    'aria-required': required || undefined,
    'aria-describedby': hasError ? errorId : undefined,
    ...rest,
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && <span className={styles.requiredMark} aria-hidden="true"> *</span>}
      </label>
      <div className={controlClassName}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {multiline ? (
          <textarea rows={rows} {...sharedProps} />
        ) : (
          <input type={type} autoComplete={autoComplete} {...sharedProps} />
        )}
      </div>
      {hasError && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
