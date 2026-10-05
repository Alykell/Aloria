import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'

const TITLES: Record<Page, string> = {
  home: 'Accueil',
  library: 'Bibliothèque',
  profiles: 'Profils',
  settings: 'Paramètres'
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.aloria.getVersion().then(setVersion)
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="app__body">
        <Sidebar page={page} onChange={setPage} />
        <main className="content">
          {page === 'home' ? (
            <section className="hero">
              <h1>Bienvenue sur Aloria</h1>
              <p>Ton launcher Minecraft, entre ciel et océan.</p>
              <button className="play" disabled>
                Jouer
              </button>
              <small>Connexion Microsoft et lancement du jeu : bientôt</small>
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
