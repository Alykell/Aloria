import type { GameExit } from '../../../shared/types'

export default function CrashDialog({ exit, profileId, onClose }: { exit: GameExit; profileId: string | null; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Le jeu s'est arrêté de façon inattendue</h3>
        <p>Code de sortie : {exit.code ?? 'inconnu'}</p>
        {exit.crashLog && <pre>{exit.crashLog}</pre>}
        <div className="dialog__actions">
          {profileId && (
            <button className="secondary" onClick={() => window.aloria.profiles.openFolder(profileId)}>
              Ouvrir le dossier du profil
            </button>
          )}
          <button className="primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
