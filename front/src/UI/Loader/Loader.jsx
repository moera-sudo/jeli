import styles from './Loader.module.css'

/**
 * Full-screen centered loading indicator.
 * Used while the auth session is being verified.
 */
export default function Loader() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.srOnly}>Загрузка…</span>
    </div>
  )
}
