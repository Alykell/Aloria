export default function TitleBar() {
  return (
    <header className="titlebar">
      <span className="titlebar__name">Aloria</span>
      <div className="titlebar__controls">
        <button aria-label="Réduire" onClick={() => window.aloria.window.minimize()}>
          &#8212;
        </button>
        <button aria-label="Agrandir" onClick={() => window.aloria.window.maximize()}>
          &#9633;
        </button>
        <button aria-label="Fermer" className="close" onClick={() => window.aloria.window.close()}>
          &#10005;
        </button>
      </div>
    </header>
  )
}
