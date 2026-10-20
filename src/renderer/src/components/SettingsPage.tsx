import type { SettingsState } from '../hooks/useSettings'
import type { AfterLaunch, AppModule, DiscordGameName, ThemeChoice } from '../../../shared/types'
import { LANG_NAMES, LANGS, type MessageKey } from '../../../shared/i18n'
import { gb, t } from '../i18n'

const THEMES: { id: ThemeChoice; label: MessageKey }[] = [
  { id: 'day', label: 'settings.themeDay' },
  { id: 'night', label: 'settings.themeNight' },
  { id: 'auto', label: 'settings.themeAuto' }
]

const AFTER_LAUNCH: { id: AfterLaunch; label: MessageKey }[] = [
  { id: 'keep', label: 'settings.afterKeep' },
  { id: 'minimize', label: 'settings.afterMinimize' },
  { id: 'close', label: 'settings.afterClose' }
]

const MODULES: { id: AppModule; label: MessageKey; hint: MessageKey; icon: string }[] = [
  { id: 'library', label: 'nav.library', hint: 'settings.moduleLibrary', icon: '🐚' },
  { id: 'modpacks', label: 'library.tabModpacks', hint: 'settings.moduleModpacks', icon: '📦' },
  { id: 'creations', label: 'nav.creations', hint: 'settings.moduleCreations', icon: '🎨' },
  { id: 'servers', label: 'nav.servers', hint: 'settings.moduleServers', icon: '🖥️' },
  { id: 'gamesettings', label: 'nav.gamesettings', hint: 'settings.moduleGameSettings', icon: '🎮' }
]

const DISCORD_DETAILS: { key: 'discordShowProfile' | 'discordShowVersion' | 'discordShowServer'; label: MessageKey }[] = [
  { key: 'discordShowServer', label: 'settings.discordServer' },
  { key: 'discordShowProfile', label: 'settings.discordProfile' },
  { key: 'discordShowVersion', label: 'settings.discordVersion' }
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
      <h2>{t('settings.title')}</h2>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>{t('settings.language')}</strong>
            <p>{t('settings.languageHint')}</p>
          </div>
          <div className="segmented">
            {LANGS.map((l) => (
              <button key={l} className={settings.language === l ? 'active' : ''} onClick={() => update({ language: l })}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>{t('settings.theme')}</strong>
            <p>{t('settings.themeHint')}</p>
          </div>
          <div className="segmented">
            {THEMES.map((it) => (
              <button key={it.id} className={settings.theme === it.id ? 'active' : ''} onClick={() => update({ theme: it.id })}>
                {t(it.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="sub-options">
          <label className="toggle-line">
            <input type="checkbox" checked={settings.seasonal} onChange={(e) => update({ seasonal: e.target.checked })} />
            <span>
              🎃 <strong>{t('settings.seasonal')}</strong> <small className="muted">· {t('settings.seasonalHint')}</small>
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>{t('settings.afterLaunch')}</strong>
            <p>{t('settings.afterLaunchHint')}</p>
          </div>
          <div className="segmented">
            {AFTER_LAUNCH.map((a) => (
              <button key={a.id} className={settings.afterLaunch === a.id ? 'active' : ''} onClick={() => update({ afterLaunch: a.id })}>
                {t(a.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__row">
          <div>
            <strong>{t('settings.modules')}</strong>
            <p>{t('settings.modulesHint')}</p>
          </div>
        </div>
        <div className="sub-options">
          {MODULES.map((m) => {
            const shown = !settings.hiddenModules.includes(m.id)
            // Les modpacks sont un onglet de la Bibliothèque : sans elle, ils disparaissent aussi
            const locked = m.id === 'modpacks' && settings.hiddenModules.includes('library')
            return (
              <label key={m.id} className={'toggle-line module' + (locked ? ' disabled' : '')}>
                <input
                  type="checkbox"
                  checked={shown && !locked}
                  disabled={locked}
                  onChange={(e) =>
                    update({
                      hiddenModules: e.target.checked
                        ? settings.hiddenModules.filter((h) => h !== m.id)
                        : [...settings.hiddenModules, m.id]
                    })
                  }
                />
                <span>
                  {m.icon} <strong>{t(m.label)}</strong> <small className="muted">· {t(m.hint)}</small>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="card">
        <label className="card__row toggle">
          <div>
            <strong>{t('settings.discord')}</strong>
            <p>{t('settings.discordHint')}</p>
          </div>
          <input type="checkbox" checked={settings.discordPresence} onChange={(e) => update({ discordPresence: e.target.checked })} />
        </label>
        {settings.discordPresence && (
          <div className="sub-options">
            <div className="discord-name">
              <span>{t('settings.discordName')}</span>
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
                <span>{t(d.label)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {window.aloria.platform === 'linux' && (
        <div className="card">
          <label className="card__row toggle">
            <div>
              <strong>{t('settings.gpu')}</strong>
              <p>{t('settings.gpuHint')}</p>
            </div>
            <input type="checkbox" checked={settings.dedicatedGpu} onChange={(e) => update({ dedicatedGpu: e.target.checked })} />
          </label>
        </div>
      )}

      <div className="card">
        <div className="card__row">
          <div>
            <strong>{t('settings.ram')}</strong>
            <p>{t('settings.ramHint', { ram: gb(settings.ramMb), total: gb(systemRamMb, 0) })}</p>
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
            <strong>{t('settings.snapshots')}</strong>
            <p>{t('settings.snapshotsHint')}</p>
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
