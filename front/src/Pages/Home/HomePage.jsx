import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import TopBar from '../../Components/TopBar/TopBar'
import GraphCanvas from '../../Components/GraphCanvas/GraphCanvas'
import HistoryPanel from '../../Components/HistoryPanel/HistoryPanel'
import MatchesPanel from '../../Components/MatchesPanel/MatchesPanel'
import Button from '../../UI/Button/Button'
import Loader from '../../UI/Loader/Loader'
import { UsersIcon, PlusIcon, ArrowRightIcon } from '../../UI/icons'
import { getMyPerson, createGraph, joinGraph, updatePerson } from '../../api/graphService'
import { useAuth } from '../../utils/AuthContext'
import { ROUTES } from '../../Routes/Routes'
import { isValidFamilyCode, normalizeInviteCode } from '../../utils/validation'
import styles from './HomePage.module.css'

/**
 * Home page — the family-graph workspace.
 *
 * Branches on whether the user already has a graph node (`GET /persons/me`):
 *  - none  → a blank landing with "Join" (enter a code) and "Create a tree"
 *            (become the family admin);
 *  - has one → the radial family graph, plus the history and matches panels.
 */
export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [me, setMe] = useState(undefined)
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [matchesOpen, setMatchesOpen] = useState(false)
  // Bumped by MatchesPanel after confirming a match/proposal so GraphCanvas reloads
  // (its own loadGraph only depends on focusId, which a match confirm never changes).
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)


  useEffect(() => {
    if (location.state?.openMatches) {
      setMatchesOpen(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const reloadMe = useCallback(async () => {
    setError('')
    try {
      let mine = await getMyPerson()

      if (mine?.id && user?.avatar_url && !mine.avatar_url) {
        try {
          mine = await updatePerson(mine.id, { avatar_url: user.avatar_url })
        } catch { /* best-effort: the tree still loads without the face */ }
      }
      setMe(mine)
    } catch (err) {
      setError(err.message || 'Не удалось загрузить дерево')
      setMe(null)
    }
  }, [user?.avatar_url])

  useEffect(() => {
    reloadMe()
  }, [reloadMe])

  if (me === undefined) {
    return (
      <div className={styles.page}>
        <TopBar />
        <div className={styles.centered}><Loader /></div>
      </div>
    )
  }

  if (me === null) {
    return (
      <div className={styles.page}>
        <TopBar />
        <BlankHome onDone={reloadMe} onNeedGender={() => navigate(ROUTES.profile)} error={error} />
      </div>
    )
  }

  const isAdmin = me.owner_user_id === user?.id

  return (
    <div className={styles.page}>
      <TopBar
        historyActive={historyOpen}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
        matchesActive={matchesOpen}
        onToggleMatches={() => setMatchesOpen((v) => !v)}
      />
      <main className={styles.workspace}>
        <div className={styles.graphWrap}>
          <GraphCanvas
            focusPerson={me}
            isOwner={isAdmin}
            currentUserId={user?.id}
            onGraphChanged={reloadMe}
            refreshSignal={graphRefreshKey}
          />
        </div>
        <HistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          ownerUserId={me.owner_user_id}
        />
      </main>
      <MatchesPanel
        open={matchesOpen}
        onClose={() => setMatchesOpen(false)}
        user={user}
        isAdmin={isAdmin}
        onGraphRefreshNeeded={() => setGraphRefreshKey((k) => k + 1)}
      />
    </div>
  )
}

/* ----------------------------------------------------- blank landing --- */
function BlankHome({ onDone, onNeedGender, error }) {
  const [mode, setMode] = useState(null) // null | 'join'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleCreate = async () => {
    setLocalError('')
    setBusy(true)
    try {
      await createGraph()
      onDone()
    } catch (err) {
      if (err.status === 409 && /gender/i.test(err.message || '')) {
        onNeedGender()
        return
      }
      setLocalError(err.message || 'Не удалось создать дерево')
      setBusy(false)
    }
  }

  const handleJoin = async (event) => {
    event.preventDefault()
    if (!isValidFamilyCode(code) || busy) return
    setLocalError('')
    setBusy(true)
    try {
      await joinGraph(code)
      onDone()
    } catch (err) {
      setLocalError(err.status === 404 ? 'Код неверный или уже использован' : err.message || 'Не удалось присоединиться')
      setBusy(false)
    }
  }

  return (
    <div className={styles.blank}>
      <div className={styles.blankCard}>
        <span className={styles.blankIcon} aria-hidden="true"><UsersIcon /></span>
        <h1 className={styles.blankTitle}>Начните своё семейное древо</h1>
        <p className={styles.blankSubtitle}>
          Присоединитесь к семье по коду приглашения или создайте новое древо и станьте его администратором.
        </p>

        {(error || localError) && <p className={styles.blankError} role="alert">{error || localError}</p>}

        {mode === 'join' ? (
          <form className={styles.blankForm} onSubmit={handleJoin} noValidate>
            <input
              className={styles.blankInput}
              value={code}
              onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
              placeholder="8-значный код приглашения"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
            />
            <div className={styles.blankActions}>
              <Button type="submit" variant="accent" trailingIcon={<ArrowRightIcon />} disabled={!isValidFamilyCode(code) || busy}>
                {busy ? 'Присоединение…' : 'Присоединиться'}
              </Button>
               <Button variant="primary" onClick={() => { setMode(null); setCode(''); setLocalError('') }}>
                Назад
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.blankActions}>
            <Button variant="primary" trailingIcon={<UsersIcon />} onClick={() => setMode('join')} disabled={busy}>
              Присоединиться
            </Button>
            <Button variant="accent" trailingIcon={<PlusIcon />} onClick={handleCreate} disabled={busy}>
              {busy ? 'Создание…' : 'Создать новое древо'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
