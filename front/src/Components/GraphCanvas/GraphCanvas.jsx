import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Panel, ReactFlowProvider, useReactFlow, useViewport } from '@xyflow/react'

import PersonNode from './PersonNode'
import UnionNode from './UnionNode'
import PersonProfileModal from './PersonProfileModal'
import MemberProfileModal from './MemberProfileModal'
import PersonFormModal from './PersonFormModal'
import AddMemberModal from './AddMemberModal'
import MarriageModal from './MarriageModal'
import RelationshipEdgeModal from './RelationshipEdgeModal'
import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { DownloadIcon, CloseIcon, CheckIcon, PlusIcon, MinusIcon, FullscreenIcon } from '../../UI/icons'
import { downloadSvgAsImage } from '../../utils/exportImage'
import { buildFlow, NODE_SIZE, UNION_SIZE } from '../../utils/buildFlow'
import { formatPersonName } from '../../utils/fullName'
import { resolveMediaUrl } from '../../api/mediaService'
import { createChat } from '../../api/messengerService'
import { ROUTES, chatPath } from '../../Routes/Routes'
import {
  getHouseholdGraph,
  getPerson,
  createPerson,
  createRelationship,
  updateRelationship,
  deleteRelationship,
  insertPersonBetween,
  updatePerson,
  deletePerson,
  generateInviteCode,
  getSuccessorCandidates,
  listCollaborators,
  grantCollaborator,
  revokeCollaborator,
} from '../../api/graphService'
import styles from './GraphCanvas.module.css'

// Stable identity — React Flow warns if nodeTypes is rebuilt each render.
const nodeTypes = { person: PersonNode, union: UnionNode }

/* ------------------------------------------------- SVG export (raster) --- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Design tokens mirrored from the app so the export matches the web card 1:1.
const CARD = { fill: '#ffffff', fillDeceased: '#f6f4f1', border: '#e0e0e0', accent: '#ff7648', radius: 14 }
const AVATAR_R = 30
const STATUS = { registered: '#22c55e', unregistered: '#ef4444' }

/**
 * Stroke attributes for an exported edge. Flattens any `rgba()` colour onto an
 * opaque equivalent (composited over white) — a transparent PNG drops
 * translucent pixels against dark/checkerboard backdrops, so the gray descent
 * lines would otherwise disappear even though they show over JPEG's white fill.
 */
function strokeAttrs(style) {
  const raw = style?.stroke ?? '#999999'
  const width = style?.strokeWidth ?? 2
  const dash = style?.strokeDasharray ? ` stroke-dasharray="${style.strokeDasharray}"` : ''
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(raw)
  let color = raw
  if (m) {
    const a = m[4] != null ? Number(m[4]) : 1
    const flat = (c) => Math.round(Number(c) * a + 255 * (1 - a))
    color = `rgb(${flat(m[1])},${flat(m[2])},${flat(m[3])})`
  }
  return ` stroke="${color}" stroke-width="${width}"${dash}`
}

/** Fetches an image URL and resolves to a `data:` URL so it embeds inline. */
async function fetchAsDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/** The lucide "user" glyph used as the avatar placeholder, centred on (cx, cy). */
function userGlyphSvg(cx, cy) {
  const s = 30 / 24 // web renders the icon at 30px inside the 60px circle
  return `<g transform="translate(${cx - 15}, ${cy - 15}) scale(${s})" fill="none" stroke="#8a8a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </g>`
}

/** Greedy word-wrap of a name into at most `maxLines` centred lines. */
function wrapName(name, maxChars = 20, maxLines = 3) {
  const lines = []
  let cur = ''
  for (const word of String(name).split(/\s+/).filter(Boolean)) {
    const cand = cur ? `${cur} ${word}` : word
    if (cand.length > maxChars && cur) { lines.push(cur); cur = word } else cur = cand
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, maxChars - 1)}…`
  }
  return lines.length ? lines : ['Без имени']
}

/** One family card, drawn to match the web `PersonNode` (card + avatar + dot + name). */
function personCardSvg(p, x, y, isFocus, avatarDataUrl) {
  const w = NODE_SIZE.width
  const h = NODE_SIZE.height
  const cx = x + w / 2
  const deceased = !p.is_alive
  const state = deceased ? 'deceased' : p.is_registered ? 'registered' : 'unregistered'
  const acx = cx
  const acy = y + 52 // avatar centre
  const clipId = `av-${p.id}`

  // Avatar: the real photo clipped to a circle, or the grey placeholder glyph.
  const avatar = avatarDataUrl
    ? `<clipPath id="${clipId}"><circle cx="${acx}" cy="${acy}" r="${AVATAR_R}"/></clipPath>
       <circle cx="${acx}" cy="${acy}" r="${AVATAR_R}" fill="#f0f0f1"/>
       <image x="${acx - AVATAR_R}" y="${acy - AVATAR_R}" width="${AVATAR_R * 2}" height="${AVATAR_R * 2}"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" xlink:href="${avatarDataUrl}"/>`
    : `<circle cx="${acx}" cy="${acy}" r="${AVATAR_R}" fill="#f0f0f1"/>${userGlyphSvg(acx, acy)}`

  // Status dot — only for living people (deceased get none), bottom-right of the avatar.
  const dot = p.is_alive
    ? `<circle cx="${acx + 20.5}" cy="${acy + 20.5}" r="7.5" fill="${STATUS[state]}" stroke="#ffffff" stroke-width="2"/>`
    : ''

  // Name — wrapped and vertically centred in the lower half of the card.
  const lines = wrapName(formatPersonName(p, 'Без имени'))
  const nameFill = deceased ? '#8a8a8a' : '#1a1a1a'
  const firstBaseline = y + 104 - (lines.length - 1) * 8 + 5
  const nameSvg = lines
    .map((line, i) =>
      `<text x="${cx}" y="${firstBaseline + i * 16}" text-anchor="middle" font-family="sans-serif" font-size="14.5" font-weight="700" fill="${nameFill}">${esc(line)}</text>`)
    .join('')

  const cardFill = deceased ? CARD.fillDeceased : CARD.fill
  const stroke = isFocus ? CARD.accent : CARD.border
  const strokeW = isFocus ? 2 : 1

  return `<g>
    <rect x="${x}" y="${y + 3}" width="${w}" height="${h}" rx="${CARD.radius}" fill="#eeeeee"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${CARD.radius}" fill="${cardFill}" stroke="${stroke}" stroke-width="${strokeW}"/>
    ${avatar}
    ${dot}
    ${nameSvg}
  </g>`
}

/**
 * Rebuilds the current layout as a self-contained SVG string for rasterising,
 * matching the on-screen graph (same cards, avatars, status dots, focus badge).
 * PNG exports transparent and without a heading; JPEG paints a white background
 * and adds the "Родовое древо" title. `avatarMap` holds pre-fetched data URLs
 * (person.avatar_url → data URL) so photos embed inline instead of tainting the
 * canvas at raster time.
 */
function buildSvg(nodes, edges, format, avatarMap = new Map()) {
  const personNodes = nodes.filter((n) => n.data?.person)
  if (!personNodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
  const bare = format === 'png'
  const pad = 60
  const xs = personNodes.map((n) => n.position.x)
  const ys = personNodes.map((n) => n.position.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const maxX = Math.max(...xs) + NODE_SIZE.width + pad
  const maxY = Math.max(...ys) + NODE_SIZE.height + pad
  const W = Math.round(maxX - minX)
  const H = Math.round(maxY - minY) + (bare ? 0 : 30)
  const shiftY = bare ? 0 : 30

  // Size-aware centre — union nodes are tiny, so edges meet at their true point.
  const center = (n) => {
    const size = n.type === 'union' ? UNION_SIZE : NODE_SIZE
    return {
      x: n.position.x - minX + size.width / 2,
      y: n.position.y - minY + size.height / 2 + shiftY,
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const edgeSvg = edges
    .map((e) => {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b) return ''
      const pa = center(a)
      const pb = center(b)
      return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"${strokeAttrs(e.style)}/>`
    })
    .join('')

  const nodeSvg = personNodes
    .map((n) => {
      const p = n.data.person
      const x = n.position.x - minX
      const y = n.position.y - minY + shiftY
      return personCardSvg(p, x, y, n.data.isFocus, avatarMap.get(p.avatar_url))
    })
    .join('')

  const background = bare ? '' : `<rect width="${W}" height="${H}" fill="#ffffff"/>`
  const heading = bare
    ? ''
    : `<text x="${pad}" y="${pad}" font-family="sans-serif" font-size="20" font-weight="700" fill="#1a1a1a">Родовое древо</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${background}
    ${heading}
    <g>${edgeSvg}${nodeSvg}</g>
  </svg>`
}

/* ==================================================== controls cluster === */
/**
 * Bottom-left controls: zoom in, zoom out, fullscreen, export — in that order.
 * The zoom percentage flashes briefly whenever the zoom changes.
 */
function GraphControls({ canvasRef, onExport, exporting }) {
  const { zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()

  const [badgeVisible, setBadgeVisible] = useState(false)
  const firstZoom = useRef(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  // Reveal the zoom readout only while the zoom is actually changing.
  useEffect(() => {
    if (firstZoom.current) {
      firstZoom.current = false
      return
    }
    setBadgeVisible(true)
    const timer = setTimeout(() => setBadgeVisible(false), 1200)
    return () => clearTimeout(timer)
  }, [zoom])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!exportOpen) return
    const close = () => setExportOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [exportOpen])

  const toggleFullscreen = () => {
    const el = canvasRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  const runExport = (fmt) => {
    setExportOpen(false)
    onExport(fmt)
  }

  return (
    <>
      <Panel position="bottom-left" className={styles.controls}>
        <button type="button" className={styles.control} onClick={() => zoomIn()} aria-label="Приблизить">
          <PlusIcon />
        </button>
        <button type="button" className={styles.control} onClick={() => zoomOut()} aria-label="Отдалить">
          <MinusIcon />
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
        >
          <FullscreenIcon />
        </button>
        <div className={styles.exportWrap} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.control}
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
              <button type="button" role="menuitem" onClick={() => runExport('png')}>PNG</button>
              <button type="button" role="menuitem" onClick={() => runExport('jpeg')}>JPEG</button>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        position="top-center"
        className={`${styles.zoomBadge} ${badgeVisible ? styles.zoomBadgeVisible : ''}`}
      >
        {Math.round(zoom * 100)}%
      </Panel>
    </>
  )
}

/* ======================================================== component ===== */
function GraphCanvasInner({ focusPerson, isOwner = false, currentUserId, onGraphChanged }) {
  const focusId = focusPerson.id
  const navigate = useNavigate()
  const { setCenter } = useReactFlow()
  const canvasRef = useRef(null)

  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // User ids the owner has delegated edit rights to (owner view only).
  const [collaboratorIds, setCollaboratorIds] = useState([])

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [modal, setModal] = useState(null) // { kind, ... }
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const flash = useCallback((message) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }, [])

  /* ------------------------------------------------------------ data --- */
  // Full household graph (unbounded) so no relative is ever cut off by a depth
  // horizon — siblings, nephews and in-laws all load.
  const loadGraph = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getHouseholdGraph(focusId)
      setGraph(data)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить дерево')
    } finally {
      setLoading(false)
    }
  }, [focusId])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true)
    try {
      setDetail(await getPerson(id))
    } catch (err) {
      flash(err.message || 'Не удалось загрузить карточку')
    } finally {
      setDetailLoading(false)
    }
  }, [flash])

  // Only the graph owner can delegate edit rights, so only they load the list.
  const loadCollaborators = useCallback(async () => {
    if (!isOwner) return
    try {
      const list = await listCollaborators()
      setCollaboratorIds(list.map((c) => c.collaborator_user_id))
    } catch { /* non-critical: grant/revoke still surface their own errors */ }
  }, [isOwner])

  useEffect(() => {
    loadCollaborators()
  }, [loadCollaborators])

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    const flow = buildFlow(graph)
    // Fold selection into node state (we drive selection ourselves).
    flow.nodes = flow.nodes.map((n) => ({ ...n, selected: n.id === selectedId }))
    return flow
  }, [graph, selectedId])

  const nameById = useMemo(() => {
    const m = new Map()
    for (const p of graph?.persons ?? []) m.set(p.id, formatPersonName(p, 'Без имени'))
    return m
  }, [graph])

  // Open the tree at 100% zoom centred on the current user. Runs once per graph
  // (re)load — keyed on the graph object, so selecting a card doesn't recentre.
  const centeredRef = useRef(null)
  useEffect(() => {
    if (!graph || centeredRef.current === graph || !nodes.length) return
    const focusNode = nodes.find((n) => n.data?.isFocus)
    if (!focusNode) return
    centeredRef.current = graph
    setCenter(
      focusNode.position.x + NODE_SIZE.width / 2,
      focusNode.position.y + NODE_SIZE.height / 2,
      { zoom: 1, duration: 300 },
    )
  }, [graph, nodes, setCenter])

  /* -------------------------------------------------------- selection --- */
  // Left-click: clicking your own node jumps to the profile page; clicking
  // anyone else opens their full-profile modal over the card. Union junctions
  // aren't people — ignore them.
  const handleNodeClick = useCallback((_, node) => {
    if (node.type === 'union') {
      // The owner can edit/remove a real marriage from its junction.
      if (isOwner && node.data?.spouseRelId) setModal({ kind: 'marriage', relId: node.data.spouseRelId })
      return
    }
    if (node.id === focusId) {
      navigate(ROUTES.profile)
      return
    }
    setSelectedId(node.id)
    setDetail(null)
    loadDetail(node.id)
    setModal({ kind: 'profile' })
  }, [loadDetail, focusId, navigate, isOwner])

  // Owner-only: clicking a descent line manages that parent link (insert a
  // generation between, or remove a mistaken link).
  const handleEdgeClick = useCallback((_, edge) => {
    if (!isOwner || edge.data?.kind !== 'descent') return
    const links = (edge.data.links ?? []).map((l) => ({ ...l, parentName: nameById.get(l.parentId) ?? 'родитель' }))
    if (!links.length) return
    setModal({ kind: 'edge', childId: edge.data.childId, childName: nameById.get(edge.data.childId) ?? 'ребёнок', links })
  }, [isOwner, nameById])

  // Right-click suppresses the browser menu and, for the graph owner only,
  // opens the add-relative modal. Regular members never see the add window.
  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault()
    if (node.type === 'union' || !isOwner) return
    setModal({ kind: 'add', targetId: node.id, targetPerson: node.data.person })
  }, [isOwner])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  /* ------------------------------------------------------- mutations --- */
  const afterMutation = useCallback(async (message) => {
    setModal(null)
    if (message) flash(message)
    await loadGraph()
    if (selectedId) loadDetail(selectedId)
  }, [flash, loadGraph, selectedId, loadDetail])

  // Kinship read straight from the loaded edges (child_of: from = child → to = parent).
  const parentIdsOf = useCallback(
    (personId) =>
      (graph?.relationships ?? [])
        .filter((r) => r.type === 'child_of' && r.from_person_id === personId)
        .map((r) => r.to_person_id),
    [graph],
  )
  const childIdsOf = useCallback(
    (personId) =>
      (graph?.relationships ?? [])
        .filter((r) => r.type === 'child_of' && r.to_person_id === personId)
        .map((r) => r.from_person_id),
    [graph],
  )
  const siblingIdsOf = useCallback(
    (personId) => {
      const ids = new Set()
      for (const parentId of parentIdsOf(personId)) {
        for (const childId of childIdsOf(parentId)) if (childId !== personId) ids.add(childId)
      }
      return [...ids]
    },
    [parentIdsOf, childIdsOf],
  )

  // The backend only knows parent/child/spouse, so wider roles attach the new
  // person to an intermediate relative (a parent, grandparent, child or sibling
  // of the clicked node). `anchor` says which relative to attach to; `relation`
  // and `gender` are then read relative to that anchor.
  const ROLE_MAP = {
    father: { gender: 'male', anchor: 'self', relation: 'parent' },
    mother: { gender: 'female', anchor: 'self', relation: 'parent' },
    grandfather: { gender: 'male', anchor: 'parent', relation: 'parent' },
    grandmother: { gender: 'female', anchor: 'parent', relation: 'parent' },
    brother: { gender: 'male', anchor: 'parent', relation: 'child' },
    sister: { gender: 'female', anchor: 'parent', relation: 'child' },
    uncle: { gender: 'male', anchor: 'grandparent', relation: 'child' },
    aunt: { gender: 'female', anchor: 'grandparent', relation: 'child' },
    spouse: { gender: null, anchor: 'self', relation: 'spouse' },
    son: { gender: 'male', anchor: 'self', relation: 'child' },
    daughter: { gender: 'female', anchor: 'self', relation: 'child' },
    grandson: { gender: 'male', anchor: 'child', relation: 'child' },
    granddaughter: { gender: 'female', anchor: 'child', relation: 'child' },
    nephew: { gender: 'male', anchor: 'sibling', relation: 'child' },
    niece: { gender: 'female', anchor: 'sibling', relation: 'child' },
  }
  const ANCHOR_ERROR = {
    parent: 'Сначала добавьте родителя — эта роль привязывается к нему',
    grandparent: 'Сначала добавьте дедушку или бабушку — эта роль привязывается к ним',
    child: 'Сначала добавьте ребёнка — эта роль привязывается к нему',
    sibling: 'Сначала добавьте брата или сестру — эта роль привязывается к ним',
  }

  // Add a relative in one of two modes: create a fresh card, or link an
  // existing person from the tree into the chosen role (so, e.g., a sibling can
  // reuse the same parents instead of spawning a duplicate).
  const submitAdd = async ({ mode, role, values, personId }) => {
    const cfg = ROLE_MAP[role]
    if (!cfg) throw new Error('Выберите, кем приходится новый родственник')

    const targetId = modal.targetId
    const targetGender = modal.targetPerson?.gender

    const anchorIds = {
      self: [targetId],
      parent: parentIdsOf(targetId),
      grandparent: parentIdsOf(targetId).flatMap(parentIdsOf),
      child: childIdsOf(targetId),
      sibling: siblingIdsOf(targetId),
    }[cfg.anchor]

    if (!anchorIds?.length) throw new Error(ANCHOR_ERROR[cfg.anchor] ?? 'Не удалось определить связь')
    const anchorId = anchorIds[0]

    if (mode === 'select') {
      if (cfg.relation === 'spouse') {
        throw new Error('Супруга нельзя выбрать из существующих — создайте карточку или свяжите семьи по коду')
      }
      // The only linkable relation is child_of (from = child, to = parent);
      // a "parent" role means the picked person is the parent of the anchor.
      const from_person_id = cfg.relation === 'parent' ? anchorId : personId
      const to_person_id = cfg.relation === 'parent' ? personId : anchorId
      await createRelationship({ from_person_id, to_person_id })
      await afterMutation('Родственник связан')
      return
    }

    const gender =
      cfg.relation === 'spouse' && cfg.gender == null
        ? targetGender === 'male' ? 'female' : 'male'
        : cfg.gender
    const relation = { to_person_id: anchorId, type: cfg.relation }

    await createPerson({ ...values, gender, relation })
    await afterMutation('Родственник добавлен')
  }

  const submitEdit = async (values) => {
    await updatePerson(detail.id, values)
    await afterMutation('Изменения сохранены')
  }

  /* ------------------------------------------------- marriage / edge ops --- */
  const submitMarriageSave = async (values) => {
    await updateRelationship(modal.relId, values)
    await afterMutation('Брак обновлён')
  }
  const submitMarriageDelete = async () => {
    await deleteRelationship(modal.relId)
    await afterMutation('Связь удалена')
  }
  const submitInsertBetween = async ({ values, parentId }) => {
    await insertPersonBetween({ ...values, parent_id: parentId, child_id: modal.childId })
    await afterMutation('Поколение добавлено')
  }
  const submitDeleteLink = async (relId) => {
    await deleteRelationship(relId)
    await afterMutation('Связь удалена')
  }

  const handleRemove = () => setModal({ kind: 'confirmRemove' })

  const runRemove = async (newOwnerUserId) => {
    const id = detail.id
    const removingSelf = detail.linked_user_id === focusPerson.linked_user_id
    try {
      await deletePerson(id, newOwnerUserId)
      setModal(null)
      clearSelection()
      flash('Родственник удалён')
      if (removingSelf) {
        onGraphChanged?.()
      } else {
        await loadGraph()
      }
    } catch (err) {
      if (err.status === 409) {
        // Self-delete needs a successor — offer the picker.
        try {
          const candidates = await getSuccessorCandidates()
          if (candidates.length) {
            setModal({ kind: 'successor', candidates })
            return
          }
        } catch { /* fall through to the generic error */ }
      }
      flash(err.message || 'Не удалось удалить')
    }
  }

  const handleInvite = async () => {
    try {
      const code = await generateInviteCode(detail.id)
      setModal({ kind: 'invite', code })
    } catch (err) {
      flash(err.message || 'Не удалось получить код')
    }
  }

  // Open (or create) the chat with a registered relative and go to it.
  const handleOpenChat = async () => {
    if (!detail?.id) return
    try {
      const chat = await createChat(detail.id)
      navigate(chatPath(chat.id))
    } catch (err) {
      flash(err.message || 'Не удалось открыть чат')
    }
  }

  // Owner delegates (or revokes) edit rights so a registered relative can also
  // build the tree — the sanctioned way around the owner-only edit restriction.
  const handleGrantCollaborator = async () => {
    try {
      await grantCollaborator(detail.id)
      await loadCollaborators()
      await loadDetail(detail.id)
      flash('Права редактирования выданы')
    } catch (err) {
      flash(err.message || 'Не удалось выдать права')
    }
  }

  const handleRevokeCollaborator = async () => {
    try {
      await revokeCollaborator(detail.linked_user_id)
      await loadCollaborators()
      await loadDetail(detail.id)
      flash('Права редактирования отозваны')
    } catch (err) {
      flash(err.message || 'Не удалось отозвать права')
    }
  }

  /* ---------------------------------------------------------- export --- */
  const [exporting, setExporting] = useState(false)
  const handleExport = useCallback(async (format) => {
    setExporting(true)
    try {
      // Pre-fetch avatars as data URLs — external image URLs either fail to load
      // or taint the canvas during rasterization, so they must be embedded inline.
      const urls = new Set()
      for (const n of nodes) {
        const url = n.data?.person?.avatar_url
        if (url) urls.add(url)
      }
      const avatarMap = new Map()
      await Promise.all(
        [...urls].map(async (url) => {
          try { avatarMap.set(url, await fetchAsDataUrl(resolveMediaUrl(url))) }
          catch { /* fall back to the placeholder glyph for this card */ }
        }),
      )
      await downloadSvgAsImage(buildSvg(nodes, edges, format, avatarMap), { format, fileName: 'family-tree' })
    } finally {
      setExporting(false)
    }
  }, [nodes, edges])

  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), [])

  /* ------------------------------------------------------------ render --- */
  if (loading && !graph) {
    return <div className={styles.canvas}><Loader /></div>
  }
  if (error) {
    return (
      <div className={styles.canvas}>
        <div className={styles.centerMessage}>
          <p>{error}</p>
          <Button variant="accent" size="sm" onClick={loadGraph}>Повторить</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.canvas} ref={canvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={handleEdgeClick}
        onPaneClick={clearSelection}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} color="#e7e7e9" />

        <GraphControls canvasRef={canvasRef} onExport={handleExport} exporting={exporting} />

        <Panel position="bottom-right" className={styles.legend}>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_registered}`} /> В приложении</span>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_unregistered}`} /> Не в приложении</span>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_deceased}`} /> Умерший</span>
        </Panel>
      </ReactFlow>

      {/* --------------------------------------------------------- modals */}
      {/* Left-click: registered relatives get their full profile with a chat
          button; unregistered records get the editable card. */}
      {modal?.kind === 'profile' && (
        detail?.linked_user_id ? (
          <MemberProfileModal
            userId={detail.linked_user_id}
            onOpenChat={handleOpenChat}
            onClose={() => { closeModal(); clearSelection() }}
          />
        ) : (
          <PersonProfileModal
            detail={detail}
            loading={detailLoading}
            isOwner={isOwner}
            currentUserId={currentUserId}
            isCollaborator={!!detail?.linked_user_id && collaboratorIds.includes(detail.linked_user_id)}
            onClose={() => { closeModal(); clearSelection() }}
            onEdit={() => setModal({ kind: 'edit' })}
            onRemove={handleRemove}
            onInvite={handleInvite}
            onGrantCollaborator={handleGrantCollaborator}
            onRevokeCollaborator={handleRevokeCollaborator}
          />
        )
      )}

      {/* Right-click: add a new family member (create) or link an existing one. */}
      {modal?.kind === 'add' && (
        <AddMemberModal
          targetName={formatPersonName(modal.targetPerson, 'родственнику')}
          people={(graph?.persons ?? []).filter((p) => p.id !== modal.targetId)}
          onSubmit={submitAdd}
          onClose={closeModal}
        />
      )}

      {/* Click a marriage junction (owner): edit or remove the marriage. */}
      {modal?.kind === 'marriage' && (
        <MarriageModal
          onSave={submitMarriageSave}
          onDelete={submitMarriageDelete}
          onClose={closeModal}
        />
      )}

      {/* Click a descent line (owner): insert a generation between, or unlink. */}
      {modal?.kind === 'edge' && (
        <RelationshipEdgeModal
          childName={modal.childName}
          links={modal.links}
          onInsert={submitInsertBetween}
          onDeleteLink={submitDeleteLink}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'edit' && detail && (
        <PersonFormModal
          title="Изменить данные"
          submitLabel="Сохранить"
          initial={detail}
          personId={detail.id}
          onAvatarChange={async () => { await loadGraph(); await loadDetail(detail.id) }}
          onSubmit={submitEdit}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'confirmRemove' && (
        <ConfirmRemoveModal
          name={formatPersonName(detail)}
          onConfirm={() => runRemove()}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'successor' && (
        <SuccessorModal
          candidates={modal.candidates}
          onPick={(userId) => runRemove(userId)}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === 'invite' && (
        <InviteCodeModal code={modal.code} onClose={() => setModal(null)} onCopied={() => flash('Код скопирован')} />
      )}

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  )
}

/** Public component — wraps the graph in its own React Flow provider so the
 *  controls can read/drive the viewport zoom. */
export default function GraphCanvas(props) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

/* ------------------------------------------------------- small modals --- */
function ModalShell({ title, onClose, children }) {
  return (
    <div className={styles.modalBackdrop} onPointerDown={onClose}>
      <div className={styles.modalCard} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button type="button" className={styles.modalClose} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

function ConfirmRemoveModal({ name, onConfirm, onClose }) {
  return (
    <ModalShell title="Удалить родственника" onClose={onClose}>
      <p className={styles.modalText}>
        Удалить «{name}» из дерева? Если к узлу привязан аккаунт, он будет только отвязан, а данные сохранятся.
      </p>
      <div className={styles.modalActions}>
        <Button variant="primary" size="sm" onClick={onClose}>Отмена</Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>Удалить</Button>
      </div>
    </ModalShell>
  )
}

function SuccessorModal({ candidates, onPick, onClose }) {
  const [picked, setPicked] = useState(candidates[0]?.id ?? '')
  return (
    <ModalShell title="Кому передать управление" onClose={onClose}>
      <p className={styles.modalText}>
        Вы удаляете свой узел. Выберите, кто станет владельцем дерева.
      </p>
      <ul className={styles.pickerList}>
        {candidates.map((c) => (
          <li key={c.id}>
            <label className={styles.pickerItem}>
              <input type="radio" name="successor" checked={picked === c.id} onChange={() => setPicked(c.id)} />
              {c.avatar_url && <img src={resolveMediaUrl(c.avatar_url)} alt="" className={styles.pickerAvatar} />}
              <span>{formatPersonName(c, 'Без имени')}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className={styles.modalActions}>
        <Button variant="primary" size="sm" onClick={onClose}>Отмена</Button>
        <Button variant="danger" size="sm" disabled={!picked} onClick={() => onPick(picked)}>
          Передать и удалить
        </Button>
      </div>
    </ModalShell>
  )
}

function InviteCodeModal({ code, onClose, onCopied }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      onCopied()
    } catch { /* clipboard may be blocked; the code is shown for manual copy */ }
  }
  return (
    <ModalShell title="Код приглашения" onClose={onClose}>
      <p className={styles.modalText}>
        Передайте этот код родственнику — он введёт его при регистрации или на экране «Присоединиться».
      </p>
      <div className={styles.codeBox}>{code}</div>
      <div className={styles.modalActions}>
        <Button variant="accent" size="sm" trailingIcon={<CheckIcon />} onClick={copy}>Скопировать</Button>
      </div>
    </ModalShell>
  )
}
