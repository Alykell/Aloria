import type { SettingsState } from '../hooks/useSettings'

export default function SettingsPage({ state: { settings, systemRamMb, update } }: { state: SettingsState }) {
  if (!settings) return null
  // On laisse toujours au moins 2 Go au système
  const maxRam = Math.max(1024, Math.floor((systemRamMb - 2048) / 512) * 512)

  return (
    <section className="page">
      <h2>Paramètres</h2>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>Mémoire allouée</strong>
            <p>
              {(settings.ramMb / 1024).toFixed(1)} Go sur {(systemRamMb / 1024).toFixed(0)} Go disponibles. 4 Go suffisent
              en vanilla, prévois-en 6 à 8 avec beaucoup de mods ou des shaders.
            </p>
          </div>
        </div>
        <input
          type="range"
          className="slider"
          min={1024}
          max={maxRam}
          step={512}
          value={Math.min(settings.ramMb, maxRam)}
          onChange={(e) => update({ ramMb: Number(e.target.value) })}
        />
      </div>

      <div className="card">
        <label className="card__row toggle">
          <div>
            <strong>Afficher les snapshots</strong>
            <p>Les versions de test de Mojang, souvent instables.</p>
          </div>
          <input
            type="checkbox"
            checked={settings.showSnapshots}
            onChange={(e) => update({ showSnapshots: e.target.checked })}
          />
        </label>
      </div>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>Dossier du jeu</strong>
            <p>Sauvegardes, captures d'écran, options et logs.</p>
          </div>
          <button className="secondary" onClick={() => window.aloria.game.openFolder()}>
            Ouvrir
          </button>
        </div>
      </div>
    </section>
  )
}
