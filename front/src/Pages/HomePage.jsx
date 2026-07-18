import { useState } from 'react'

import TopBar from '../Components/TopBar/TopBar'
import GraphCanvas from '../Components/GraphCanvas/GraphCanvas'
import HistoryPanel from '../Components/HistoryPanel/HistoryPanel'
import styles from './HomePage.module.css'

/**
 * Home page — the family-tree workspace.
 * Layout only: a global header over the graph canvas, with a collapsible
 * family-history (Markdown) panel that the graph shrinks to make room for.
 */
export default function HomePage() {
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className={styles.page}>
      <TopBar
        historyActive={historyOpen}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
      />
      <main className={styles.workspace}>
        <div className={styles.graphWrap}>
          <GraphCanvas />
        </div>
        <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </main>
    </div>
  )
}
