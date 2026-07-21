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
import { useAuth } from '../../auth/AuthContext'
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

  const [me, setMe] = useState(undefined) // undefined = loading, null = no tree
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [matchesOpen, setMatchesOpen] = useState(false)

  // A match notification routes here with { openMatches } — open that tab, then
  // clear the state so a refresh/back doesn't reopen it.
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
      // Backfill the self node's avatar from the profile when it's missing.
      // Only `create_root` copies avatar_url onto the node, so a usual user who
      // JOINED a node by code (or set their avatar before joining) ends up with
      // an avatar in their profile but none on their tree node. They can always
      // edit their own linked node, so mirror the profile avatar onto it here.
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

  // No tree yet → onboarding choices.
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
          <GraphCanvas focusPerson={me} isOwner={isAdmin} currentUserId={user?.id} onGraphChanged={reloadMe} />
        </div>
        <HistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          ownerUserId={me.owner_user_id}
        />
      </main>
      <MatchesPanel open={matchesOpen} onClose={() => setMatchesOpen(false)} user={user} isAdmin={isAdmin} />
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
      // Gender must be set on the profile before a tree can be created.
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
              <Button variant="primary" onClick={() => { setMode(null); setCode(''); setLocalError('') }}>
                Назад
              </Button>
              <Button type="submit" variant="accent" trailingIcon={<ArrowRightIcon />} disabled={!isValidFamilyCode(code) || busy}>
                {busy ? 'Присоединение…' : 'Присоединиться'}
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
