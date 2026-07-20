import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, Panel } from '@xyflow/react'

import PersonNode from './PersonNode'
import NodeDetailPanel from './NodeDetailPanel'
import PersonFormModal from './PersonFormModal'
import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { UsersIcon, DownloadIcon, CloseIcon, CheckIcon } from '../../UI/icons'
import { downloadSvgAsImage } from '../../utils/exportImage'
import { isValidFamilyCode, normalizeInviteCode } from '../../utils/validation'
import { buildFlow } from '../../utils/buildFlow'
import { NODE_SIZE } from '../../utils/radialLayout'
import {
  getGraph,
  getPerson,
  createPerson,
  updatePerson,
  deletePerson,
  generateInviteCode,
  getSuccessorCandidates,
  createMarriageProposal,
} from '../../api/graphService'
import styles from './GraphCanvas.module.css'

// Stable identity — React Flow warns if nodeTypes is rebuilt each render.
const nodeTypes = { person: PersonNode }

const RELATION_TITLES = {
  parent: 'Добавить родителя',
  child: 'Добавить ребёнка',
  spouse: 'Добавить супруга(у)',
}

/* ------------------------------------------------- SVG export (raster) --- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Rebuilds the current layout as a self-contained SVG string for rasterising.
function buildSvg(nodes, edges) {
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>'
  const pad = 60
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const maxX = Math.max(...xs) + NODE_SIZE.width + pad
  const maxY = Math.max(...ys) + NODE_SIZE.height + pad
  const W = Math.round(maxX - minX)
  const H = Math.round(maxY - minY)

  const center = (n) => ({
    x: n.position.x - minX + NODE_SIZE.width / 2,
    y: n.position.y - minY + NODE_SIZE.height / 2,
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const edgeSvg = edges
    .map((e) => {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b) return ''
      const pa = center(a)
      const pb = center(b)
      const dash = e.style?.strokeDasharray ? ` stroke-dasharray="${e.style.strokeDasharray}"` : ''
      return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="${e.style?.stroke ?? '#999'}" stroke-width="2"${dash}/>`
    })
    .join('')

  const nodeSvg = nodes
    .map((n) => {
      const p = n.person ?? n.data.person
      const x = n.position.x - minX
      const y = n.position.y - minY
      const isFocus = n.data.isFocus
      const deceased = !p.is_alive
      const nameFill = deceased ? '#8a8a8a' : '#1a1a1a'
      const initial = esc((p.full_name || '?').trim()[0] || '?')
      return `
        <g>
          <rect x="${x}" y="${y}" width="${NODE_SIZE.width}" height="${NODE_SIZE.height}" rx="14"
            fill="#ffffff" stroke="${isFocus ? '#ff7648' : 'rgba(26,26,26,0.12)'}" stroke-width="${isFocus ? 2.5 : 1}"/>
          <circle cx="${x + 34}" cy="${y + NODE_SIZE.height / 2}" r="22" fill="#f0f0f1"/>
          <text x="${x + 34}" y="${y + NODE_SIZE.height / 2 + 6}" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="600" fill="#8a8a8a">${initial}</text>
          <text x="${x + 66}" y="${y + NODE_SIZE.height / 2 + 5}" font-family="sans-serif" font-size="15" font-weight="600" fill="${nameFill}">${esc(p.full_name)}</text>
        </g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#fafafa"/>
    <g>${edgeSvg}${nodeSvg}</g>
  </svg>`
}

/* ======================================================== component ===== */
export default function GraphCanvas({ focusPerson, onGraphChanged }) {
  const focusId = focusPerson.id

  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [depth, setDepth] = useState(3)

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
  const loadGraph = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getGraph(focusId, depth)
      setGraph(data)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить дерево')
    } finally {
      setLoading(false)
    }
  }, [focusId, depth])

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

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    const flow = buildFlow(graph)
    // Fold selection into node state (we drive selection ourselves).
    flow.nodes = flow.nodes.map((n) => ({ ...n, selected: n.id === selectedId }))
    return flow
  }, [graph, selectedId])

  const hasMore = useMemo(
    () => (graph?.persons ?? []).some((p) => p.has_more_ancestors),
    [graph],
  )

  /* -------------------------------------------------------- selection --- */
  const handleNodeClick = useCallback((_, node) => {
    setSelectedId(node.id)
    setDetail(null)
    loadDetail(node.id)
  }, [loadDetail])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
  }, [])

  /* ------------------------------------------------------- mutations --- */
  const afterMutation = useCallback(async (message) => {
    setModal(null)
    if (message) flash(message)
    await loadGraph()
    if (selectedId) loadDetail(selectedId)
  }, [flash, loadGraph, selectedId, loadDetail])

  const handleAddRelative = (type) =>
    setModal({ kind: 'add', relationType: type, targetId: selectedId })

  const submitAdd = async (values) => {
    await createPerson({
      ...values,
      relation: { to_person_id: modal.targetId, type: modal.relationType },
    })
    await afterMutation(
      modal.relationType === 'spouse'
        ? 'Готово. Если супруг(а) из другой семьи — отправлен запрос на связь.'
        : 'Родственник добавлен',
    )
  }

  const submitEdit = async (values) => {
    await updatePerson(detail.id, values)
    await afterMutation('Изменения сохранены')
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

  const submitMerge = async (code) => {
    await createMarriageProposal({ person_a_id: focusId, target_invite_code: code })
    setModal(null)
    flash('Запрос на связь семей отправлен. Ожидайте подтверждения.')
  }

  /* ---------------------------------------------------------- export --- */
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadSvgAsImage(buildSvg(nodes, edges), { format: 'png', fileName: 'family-tree' })
    } finally {
      setExporting(false)
    }
  }

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
    <div className={styles.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={clearSelection}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} color="#e7e7e9" />
        <Controls showInteractive={false} />

        <Panel position="top-left" className={styles.toolbar}>
          {hasMore && (
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={() => setDepth((d) => Math.min(8, d + 2))}
            >
              <UsersIcon /> Показать ещё поколение
            </button>
          )}
          <button type="button" className={styles.toolbarBtn} onClick={() => setModal({ kind: 'merge' })}>
            <UsersIcon /> Связать с другой семьёй
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Экспорт…' : 'Скачать PNG'}
          </button>
        </Panel>

        <Panel position="bottom-right" className={styles.legend}>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_registered}`} /> В приложении</span>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_unregistered}`} /> Не в приложении</span>
          <span className={styles.legendItem}><span className={`${styles.dot} ${styles.status_deceased}`} /> Умерший</span>
        </Panel>
      </ReactFlow>

      {selectedId && (
        <NodeDetailPanel
          detail={detail}
          loading={detailLoading}
          callbacks={{
            onAddRelative: handleAddRelative,
            onEdit: () => setModal({ kind: 'edit' }),
            onRemove: handleRemove,
            onInvite: handleInvite,
            onClose: clearSelection,
          }}
        />
      )}

      {/* --------------------------------------------------------- modals */}
      {modal?.kind === 'add' && (
        <PersonFormModal
          title={RELATION_TITLES[modal.relationType]}
          submitLabel="Добавить"
          onSubmit={submitAdd}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === 'edit' && detail && (
        <PersonFormModal
          title="Изменить данные"
          submitLabel="Сохранить"
          initial={detail}
          onSubmit={submitEdit}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === 'confirmRemove' && (
        <ConfirmRemoveModal
          name={detail?.full_name}
          onConfirm={() => runRemove()}
          onClose={() => setModal(null)}
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

      {modal?.kind === 'merge' && (
        <MergeModal onSubmit={submitMerge} onClose={() => setModal(null)} />
      )}

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
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
              {c.avatar_url && <img src={c.avatar_url} alt="" className={styles.pickerAvatar} />}
              <span>{c.full_name}</span>
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

function MergeModal({ onSubmit, onClose }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const valid = isValidFamilyCode(code)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || submitting) return
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(code)
    } catch (err) {
      setError(err.message || 'Не удалось отправить запрос')
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Связать с другой семьёй" onClose={onClose}>
      <form className={styles.modalForm} onSubmit={submit} noValidate>
        <p className={styles.modalText}>
          Введите код приглашения узла другой семьи. После подтверждения их администратором деревья станут видны друг другу.
        </p>
        <input
          className={styles.formInput}
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
          placeholder="8-значный код"
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
        />
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <div className={styles.modalActions}>
          <Button type="button" variant="primary" size="sm" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="accent" size="sm" disabled={!valid || submitting}>
            {submitting ? 'Отправка…' : 'Отправить запрос'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
