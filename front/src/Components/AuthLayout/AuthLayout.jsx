import { Link } from 'react-router-dom'

import styles from './AuthLayout.module.css'

/**
 * Shared shell for authentication screens: a decorative accent panel beside
 * a centered form card. Both login and register compose this so the two
 * screens stay visually consistent.
 *
 * @param {object} props
 * @param {string} props.title          Card heading (e.g. "Log in").
 * @param {string} [props.subtitle]     Small line shown above the title.
 * @param {object} props.switchTo       The cross-link to the other auth screen.
 * @param {string} props.switchTo.label Link text.
 * @param {string} props.switchTo.to    Target route path.
 * @param {string} props.switchTo.hint  Text shown before the link.
 * @param {React.ReactNode} props.children  The form.
 */
export default function AuthLayout({ title, subtitle, switchTo, children }) {
  return (
    <div className={styles.page}>
      {/* Left: orange panel floating inside a white frame. */}
      <aside className={styles.aside}>
        <div className={styles.frame}>
          <span className={styles.blob} aria-hidden="true" />
          <div className={styles.asideContent}>
            <img className={styles.brand} src="/src/assets/logo_3.png" alt="Brand Logo" />
            <div className={styles.asideHeading}>
              <span className={styles.asideEyebrow}>Краудсорсинговый конструктор родословной</span>
              <p className={styles.tagline}>
                Воссоедините свой род в один клик.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <span className={styles.eyebrow}>{subtitle}</span>}
          </header>

          {children}

          {switchTo && (
            <p className={styles.switchHint}>
              {switchTo.hint}{' '}
              <Link className={styles.switchLink} to={switchTo.to}>
                {switchTo.label}
              </Link>
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
