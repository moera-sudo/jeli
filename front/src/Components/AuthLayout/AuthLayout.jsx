import { Link } from 'react-router-dom'

import styles from './AuthLayout.module.css'

/**
 * Shared shell for authentication screens: a decorative accent panel beside
 * a centered form card. Both login and register compose this so the two
 * screens stay visually consistent.
 *
 * @param {object} props
 * @param {string} props.title          Card heading (e.g. "Log in").
 * @param {object} props.switchTo       The cross-link to the other auth screen.
 * @param {string} props.switchTo.label Link text.
 * @param {string} props.switchTo.to    Target route path.
 * @param {string} props.switchTo.hint  Text shown before the link.
 * @param {React.ReactNode} props.children  The form.
 */
export default function AuthLayout({ title, switchTo, children }) {
  return (
    <div className={styles.page}>
      <aside className={styles.aside}>
        <span className={styles.blob} aria-hidden="true" />
        <div className={styles.asideContent}>
          <span className={styles.brand}>Jeli</span>
          <p className={styles.tagline}>Добро пожаловать в ваше рабочее пространство.</p>
          <span className={styles.asideFoot}>Просто. Быстро. Ваше.</span>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {switchTo && (
              <p className={styles.switchHint}>
                {switchTo.hint}{' '}
                <Link className={styles.switchLink} to={switchTo.to}>
                  {switchTo.label}
                </Link>
              </p>
            )}
          </header>
          {children}
        </section>
      </main>
    </div>
  )
}
