import { useCallback, useEffect, useState } from 'react'

import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { CloseIcon, UsersIcon, UserIcon } from '../../UI/icons'
import {
  getUserMatches,
  getMarriageProposals,
  getPerson,
  getMyPerson,
  confirmMatch,
  rejectMatch,
  confirmProposal,
  rejectProposal,
} from '../../api/graphService'
import { formatPersonName } from '../../utils/fullName'
import { resolveMediaUrl } from '../../api/mediaService'
import styles from './MatchesPanel.module.css'

const STATUS_LABEL = {
  high_confidence: 'Высокая уверенность',
  possible_match: 'Возможное совпадение',
  confirmed: 'Подтверждённый родственник',
}

function yearsText(p) {
  const b = p?.birth_year_value
  const d = p?.death_year_value
  if (b && d) return `${b}–${d}`
  if (b) return `род. ${b}`
  if (d) return `ум. ${d}`
  return ''
}

/**
 * Home-only side panel. Two tabs:
 *  - «Совпадения» — relative-match suggestions (all users). Currently empty
 *    until the matching pipeline ships, but wired to the real endpoint.
 *  - «Запросы» — incoming cross-family merge requests awaiting the admin's
 *    approval (rendered only for graph owners / admins).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object} props.user       Current UserMe (for `getUserMatches`).
 * @param {boolean} props.isAdmin   Owner of their own graph → gets the Requests tab.
 * @param {() => void} [props.onGraphRefreshNeeded]  Confirming a match or a marriage
 *   proposal changes the graph (a new match_confirmed bridge / spouse_of edge) — this
 *   tells GraphCanvas to reload, since it otherwise only re-fetches on focus change.
 */
export default function MatchesPanel({ open, onClose, user, isAdmin, onGraphRefreshNeeded }) {
  const [tab, setTab] = useState('matches')
  const [matches, setMatches] = useState(null)
  const [proposals, setProposals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // My graph owner id — used to tell which anchor of a match is the RELATIVE
  // (the one that isn't in my own graph) vs my own person.
  const [myOwnerId, setMyOwnerId] = useState(null)

  useEffect(() => {
    if (!open) return
    getMyPerson().then((p) => setMyOwnerId(p?.owner_user_id ?? null)).catch(() => {})
  }, [open])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'matches') {
        setMatches(await getUserMatches(user.id))
      } else {
        setProposals(await getMarriageProposals())
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить')
    } finally {
      setLoading(false)
    }
  }, [tab, user.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // Non-admins never see the Requests tab; keep them on Matches.
  const activeTab = !isAdmin && tab === 'requests' ? 'matches' : tab

  const incoming = (proposals ?? []).filter(
    (p) => p.status === 'pending' && p.proposer_user_id !== user.id,
  )
  const outgoing = (proposals ?? []).filter(
    (p) => p.status === 'pending' && p.proposer_user_id === user.id,
  )

  const act = async (fn, id, { refreshGraph = false } = {}) => {
    try {
      await fn(id)
      await load()
      if (refreshGraph) onGraphRefreshNeeded?.()
    } catch (err) {
      setError(err.message || 'Действие не выполнено')
    }
  }

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`${styles.panel} ${open ? styles.open : ''}`} role="dialog" aria-label="Совпадения и запросы" aria-hidden={!open}>
        <header className={styles.head}>
          <h2 className={styles.title}>Совпадения</h2>
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'matches'}
            className={`${styles.tab} ${activeTab === 'matches' ? styles.tabActive : ''}`}
            onClick={() => setTab('matches')}
          >
            Совпадения
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              className={`${styles.tab} ${activeTab === 'requests' ? styles.tabActive : ''}`}
              onClick={() => setTab('requests')}
            >
              Запросы{incoming.length > 0 && <span className={styles.count}>{incoming.length}</span>}
            </button>
          )}
        </div>

        <div className={styles.body}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {loading ? (
            <Loader />
          ) : activeTab === 'matches' ? (
            <MatchesList matches={matches} myOwnerId={myOwnerId} onConfirm={(id) => act(confirmMatch, id, { refreshGraph: true })} onReject={(id) => act(rejectMatch, id)} />
          ) : (
            <RequestsList
              incoming={incoming}
              outgoing={outgoing}
              onConfirm={(id) => act(confirmProposal, id, { refreshGraph: true })}
              onReject={(id) => act(rejectProposal, id)}
            />
          )}
        </div>
      </aside>
    </>
  )
}

function MatchesList({ matches, myOwnerId, onConfirm, onReject }) {
  if (!matches?.length) {
    return (
      <div className={styles.empty}>
        <UsersIcon />
        <p>Пока нет предложений о родстве.</p>
        <span>Как только система найдёт возможных родственников, они появятся здесь.</span>
      </div>
    )
  }
  return (
    <ul className={styles.list}>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} myOwnerId={myOwnerId} onConfirm={onConfirm} onReject={onReject} />
      ))}
    </ul>
  )
}

/**
 * A single match: the potential relative's full card + the reasoning (the
 * matched ancestor chain) behind why the system thinks you're related.
 */
function MatchCard({ match, myOwnerId, onConfirm, onReject }) {
  const [relative, setRelative] = useState(null)
  const [showWhy, setShowWhy] = useState(false)

  // The match links two people; show the one that ISN'T in my own graph.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [a, b] = await Promise.all([getPerson(match.person_a_id), getPerson(match.person_b_id)])
        const rel = myOwnerId && a.owner_user_id !== myOwnerId ? a : b
        if (active) setRelative(rel)
      } catch { /* keep the reasoning even if the profile fetch fails */ }
    })()
    return () => { active = false }
  }, [match.person_a_id, match.person_b_id, myOwnerId])

  const ev = match.evidence || {}
  const chain = Array.isArray(ev.chain) ? ev.chain : []
  const place = relative ? [relative.birth_region, relative.birth_country].filter(Boolean).join(', ') : ''
  const rod = relative ? [relative.ru, relative.tribe, relative.zhuz].filter(Boolean).join(' · ') : ''
  const sub = [yearsText(relative), place].filter(Boolean).join(' · ')

  return (
    <li className={styles.item}>
      <div className={styles.matchHead}>
        <span className={styles.matchAvatar} aria-hidden="true">
          {relative?.avatar_url ? <img src={resolveMediaUrl(relative.avatar_url)} alt="" /> : <UserIcon />}
        </span>
        <div className={styles.matchIdent}>
          <p className={styles.matchName}>{relative ? formatPersonName(relative, 'Возможный родственник') : 'Загрузка…'}</p>
          {sub && <p className={styles.matchMeta}>{sub}</p>}
        </div>
        <span className={styles.scoreBadge}>{Math.round((match.score ?? 0) * 100)}%</span>
      </div>

      {relative && (match.relation_path_to_viewer || rod || relative.description) && (
        <div className={styles.matchInfo}>
          {match.relation_path_to_viewer && <p className={styles.matchRelation}>{match.relation_path_to_viewer}</p>}
          {rod && <p className={styles.matchRod}>{rod}</p>}
          {relative.description && <p className={styles.matchDesc}>{relative.description}</p>}
        </div>
      )}

      <button type="button" className={styles.whyBtn} onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
        <span className={`${styles.statusDot} ${styles[`st_${match.status}`] || ''}`} />
        {STATUS_LABEL[match.status] ?? 'Совпадение'} — почему? {showWhy ? '▲' : '▼'}
      </button>

      {showWhy && (
        <div className={styles.reason}>
          <p className={styles.reasonLead}>
            Найдена общая линия предков: {ev.chain_length ?? chain.length} совпад. подряд
            {ev.sibling_confirmed ? '; подтверждено по родным братьям/сёстрам' : ''}.
          </p>
          {chain.length > 0 ? (
            <ul className={styles.chain}>
              {chain.map((c, i) => (
                <li key={i} className={styles.chainRow}>
                  <span className={styles.chainNames}>{c.person_a_name} ↔ {c.person_b_name}</span>
                  <span className={styles.chainSignals}>
                    имя {Math.round((c.name_similarity ?? 0) * 100)}%
                    {c.geo_match ? ' · гео ✓' : ''}
                    {c.ethnic_match ? ' · род ✓' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.reasonLead}>Совпадение по имени и родовым/географическим признакам.</p>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="accent" size="sm" onClick={() => onConfirm(match.id)}>Подтвердить</Button>
        <Button variant="primary" size="sm" onClick={() => onReject(match.id)}>Отклонить</Button>
      </div>
    </li>
  )
}

function RequestsList({ incoming, outgoing, onConfirm, onReject }) {
  if (!incoming.length && !outgoing.length) {
    return (
      <div className={styles.empty}>
        <UsersIcon />
        <p>Нет запросов на объединение.</p>
        <span>Здесь появятся запросы других семей на связь с вашим деревом.</span>
      </div>
    )
  }
  return (
    <>
      {incoming.length > 0 && (
        <ul className={styles.list}>
          {incoming.map((p) => (
            <li key={p.id} className={styles.item}>
              <div className={styles.itemBody}>
                <p className={styles.itemTitle}>Запрос на связь семей</p>
                <p className={styles.itemText}>
                  Другая семья хочет объединить деревья{p.marriage_year ? ` (брак ${p.marriage_year})` : ''}.
                </p>
              </div>
              <div className={styles.actions}>
                <Button variant="accent" size="sm" onClick={() => onConfirm(p.id)}>Принять</Button>
                <Button variant="danger" size="sm" onClick={() => onReject(p.id)}>Отклонить</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {outgoing.length > 0 && (
        <>
          <p className={styles.groupLabel}>Отправленные</p>
          <ul className={styles.list}>
            {outgoing.map((p) => (
              <li key={p.id} className={styles.item}>
                <div className={styles.itemBody}>
                  <p className={styles.itemTitle}>Ваш запрос на связь</p>
                  <p className={styles.itemText}>Ожидает подтверждения другой семьи.</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
