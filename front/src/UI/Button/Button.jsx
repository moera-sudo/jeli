import styles from './Button.module.css'

/**
 * Pill-shaped button.
 * Presentational only — callers wire up behaviour via standard button props.
 *
 * @param {object} props
 * @param {'primary'|'accent'} [props.variant]  Visual style. Defaults to primary (black).
 * @param {'md'|'sm'} [props.size]              Height/padding preset. Defaults to md.
 * @param {boolean} [props.fullWidth]           Stretch to the container width.
 * @param {React.ReactNode} [props.trailingIcon] Icon rendered after the label.
 * @param {React.ReactNode} props.children       Button label.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  trailingIcon,
  children,
  type = 'button',
  ...rest
}) {
  const className = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={className} {...rest}>
      {children}
      {trailingIcon && <span className={styles.icon}>{trailingIcon}</span>}
    </button>
  )
}
