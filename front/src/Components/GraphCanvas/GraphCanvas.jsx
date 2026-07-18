import {
  PlusIcon,
  MinusIcon,
  FitViewIcon,
  UserIcon,
  UsersIcon,
} from '../../UI/icons'
import styles from './GraphCanvas.module.css'

/**
 * Layout sketch of the family-tree workspace.
 *
 * This is presentation only: it maps out where the real @xyflow/react canvas,
 * its controls, the per-node <NodeToolbar> and the generation rail will live.
 * The nodes below are static placeholders drawn with the union-node (DAG)
 * pattern described in docs/dag-page.md — two parents meet at an invisible
 * union point and children hang from it, so lines never cross.
 */

/** One person card. `state` drives the visual per the three card states. */
function PersonNode({ name, meta, state = 'registered', selected = false, style }) {
  const className = [
    styles.node,
    styles[state],
    selected ? styles.nodeSelected : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} style={style}>
      <span className={styles.nodeAvatar} aria-hidden="true">
        <UserIcon />
        {state !== 'deceased' && (
          <span className={`${styles.status} ${styles[`status_${state}`]}`} />
        )}
      </span>
      <span className={styles.nodeText}>
        <span className={styles.nodeName}>{name}</span>
        <span className={styles.nodeMeta}>{meta}</span>
      </span>

      {/* Context toolbar — appears on the selected card (real: <NodeToolbar>). */}
      {selected && (
        <div className={styles.toolbar} role="toolbar" aria-label="Добавить родственника">
          <button type="button" className={styles.toolbarBtn}>+ Отец</button>
          <button type="button" className={styles.toolbarBtn}>+ Мать</button>
          <button type="button" className={styles.toolbarBtn}>+ Супруг(а)</button>
          <button type="button" className={styles.toolbarBtn}>+ Ребёнок</button>
          <button type="button" className={styles.toolbarBtn}>+ Брат/сестра</button>
        </div>
      )}
    </div>
  )
}

export default function GraphCanvas() {
  return (
    <div className={styles.canvas}>
      {/* Generation rail — Y is fixed by the backend, one row per поколение. */}
      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railTick} style={{ top: 61 }}>I</span>
        <span className={styles.railTick} style={{ top: 241 }}>II</span>
        <span className={styles.railTick} style={{ top: 421 }}>III</span>
      </div>

      {/* The graph stage. Fixed coordinate space so the connector layer and the
          cards share the same geometry — the real canvas fits/zooms this. */}
      <div className={styles.stage}>
        {/* Connector layer (union-node DAG). */}
        <svg className={styles.edges} viewBox="0 0 840 470" preserveAspectRatio="xMidYMid meet">
          {/* Gen I parents → union U1 */}
          <path d="M248 92 L378 140" />
          <path d="M508 92 L378 140" />
          {/* U1 → child (Бекнур) */}
          <path d="M378 140 L228 210" />
          {/* Gen II couple → union U2 */}
          <path d="M228 272 L423 320" />
          <path d="M548 272 L423 320" />
          {/* U2 → children */}
          <path d="M423 320 L288 390" />
          <path d="M423 320 L558 390" />
          {/* Invisible union points, drawn as small dots */}
          <circle className={styles.union} cx="378" cy="140" r="5" />
          <circle className={styles.union} cx="423" cy="320" r="5" />
        </svg>

        {/* Generation I */}
        <PersonNode name="Асан" meta="1938–2009" state="deceased" style={{ left: 170, top: 30 }} />
        <PersonNode name="Айгүл" meta="1942–2015" state="deceased" style={{ left: 430, top: 30 }} />

        {/* Generation II */}
        <PersonNode
          name="Бекнур"
          meta="Вы"
          state="registered"
          selected
          style={{ left: 150, top: 210 }}
        />
        <PersonNode name="Динара" meta="Не в приложении" state="unregistered" style={{ left: 470, top: 210 }} />

        {/* Generation III */}
        <PersonNode name="Ерлан" meta="В приложении" state="registered" style={{ left: 210, top: 390 }} />
        <PersonNode name="Мая" meta="Не в приложении" state="unregistered" style={{ left: 480, top: 390 }} />
      </div>

      {/* Zoom / fit controls (real: <Controls /> from @xyflow/react). */}
      <div className={styles.controls}>
        <button type="button" className={styles.control} aria-label="Приблизить"><PlusIcon /></button>
        <button type="button" className={styles.control} aria-label="Отдалить"><MinusIcon /></button>
        <button type="button" className={styles.control} aria-label="По размеру экрана"><FitViewIcon /></button>
      </div>

      {/* Load-more generations — ego-centric depth limit from the docs. */}
      <button type="button" className={styles.loadMore}>
        <UsersIcon />
        Показать ещё поколение
      </button>

      {/* Card-state legend — the three states from docs/dag-page.md. */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.status_registered}`} />
          В приложении — профиль и чат
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.status_unregistered}`} />
          Не в приложении — пригласить
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotDeceased}`} />
          Умерший — мемориал
        </span>
      </div>
    </div>
  )
}
