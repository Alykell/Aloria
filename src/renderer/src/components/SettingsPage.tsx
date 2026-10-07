import type { SettingsState } from '../hooks/useSettings'
import type { AfterLaunch, DiscordGameName, ThemeChoice } from '../../../shared/types'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'day', label: '☀️ Jour' },
  { id: 'night', label: '🌙 Nuit' },
  { id: 'auto', label: 'Auto' }
]

const AFTER_LAUNCH: { id: AfterLaunch; label: string }[] = [
  { id: 'keep', label: 'Rester ouvert' },
  { id: 'minimize', label: 'Se réduire' },
  { id: 'close', label: 'Se fermer' }
]

const DISCORD_DETAILS: { key: 'discordShowProfile' | 'discordShowVersion' | 'discordShowServer'; label: string }[] = [
  { key: 'discordShowServer', label: 'Montrer le serveur (ex. « Sur donutsmp.net ») ou « En solo »' },
  { key: 'discordShowProfile', label: 'Montrer le nom du profil' },
  { key: 'discordShowVersion', label: 'Montrer la version (ex. « Fabric 26.2 »)' }
]

const DISCORD_NAMES: { id: DiscordGameName; label: string }[] = [
  { id: 'aloria', label: 'Aloria Client' },
  { id: 'minecraft', label: 'Minecraft' }
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
            <strong>Au lancement du jeu, le launcher doit…</strong>
            <p>Fermé ou non, tes réglages et ta liste de serveurs sont bien récupérés à la fin de la partie.</p>
          </div>
          <div className="segmented">
            {AFTER_LAUNCH.map((a) => (
              <button key={a.id} className={settings.afterLaunch === a.id ? 'active' : ''} onClick={() => update({ afterLaunch: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <label className="card__row toggle">
          <div>
            <strong>Statut Discord</strong>
            <p>Affiche « Joue à Aloria Client » (ou « Joue à Minecraft » en partie) sur ton profil Discord, avec le temps de jeu.</p>
          </div>
          <input type="checkbox" checked={settings.discordPresence} onChange={(e) => update({ discordPresence: e.target.checked })} />
        </label>
        {settings.discordPresence && (
          <div className="sub-options">
            <div className="discord-name">
              <span>Pendant une partie, afficher « Joue à… »</span>
              <div className="segmented">
                {DISCORD_NAMES.map((n) => (
                  <button key={n.id} className={settings.discordGameName === n.id ? 'active' : ''} onClick={() => update({ discordGameName: n.id })}>
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
            {DISCORD_DETAILS.map((d) => (
              <label key={d.key} className="toggle-line">
                <input type="checkbox" checked={settings[d.key]} onChange={(e) => update({ [d.key]: e.target.checked })} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        )}
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
