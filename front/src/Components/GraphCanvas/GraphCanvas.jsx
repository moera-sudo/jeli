import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ROUTES } from '../../Routes/Routes'
import { downloadSvgAsImage } from '../../utils/exportImage'
import {
  PlusIcon,
  MinusIcon,
  UserIcon,
  UsersIcon,
  ChatIcon,
  DownloadIcon,
} from '../../UI/icons'
import styles from './GraphCanvas.module.css'

/* ------------------------------------------------------------------ data ---
   The graph is data-driven so the interactive DOM view and the raster export
   are generated from one source of truth. Coordinates live in a fixed
   840×470 stage; Y encodes generations (fixed by the backend), the union-node
   pattern (docs/dag-page.md) keeps the edges from crossing. */

const NODE_W = 156
const NODE_H = 62

const NODES = [
  { id: 'asan', name: 'Асан', relation: 'Дедушка', years: '1938–2009', birth: 'с. Каскелен', state: 'deceased', x: 170, y: 30 },
  { id: 'aigul', name: 'Айгүл', relation: 'Бабушка', years: '1942–2015', birth: 'г. Талдыкорган', state: 'deceased', x: 430, y: 30 },
  { id: 'beknur', name: 'Бекнұр', relation: 'Вы', years: 'р. 1994', birth: 'г. Алматы', state: 'registered', x: 150, y: 210, you: true },
  { id: 'dinara', name: 'Динара', relation: 'Супруга', years: 'р. 1996', birth: 'г. Тараз', state: 'unregistered', x: 470, y: 210 },
  { id: 'erlan', name: 'Ерлан', relation: 'Сын', years: 'р. 2018', birth: 'г. Алматы', state: 'registered', x: 210, y: 390 },
  { id: 'maya', name: 'Мая', relation: 'Дочь', years: 'р. 2021', birth: 'г. Алматы', state: 'unregistered', x: 480, y: 390 },
]

const EDGE_PATHS = [
  'M248 92 L378 140', // Асан → U1
  'M508 92 L378 140', // Айгүл → U1
  'M378 140 L228 210', // U1 → Бекнұр
  'M228 272 L423 320', // Бекнұр → U2
  'M548 272 L423 320', // Динара → U2
  'M423 320 L288 390', // U2 → Ерлан
  'M423 320 L558 390', // U2 → Мая
]

const UNIONS = [
  { x: 378, y: 140 },
  { x: 423, y: 320 },
]

const RELATIVE_ACTIONS = ['+ Отец', '+ Мать', '+ Супруг(а)', '+ Ребёнок', '+ Брат/сестра']

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.15

/* --------------------------------------------------------- person node --- */
function PersonNode({ node, onEnter, onLeave, onContext }) {
  const className = [styles.node, styles[node.state], node.you ? styles.nodeSelected : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      style={{ left: node.x, top: node.y }}
      onMouseEnter={(e) => onEnter(node, e.currentTarget)}
      onMouseLeave={onLeave}
      onContextMenu={(e) => onContext(node, e)}
    >
      <span className={styles.nodeAvatar} aria-hidden="true">
        <UserIcon />
        {node.state !== 'deceased' && (
          <span className={`${styles.status} ${styles[`status_${node.state}`]}`} />
        )}
      </span>
      <span className={styles.nodeText}>
        <span className={styles.nodeName}>{node.name}</span>
        <span className={styles.nodeMeta}>{node.relation}</span>
      </span>
    </div>
  )
}

/* --------------------------------------------------- raster export (svg) ---
   Rebuilds the graph as a self-contained SVG string, then rasterises it to a
   PNG/JPEG via a canvas — no external libraries. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// * PNG exports transparent and without the heading; JPEG keeps the white
// * background and "Родовое древо" title.
function buildSvg(format) {
  const bare = format === 'png'
  const W = 840
  const H = 500
  const edges = EDGE_PATHS.map((d) => `<path d="${d}" fill="none" stroke="rgba(26,26,26,0.28)" stroke-width="2"/>`).join('')
  const unions = UNIONS.map((u) => `<circle cx="${u.x}" cy="${u.y}" r="5" fill="#8a8a8a"/>`).join('')

  const cards = NODES.map((n) => {
    const cx = n.x + 31
    const cy = n.y + 31
    const nameFill = n.state === 'deceased' ? '#8a8a8a' : '#1a1a1a'
    const dot =
      n.state === 'registered'
        ? `<circle cx="${cx + 13}" cy="${cy + 13}" r="5.5" fill="#22c55e" stroke="#fff" stroke-width="2"/>`
        : n.state === 'unregistered'
          ? `<circle cx="${cx + 13}" cy="${cy + 13}" r="5.5" fill="#8a8a8a" stroke="#fff" stroke-width="2"/>`
          : ''
    return `
      <g>
        <rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8"
          fill="#ffffff" stroke="${n.you ? '#ff7648' : 'rgba(26,26,26,0.12)'}" stroke-width="${n.you ? 2 : 1}"/>
        <circle cx="${cx}" cy="${cy}" r="19" fill="#f0f0f1"/>
        <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#8a8a8a">${esc(n.name[0])}</text>
        ${dot}
        <text x="${n.x + 62}" y="${n.y + 28}" font-family="sans-serif" font-size="15" font-weight="600" fill="${nameFill}">${esc(n.name)}</text>
        <text x="${n.x + 62}" y="${n.y + 45}" font-family="sans-serif" font-size="11" fill="#8a8a8a">${esc(n.relation)}</text>
      </g>`
  }).join('')

  const background = bare ? '' : `<rect width="${W}" height="${H}" fill="#ffffff"/>`
  const heading = bare
    ? ''
    : `<text x="24" y="34" font-family="sans-serif" font-size="16" font-weight="700" fill="#1a1a1a">Родовое древо</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${background}
    ${heading}
    <g transform="translate(0,10)">${edges}${unions}${cards}</g>
  </svg>`
}

/* ============================================================ component === */
export default function GraphCanvas() {
  const canvasRef = useRef(null)
  const hideTimer = useRef(null)

  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [hovered, setHovered] = useState(null) // { node, left, top }
  const [menu, setMenu] = useState(null) // { node, left, top }
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [zoomVisible, setZoomVisible] = useState(false)
  const firstZoomRender = useRef(true)

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))

  // Reveal the zoom readout only while the user is changing the zoom; fade it
  // back out after a short idle. Skips the initial render so it stays hidden
  // until the first zoom action.
  useEffect(() => {
    if (firstZoomRender.current) {
      firstZoomRender.current = false
      return
    }
    setZoomVisible(true)
    const timer = setTimeout(() => setZoomVisible(false), 1200)
    return () => clearTimeout(timer)
  }, [zoom])

  // Rasterise + download the whole tree without blocking the UI thread, so the
  // user can keep interacting while the file is prepared and saved.
  const handleExport = useCallback(async (format) => {
    setExportOpen(false)
    setExporting(true)
    try {
      await downloadSvgAsImage(buildSvg(format), { format, fileName: 'family-tree' })
    } finally {
      setExporting(false)
    }
  }, [])

  const toggleFullscreen = () => {
    const el = canvasRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen?.()
    }
  }

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Overlays are fixed-positioned in viewport space (so the canvas's
  // overflow:hidden can't clip them); live DOM rects keep them aligned at any
  // zoom level and in fullscreen.
  const handleEnter = useCallback((node, target) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const r = target.getBoundingClientRect()
    setHovered({ node, left: r.left + r.width / 2, top: r.top })
  }, [])

  const handleLeave = useCallback(() => {
    hideTimer.current = setTimeout(() => setHovered(null), 120)
  }, [])

  const keepCard = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const handleContext = useCallback((node, e) => {
    e.preventDefault()
    setHovered(null)
    // Clamp to the viewport so the menu never runs off-screen.
    const left = Math.min(e.clientX, window.innerWidth - 212)
    const top = Math.min(e.clientY, window.innerHeight - 260)
    setMenu({ node, left: Math.max(8, left), top: Math.max(8, top) })
  }, [])

  // Dismiss the context menu / export popover on any outside interaction.
  useEffect(() => {
    if (!menu && !exportOpen) return
    const close = () => {
      setMenu(null)
      setExportOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, exportOpen])

  return (
    <div className={styles.canvas} ref={canvasRef}>
      {/* Generation rail. */}
      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railTick} style={{ top: 61 }}>I</span>
        <span className={styles.railTick} style={{ top: 241 }}>II</span>
        <span className={styles.railTick} style={{ top: 421 }}>III</span>
      </div>

      {/* Zoomable stage. */}
      <div
        className={styles.stage}
        style={{ transform: `translate(-50%, -50%) scale(${zoom})` }}
      >
        <svg className={styles.edges} viewBox="0 0 840 470" preserveAspectRatio="xMidYMid meet">
          {EDGE_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
          {UNIONS.map((u) => (
            <circle key={`${u.x}-${u.y}`} className={styles.union} cx={u.x} cy={u.y} r="5" />
          ))}
        </svg>

        {NODES.map((node) => (
          <PersonNode
            key={node.id}
            node={node}
            onEnter={handleEnter}
            onLeave={handleLeave}
            onContext={handleContext}
          />
        ))}
      </div>

      {/* Hover info modal. */}
      {hovered && (
        <div
          className={styles.hoverCard}
          style={{ left: hovered.left, top: hovered.top }}
          onMouseEnter={keepCard}
          onMouseLeave={handleLeave}
        >
          <div className={styles.hoverHead}>
            <span className={`${styles.hoverAvatar} ${styles[hovered.node.state]}`} aria-hidden="true">
              <UserIcon />
            </span>
            <div>
              <p className={styles.hoverName}>{hovered.node.name}</p>
              <p className={styles.hoverRelation}>{hovered.node.relation}</p>
            </div>
          </div>
          <dl className={styles.hoverMeta}>
            <div><dt>Годы</dt><dd>{hovered.node.years}</dd></div>
            <div><dt>Место рождения</dt><dd>{hovered.node.birth}</dd></div>
          </dl>
          {hovered.node.state === 'registered' && !hovered.node.you && (
            <Link to={ROUTES.chat} className={styles.hoverChat}>
              <ChatIcon /> Начать чат
            </Link>
          )}
          {hovered.node.you && (
            <Link to={ROUTES.profile} className={styles.hoverProfile}>
              Открыть профиль
            </Link>
          )}
          {hovered.node.state === 'unregistered' && (
            <button type="button" className={styles.hoverInvite}>Пригласить</button>
          )}
          {hovered.node.state === 'deceased' && (
            <p className={styles.hoverMemorial}>Мемориальная страница</p>
          )}
        </div>
      )}

      {/* Right-click: add-relative menu. */}
      {menu && (
        <div
          className={styles.menu}
          style={{ left: menu.left, top: menu.top }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className={styles.menuTitle}>{menu.node.name} · добавить</p>
          {RELATIVE_ACTIONS.map((label) => (
            <button
              key={label}
              type="button"
              className={styles.menuItem}
              onClick={() => setMenu(null)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Controls: zoom, fit, fullscreen, export. */}
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={zoomIn} aria-label="Приблизить"><PlusIcon /></button>
        <button type="button" className={styles.control} onClick={zoomOut} aria-label="Отдалить"><MinusIcon /></button>
        <button
          type="button"
          className={`${styles.control} ${fullscreen ? styles.controlActive : ''}`}
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
        >
          <FullscreenIcon />
        </button>
        <div className={styles.exportWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`${styles.control} ${exportOpen ? styles.controlActive : ''}`}
            onClick={() => setExportOpen((v) => !v)}
            disabled={exporting}
            aria-label="Экспорт древа"
            aria-expanded={exportOpen}
          >
            <DownloadIcon />
          </button>
          {exportOpen && (
            <div className={styles.exportMenu} role="menu">
              <span className={styles.exportHint}>Скачать как</span>
              <button type="button" role="menuitem" onClick={() => handleExport('png')}>PNG</button>
              <button type="button" role="menuitem" onClick={() => handleExport('jpeg')}>JPEG</button>
            </div>
          )}
        </div>
      </div>

      {/* Zoom readout — visible only while zooming. */}
      <span className={`${styles.zoomBadge} ${zoomVisible ? styles.zoomBadgeVisible : ''}`} aria-hidden={!zoomVisible}>
        {Math.round(zoom * 100)}%
      </span>

      {/* Load-more generations. */}
      <button type="button" className={styles.loadMore}>
        <UsersIcon />
        Показать ещё поколение
      </button>

      {/* Card-state legend. */}
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

/* Fullscreen toggle glyph (local to keep the shared icon set lean). */
function FullscreenIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
