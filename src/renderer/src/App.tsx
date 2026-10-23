import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'
import HomePage from './components/HomePage'
import ProfilesPage from './components/ProfilesPage'
import LibraryPage from './components/LibraryPage'
import SettingsPage from './components/SettingsPage'
import GameSettingsPage from './components/GameSettingsPage'
import CrashDialog from './components/CrashDialog'
import ModCheckDialog from './components/ModCheckDialog'
import { useAccounts } from './hooks/useAccounts'
import { useSettings } from './hooks/useSettings'
import { useGame } from './hooks/useGame'
import { useProfiles } from './hooks/useProfiles'
import ModpackTaskBar from './components/ModpackTaskBar'
import { DISCORD_INVITE } from '../../shared/links'
import CreationsPage from './components/CreationsPage'
import ServersPage from './components/ServersPage'
import SkinDialog from './components/SkinDialog'
import { useTheme } from './hooks/useTheme'
import LanguagePicker from './components/LanguagePicker'
import { setLang, t } from './i18n'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  // Recliquer sur une page du menu la remet à zéro (ex. la fiche d'un serveur revient à la liste)
  const [navTick, setNavTick] = useState(0)
  // Panneau d'un serveur ou éditeur de recettes ouvert : plein écran, sans le menu de gauche
  const [focused, setFocused] = useState(false)
  const [version, setVersion] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const [skinOpen, setSkinOpen] = useState(false)
  const accounts = useAccounts()
  const settings = useSettings()
  const profiles = useProfiles()
  const game = useGame()
  const { backdrop } = useTheme(settings.settings?.theme, settings.settings?.seasonal)
  const lang = settings.settings?.language
  if (lang) setLang(lang)
  const hiddenModules = settings.settings?.hiddenModules ?? []
  // Toutes les parties masquables sont des pages, sauf l'onglet Modpacks de la Bibliothèque
  const hiddenPages = hiddenModules.filter((m) => m !== 'modpacks') as Page[]

  // Page masquée depuis les Paramètres pendant qu'on y était : retour à l'accueil
  useEffect(() => {
    if (hiddenPages.includes(page)) setPage('home')
  }, [hiddenPages.join(), page])

  useEffect(() => {
    window.aloria.getVersion().then(setVersion)
  }, [])

  // « Dernière partie » et temps de jeu se mettent à jour quand un jeu démarre ou se ferme
  useEffect(() => {
    profiles.refresh()
  }, [game.status.running.length, profiles.refresh])

  const error = accounts.error ?? game.error ?? pageError
  const clearError = () => {
    accounts.clearError()
    game.clearError()
    setPageError(null)
  }

  const playFromProfiles = (id: string) => {
    setPage('home')
    // Déjà ouvert : l'accueil montre son bouton Arrêter
    if (!game.status.running.some((r) => r.profileId === id)) game.play(id)
  }

  return (
    // Changer de langue remonte l'interface, pour que tous les textes suivent
    <div className="app" key={lang ?? 'none'}>
      <div className="backdrop" style={{ backgroundImage: `url(${backdrop})` }} />
      <TitleBar />
      <div className="app__body">
        {!focused && (
          <Sidebar
            page={page}
            hidden={hiddenPages}
            onChange={(p) => {
              setPage(p)
              setNavTick((n) => n + 1)
            }}
            accounts={accounts}
            onSkin={() => setSkinOpen(true)}
          />
        )}
        <main className={'content' + (focused ? ' content--focused' : '')}>
          {error && (
            <div className="toast" role="alert">
              <span>{error}</span>
              <button aria-label={t('common.close')} onClick={clearError}>
                &#10005;
              </button>
            </div>
          )}
          {page === 'home' && <HomePage accounts={accounts} profiles={profiles} game={game} onSkin={() => setSkinOpen(true)} />}
          {page === 'profiles' && (
            <ProfilesPage profiles={profiles} settings={settings} onPlay={playFromProfiles} onError={setPageError} />
          )}
          {page === 'gamesettings' && <GameSettingsPage onError={setPageError} />}
          {page === 'creations' && <CreationsPage key={navTick} profiles={profiles} onError={setPageError} onFocus={setFocused} />}
          {page === 'servers' && <ServersPage key={navTick} settings={settings} onError={setPageError} onFocus={setFocused} />}
          {page === 'settings' && <SettingsPage state={settings} />}
          {page === 'library' && (
            <LibraryPage
              profiles={profiles}
              showModpacks={!hiddenModules.includes('modpacks')}
              onError={setPageError}
              onOpenProfiles={() => setPage('profiles')}
            />
          )}
          <footer className="version">
            <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" title={t('common.discordTitle')}>
              Discord
            </a>{' '}
            · v{version}
          </footer>
        </main>
      </div>
      {skinOpen && accounts.active && <SkinDialog uuid={accounts.active.uuid} onClose={() => setSkinOpen(false)} onError={setPageError} />}
      {game.modCheck && (
        <ModCheckDialog
          check={game.modCheck.check}
          profileName={profiles.profiles.find((p) => p.id === game.modCheck!.profileId)?.name ?? ''}
          onChoose={game.resolveMods}
          onClose={game.closeModCheck}
        />
      )}
      <ModpackTaskBar onFinished={profiles.refresh} />
      {game.crash && <CrashDialog exit={game.crash} profileId={game.crash.profileId} onClose={game.clearCrash} />}
      {settings.settings && !lang && <LanguagePicker onChoose={(language) => settings.update({ language })} />}
    </div>
  )
}
