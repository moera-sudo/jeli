import { useId } from 'react'

import styles from './TextField.module.css'

/**
 * A labelled, icon-prefixed text input.
 * Presentational only — no validation or state logic lives here.
 *
 * @param {object}   props
 * @param {string}   props.label       Visible field label.
 * @param {React.ReactNode} props.icon  Leading icon element.
 * @param {string}  [props.type]        Input type (text, email, password…).
 * @param {string}  [props.placeholder]
 * @param {string}  [props.name]
 * @param {string}  [props.autoComplete]
 */
export default function TextField({
  label,
  icon,
  type = 'text',
  placeholder,
  name,
  autoComplete,
}) {
  const id = useId()

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={styles.input}
        />
      </div>
    </div>
  )
}
