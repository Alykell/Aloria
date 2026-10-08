import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'
import HomePage from './components/HomePage'
import ProfilesPage from './components/ProfilesPage'
import LibraryPage from './components/LibraryPage'
import SettingsPage from './components/SettingsPage'
import GameSettingsPage from './components/GameSettingsPage'
import CrashDialog from './components/CrashDialog'
import { useAccounts } from './hooks/useAccounts'
import { useSettings } from './hooks/useSettings'
import { useGame } from './hooks/useGame'
import { useProfiles } from './hooks/useProfiles'
import { DISCORD_INVITE } from '../../shared/links'
import CreationsPage from './components/CreationsPage'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [version, setVersion] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const accounts = useAccounts()
  const settings = useSettings()
  const profiles = useProfiles()
  const game = useGame()
  const { backdrop } = useTheme(settings.settings?.theme)

  useEffect(() => {
    window.aloria.getVersion().then(setVersion)
  }, [])

  // « Dernière partie » se met à jour quand un jeu démarre
  useEffect(() => {
    if (game.status.state === 'running') profiles.refresh()
  }, [game.status.state, profiles.refresh])

  const error = accounts.error ?? game.error ?? pageError
  const clearError = () => {
    accounts.clearError()
    game.clearError()
    setPageError(null)
  }

  const playFromProfiles = (id: string) => {
    setPage('home')
    game.play(id)
  }

  return (
    <div className="app">
      <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} />
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
          {page === 'home' && <HomePage accounts={accounts} profiles={profiles} game={game} />}
          {page === 'profiles' && (
            <ProfilesPage profiles={profiles} settings={settings} onPlay={playFromProfiles} onError={setPageError} />
          )}
          {page === 'gamesettings' && <GameSettingsPage onError={setPageError} />}
          {page === 'creations' && <CreationsPage profiles={profiles} onError={setPageError} />}
          {page === 'settings' && <SettingsPage state={settings} />}
          {page === 'library' && (
            <LibraryPage profiles={profiles} onError={setPageError} onOpenProfiles={() => setPage('profiles')} />
          )}
          <footer className="version">
            <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" title="Annonces, aide et communauté">
              Discord
            </a>{' '}
            · v{version}
          </footer>
        </main>
      </div>
      {game.crash && <CrashDialog exit={game.crash} profileId={profiles.selected?.id ?? null} onClose={game.clearCrash} />}
    </div>
  )
}
