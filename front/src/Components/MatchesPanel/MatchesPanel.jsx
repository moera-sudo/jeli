import { useCallback, useEffect, useState } from 'react'

import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { CloseIcon, UsersIcon } from '../../UI/icons'
import {
  getUserMatches,
  getMarriageProposals,
  confirmMatch,
  rejectMatch,
  confirmProposal,
  rejectProposal,
} from '../../api/graphService'
import styles from './MatchesPanel.module.css'

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
 */
export default function MatchesPanel({ open, onClose, user, isAdmin }) {
  const [tab, setTab] = useState('matches')
  const [matches, setMatches] = useState(null)
  const [proposals, setProposals] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const act = async (fn, id) => {
    try {
      await fn(id)
      await load()
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
            <MatchesList matches={matches} onConfirm={(id) => act(confirmMatch, id)} onReject={(id) => act(rejectMatch, id)} />
          ) : (
            <RequestsList
              incoming={incoming}
              outgoing={outgoing}
              onConfirm={(id) => act(confirmProposal, id)}
              onReject={(id) => act(rejectProposal, id)}
            />
          )}
        </div>
      </aside>
    </>
  )
}

function MatchesList({ matches, onConfirm, onReject }) {
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
        <li key={m.id} className={styles.item}>
          <div className={styles.itemBody}>
            <p className={styles.itemTitle}>Возможное совпадение</p>
            {m.relation_path_to_viewer && <p className={styles.itemText}>{m.relation_path_to_viewer}</p>}
            <span className={styles.score}>Совпадение: {Math.round((m.score ?? 0) * 100)}%</span>
          </div>
          <div className={styles.actions}>
            <Button variant="accent" size="sm" onClick={() => onConfirm(m.id)}>Подтвердить</Button>
            <Button variant="primary" size="sm" onClick={() => onReject(m.id)}>Отклонить</Button>
          </div>
        </li>
      ))}
    </ul>
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
