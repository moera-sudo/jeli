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
 * @param {(e: React.ChangeEvent<HTMLInputElement>) => void} [props.onChange]
 * @param {string}  [props.error]       Validation message; shown when truthy.
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
  ...rest
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hasError = Boolean(error)

  const controlClassName = [styles.control, hasError ? styles.controlError : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={controlClassName}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          className={styles.input}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          {...rest}
        />
      </div>
      {hasError && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
