import type { SettingsState } from '../hooks/useSettings'
import type { ThemeChoice } from '../../../shared/types'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'day', label: '☀️ Jour' },
  { id: 'night', label: '🌙 Nuit' },
  { id: 'auto', label: 'Auto' }
]

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
            <strong>Apparence</strong>
            <p>Plage de jour, plage de nuit, ou automatique selon l'heure (nuit de 20 h à 7 h).</p>
          </div>
          <div className="segmented">
            {THEMES.map((t) => (
              <button key={t.id} className={settings.theme === t.id ? 'active' : ''} onClick={() => update({ theme: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>Mémoire par défaut</strong>
            <p>
              {(settings.ramMb / 1024).toFixed(1)} Go sur {(systemRamMb / 1024).toFixed(0)} Go disponibles, utilisée par les profils sans réglage propre. 4 Go suffisent
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
    </section>
  )
}
