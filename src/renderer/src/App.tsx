import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'
import HomePage from './components/HomePage'
import SettingsPage from './components/SettingsPage'
import CrashDialog from './components/CrashDialog'
import { useAccounts } from './hooks/useAccounts'
import { useSettings } from './hooks/useSettings'
import { useGame } from './hooks/useGame'

const TITLES: Record<Page, string> = {
  home: 'Accueil',
  library: 'Bibliothèque',
  profiles: 'Profils',
  settings: 'Paramètres'
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [version, setVersion] = useState('')
  const accounts = useAccounts()
  const settings = useSettings()
  const game = useGame()

  useEffect(() => {
    window.aloria.getVersion().then(setVersion)
  }, [])

  const error = accounts.error ?? game.error
  const clearError = () => {
    accounts.clearError()
    game.clearError()
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app__body">
        <Sidebar page={page} onChange={setPage} accounts={accounts} />
        <main className="content">
          {error && (
            <div className="toast" role="alert">
              <span>{error}</span>
              <button aria-label="Fermer" onClick={clearError}>
                &#10005;
              </button>
            </div>
          )}
          {page === 'home' && <HomePage accounts={accounts} settings={settings} game={game} />}
          {page === 'settings' && <SettingsPage state={settings} />}
          {(page === 'library' || page === 'profiles') && (
            <section className="placeholder">
              <h2>{TITLES[page]}</h2>
              <p>En construction…</p>
            </section>
          )}
          <footer className="version">v{version}</footer>
        </main>
      </div>
      {game.crash && <CrashDialog exit={game.crash} onClose={game.clearCrash} />}
    </div>
  )
}
