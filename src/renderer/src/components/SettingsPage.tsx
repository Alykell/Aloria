import type { SettingsState } from '../hooks/useSettings'
import type { AfterLaunch, DiscordGameName, ThemeChoice } from '../../../shared/types'
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
