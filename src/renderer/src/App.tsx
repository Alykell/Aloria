import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'
import { useAccounts } from './hooks/useAccounts'

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

  useEffect(() => {
    window.aloria.getVersion().then(setVersion)
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="app__body">
        <Sidebar page={page} onChange={setPage} accounts={accounts} />
        <main className="content">
          {accounts.error && (
            <div className="toast" role="alert">
              <span>{accounts.error}</span>
              <button aria-label="Fermer" onClick={accounts.clearError}>
                &#10005;
              </button>
            </div>
          )}
          {page === 'home' ? (
            <section className="hero">
              <h1>{accounts.active ? `Salut ${accounts.active.name} !` : 'Bienvenue sur Aloria'}</h1>
              <p>Ton launcher Minecraft, entre ciel et océan.</p>
              {accounts.active ? (
                <button className="play" disabled>
                  Jouer
                </button>
              ) : (
                <button className="play" onClick={accounts.add} disabled={accounts.busy}>
                  {accounts.busy ? 'Connexion…' : 'Se connecter'}
                </button>
              )}
              <small>
                {accounts.active ? 'Le lancement du jeu arrive bientôt' : 'Connecte-toi avec ton compte Microsoft'}
              </small>
            </section>
          ) : (
            <section className="placeholder">
              <h2>{TITLES[page]}</h2>
              <p>En construction…</p>
            </section>
          )}
          <footer className="version">v{version}</footer>
        </main>
      </div>
    </div>
  )
}
