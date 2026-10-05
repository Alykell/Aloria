import type { GameExit } from '../../../shared/types'

export default function CrashDialog({ exit, onClose }: { exit: GameExit; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Le jeu s'est arrêté de façon inattendue</h3>
        <p>Code de sortie : {exit.code ?? 'inconnu'}</p>
        {exit.crashLog && <pre>{exit.crashLog}</pre>}
        <div className="dialog__actions">
          <button className="secondary" onClick={() => window.aloria.game.openFolder()}>
            Ouvrir le dossier du jeu
          </button>
          <button className="primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
