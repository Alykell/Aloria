/** Barre de titre (fenêtre sans cadre) : boutons à icônes fines et pastilles arrondies, assortis au launcher */
export default function TitleBar() {
  return (
    <header className="titlebar">
      <span className="titlebar__name">Aloria</span>
      <div className="titlebar__controls">
        <button aria-label="Réduire" title="Réduire" onClick={() => window.aloria.window.minimize()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button aria-label="Agrandir" title="Agrandir" onClick={() => window.aloria.window.maximize()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button aria-label="Fermer" title="Fermer" className="close" onClick={() => window.aloria.window.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  )
}
