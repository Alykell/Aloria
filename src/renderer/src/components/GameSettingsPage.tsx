import { useCallback, useEffect, useState } from 'react'
import { keyFromCode, keyFromMouse, keyLabel } from '../keys'
import type { SettingsPreset } from '../../../shared/types'
import Select from './Select'
import { getLang, presetName, t } from '../i18n'
import { gameLangOf } from '../../../shared/i18n'

const LANGUAGES: [string, string][] = [
  ['fr_fr', 'Français'], ['en_us', 'English (US)'], ['en_gb', 'English (UK)'], ['es_es', 'Español'],
  ['de_de', 'Deutsch'], ['it_it', 'Italiano'], ['pt_br', 'Português (Brasil)'], ['pt_pt', 'Português (Portugal)'],
  ['nl_nl', 'Nederlands'], ['pl_pl', 'Polski'], ['ru_ru', 'Русский'], ['tr_tr', 'Türkçe'], ['ja_jp', '日本語'],
  ['ko_kr', '한국어'], ['zh_cn', '简体中文']
]

const sounds = (): [string, string][] => [
  ['master', t('gs.sound.master')], ['music', t('gs.sound.music')], ['record', t('gs.sound.record')], ['weather', t('gs.sound.weather')],
  ['block', t('gs.sound.block')], ['hostile', t('gs.sound.hostile')], ['neutral', t('gs.sound.neutral')], ['player', t('gs.sound.player')],
  ['ambient', t('gs.sound.ambient')], ['voice', t('gs.sound.voice')]
]

const keyGroups = (): [string, [string, string][]][] => [
  [t('gs.group.movement'), [['forward', t('gs.key.forward')], ['back', t('gs.key.back')], ['left', t('gs.key.left')], ['right', t('gs.key.right')],
    ['jump', t('gs.key.jump')], ['sneak', t('gs.key.sneak')], ['sprint', t('gs.key.sprint')]]],
  [t('gs.group.actions'), [['attack', t('gs.key.attack')], ['use', t('gs.key.use')], ['pickItem', t('gs.key.pickItem')],
    ['drop', t('gs.key.drop')], ['swapOffhand', t('gs.key.swapOffhand')]]],
  [t('gs.group.inventory'), [['inventory', t('gs.group.inventory')], ...Array.from({ length: 9 }, (_, i): [string, string] => [`hotbar.${i + 1}`, t('gs.key.slot', { n: i + 1 })])]],
  [t('gs.group.multiplayer'), [['chat', t('gs.key.chat')], ['command', t('gs.key.command')], ['playerlist', t('gs.key.playerlist')]]],
  [t('gs.group.misc'), [['screenshot', t('gs.key.screenshot')], ['togglePerspective', t('gs.key.perspective')], ['fullscreen', t('gs.key.fullscreen')],
    ['aloriahud.editor', t('gs.key.hud')]]]
]

type Patch = Record<string, string | null>

export default function GameSettingsPage({ onError }: { onError: (message: string) => void }) {
  const [presets, setPresets] = useState<SettingsPreset[]>([])
  const [currentId, setCurrentId] = useState('main')
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [capturing, setCapturing] = useState<string | null>(null)

  const refresh = useCallback(async () => setPresets(await window.aloria.presets.list()), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const preset = presets.find((p) => p.id === currentId) ?? presets[0]
  const o = preset?.options ?? {}

  const set = async (patch: Patch) => {
    if (!preset) return
    // Mise à jour immédiate à l'écran, puis enregistrement
    setPresets((list) =>
      list.map((p) => {
        if (p.id !== preset.id) return p
        const options = { ...p.options }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete options[k]
          else options[k] = v
        }
        return { ...p, options }
      })
    )
    await window.aloria.presets.update(preset.id, patch)
  }

  // Capture d'une touche : prochaine touche du clavier ou clic de souris (Échap annule)
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      const key = e.code === 'Escape' ? null : keyFromCode(e.code)
      if (key) set({ [`key_key.${capturing}`]: key })
      setCapturing(null)
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      set({ [`key_key.${capturing}`]: keyFromMouse(e.button) })
      setCapturing(null)
    }
    // Le clic qui a ouvert la capture ne doit pas être pris pour la nouvelle touche
    const timer = setTimeout(() => window.addEventListener('mousedown', onMouse, { once: true }), 50)
    window.addEventListener('keydown', onKey, { once: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse)
    }
  }, [capturing])

  if (!preset) return null

  const num = (key: string, fallback: number) => (o[key] !== undefined ? Number(o[key]) : fallback)
  const bool = (key: string, fallback = false) => (o[key] !== undefined ? o[key] === 'true' : fallback)
  const percent = (key: string, fallback: number) => Math.round(num(key, fallback) * 100)
  const pct = (v: number) => t('gs.percent', { n: v })
  const offOrPercent = (v: number) => (v === 0 ? t('gs.off') : pct(v))
  const fov = Math.round(70 + num('fov', 0) * 40)
  const maxFps = num('maxFps', 120)

  const create = async () => {
    if (!newName?.trim()) return
    const created = await window.aloria.presets.create(newName.trim(), preset.id)
    setNewName(null)
    await refresh()
    setCurrentId(created.id)
  }

  return (
    <section className="page wide game-settings">
      <h2>{t('nav.gamesettings')}</h2>
      <p className="muted">{t('gs.intro')}</p>

      <div className="preset-bar">
        {presets.map((p) =>
          renaming === p.id ? (
            <input
              key={p.id}
              className="preset-input"
              autoFocus
              defaultValue={p.name}
              maxLength={24}
              onBlur={async (e) => {
                if (e.target.value.trim()) await window.aloria.presets.rename(p.id, e.target.value.trim())
                setRenaming(null)
                refresh()
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button
              key={p.id}
              className={'preset-chip' + (p.id === preset.id ? ' active' : '')}
              onClick={() => {
                setCurrentId(p.id)
                setConfirmDelete(false)
              }}
              onDoubleClick={() => p.id !== 'main' && setRenaming(p.id)}
              title={p.id !== 'main' ? t('gs.renameHint') : undefined}
            >
              {presetName(p)}
            </button>
          )
        )}
        {newName === null ? (
          <button className="preset-chip add" onClick={() => setNewName('')}>
            {t('gs.new')}
          </button>
        ) : (
          <input
            className="preset-input"
            autoFocus
            placeholder={t('gs.newPlaceholder')}
            maxLength={24}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
              if (e.key === 'Escape') setNewName(null)
            }}
            onBlur={() => (newName.trim() ? create() : setNewName(null))}
          />
        )}
        {preset.id !== 'main' &&
          (confirmDelete ? (
            <button
              className="danger-btn small"
              onClick={async () => {
                const res = await window.aloria.presets.remove(preset.id)
                if (!res.ok) onError(res.error)
                setConfirmDelete(false)
                setCurrentId('main')
                refresh()
              }}
            >
              {t('gs.confirmDelete')}
            </button>
          ) : (
            <button className="link-danger" onClick={() => setConfirmDelete(true)}>
              {t('gs.delete', { name: presetName(preset) })}
            </button>
          ))}
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>{t('gs.general')}</h3>
          <Row label={t('gs.language')}>
            <Select value={o.lang ?? gameLangOf(getLang())} onChange={(v) => set({ lang: v })} options={LANGUAGES.map(([id, name]) => ({ value: id, label: name }))} />
          </Row>
          <Slider label={t('gs.fov')} value={fov} min={30} max={110} display={(v) => (v === 70 ? t('gs.fovNormal') : v === 110 ? 'Quake Pro' : `${v}°`)}
            onChange={(v) => set({ fov: String((v - 70) / 40) })} />
          <Slider label={t('gs.brightness')} value={Math.round(num('gamma', 0.5) * 100)} min={0} max={100} display={(v) => (v === 0 ? t('gs.moody') : v === 100 ? t('gs.bright') : pct(v))}
            onChange={(v) => set({ gamma: String(v / 100) })} />
          <Slider label={t('gs.renderDistance')} value={num('renderDistance', 12)} min={2} max={32} display={(v) => t('gs.chunks', { n: v })}
            onChange={(v) => set({ renderDistance: String(v) })} />
          <Row label={t('gs.guiScale')}>
            <Select
              value={o.guiScale ?? '0'}
              onChange={(v) => set({ guiScale: v })}
              options={[{ value: '0', label: t('gs.auto') }, ...['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))]}
            />
          </Row>
          <Slider label={t('gs.maxFps')} value={maxFps} min={10} max={260} step={10} display={(v) => (v >= 260 ? t('gs.unlimited') : t('gs.fps', { n: v }))}
            onChange={(v) => set({ maxFps: String(v) })} />
          <Toggle label={t('gs.vsync')} value={bool('enableVsync', true)} onChange={(v) => set({ enableVsync: String(v) })} />
          <Toggle label={t('gs.fullscreen')} value={bool('fullscreen')} onChange={(v) => set({ fullscreen: String(v) })} />
        </div>

        <div className="card">
          <h3>{t('gs.mouse')}</h3>
          <Slider label={t('gs.sensitivity')} value={Math.round(num('mouseSensitivity', 0.5) * 200)} min={0} max={200} display={pct}
            onChange={(v) => set({ mouseSensitivity: String(v / 200) })} />
          <Toggle label={t('gs.rawInput')} value={bool('rawMouseInput', true)} onChange={(v) => set({ rawMouseInput: String(v) })} />
          <Toggle label={t('gs.invertMouse')} value={bool('invertYMouse')} onChange={(v) => set({ invertYMouse: String(v) })} />
          <Toggle label={t('gs.autoJump')} value={bool('autoJump')} onChange={(v) => set({ autoJump: String(v) })} />
          <Toggle label={t('gs.toggleCrouch')} value={bool('toggleCrouch')} onChange={(v) => set({ toggleCrouch: String(v) })} />
          <Toggle label={t('gs.toggleSprint')} value={bool('toggleSprint')} onChange={(v) => set({ toggleSprint: String(v) })} />
          <Slider label={t('gs.chatOpacity')} value={Math.round(num('chatOpacity', 1) * 100)} min={10} max={100} display={pct}
            onChange={(v) => set({ chatOpacity: String(v / 100) })} />

          <h3 className="spaced">{t('gs.sound')}</h3>
          {sounds().map(([id, label]) => (
            <Slider key={id} label={label} value={Math.round(num(`soundCategory_${id}`, 1) * 100)} min={0} max={100}
              display={(v) => (v === 0 ? t('gs.muted') : pct(v))} onChange={(v) => set({ [`soundCategory_${id}`]: String(v / 100) })} />
          ))}
        </div>

        <div className="card">
          <h3>{t('gs.accessibility')}</h3>
          <p className="muted small">{t('gs.accessibilityHint')}</p>
          <Toggle label={t('gs.viewBobbing')} value={bool('viewBobbing', true)} onChange={(v) => set({ viewBobbing: String(v) })} />
          <Slider label={t('gs.damageTilt')} value={percent('damageTiltStrength', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ damageTiltStrength: String(v / 100) })} />
          <Slider label={t('gs.fovEffects')} value={percent('fovEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ fovEffectScale: String(v / 100) })} />
          <Slider label={t('gs.distortion')} value={percent('screenEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ screenEffectScale: String(v / 100) })} />
          <Slider label={t('gs.darkness')} value={percent('darknessEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ darknessEffectScale: String(v / 100) })} />
          <Toggle label={t('gs.lightning')} value={bool('hideLightningFlashes')} onChange={(v) => set({ hideLightningFlashes: String(v) })} />
          <Toggle label={t('gs.minecart')} value={bool('rotateWithMinecart')} onChange={(v) => set({ rotateWithMinecart: String(v) })} />
          <Slider label={t('gs.glintSpeed')} value={percent('glintSpeed', 0.5)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ glintSpeed: String(v / 100) })} />
          <Slider label={t('gs.glintStrength')} value={percent('glintStrength', 0.75)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ glintStrength: String(v / 100) })} />
          <Slider label={t('gs.menuBlur')} value={num('menuBackgroundBlurriness', 5)} min={0} max={10} display={(v) => (v === 0 ? t('gs.off') : String(v))}
            onChange={(v) => set({ menuBackgroundBlurriness: String(v) })} />
          <Slider label={t('gs.panorama')} value={percent('panoramaScrollSpeed', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ panoramaScrollSpeed: String(v / 100) })} />
          <Toggle label={t('gs.darkLogo')} value={bool('darkMojangStudiosBackground')} onChange={(v) => set({ darkMojangStudiosBackground: String(v) })} />
          <Toggle label={t('gs.splashes')} value={bool('hideSplashTexts')} onChange={(v) => set({ hideSplashTexts: String(v) })} />

          <h3 className="spaced">{t('gs.textChat')}</h3>
          <Toggle label={t('gs.subtitles')} value={bool('showSubtitles')} onChange={(v) => set({ showSubtitles: String(v) })} />
          <Row label={t('gs.narrator')}>
            <Select
              value={o.narrator ?? '0'}
              onChange={(v) => set({ narrator: v })}
              options={[
                { value: '0', label: t('gs.off') },
                { value: '1', label: t('gs.narratorAll') },
                { value: '2', label: t('gs.narratorChat') },
                { value: '3', label: t('gs.narratorSystem') }
              ]}
            />
          </Row>
          <Slider label={t('gs.textBackground')} value={percent('textBackgroundOpacity', 0.5)} min={0} max={100} display={pct}
            onChange={(v) => set({ textBackgroundOpacity: String(v / 100) })} />
          <Toggle label={t('gs.chatOnly')} value={bool('backgroundForChatOnly', true)} onChange={(v) => set({ backgroundForChatOnly: String(v) })} />
          <Slider label={t('gs.lineSpacing')} value={percent('chatLineSpacing', 0)} min={0} max={100} display={pct}
            onChange={(v) => set({ chatLineSpacing: String(v / 100) })} />
          <Slider label={t('gs.notifications')} value={Math.round(num('notificationDisplayTime', 1) * 10)} min={5} max={100}
            display={(v) => `×${(v / 10).toFixed(1)}`} onChange={(v) => set({ notificationDisplayTime: String(v / 10) })} />
          <Toggle label={t('gs.outline')} value={bool('highContrastBlockOutline')} onChange={(v) => set({ highContrastBlockOutline: String(v) })} />
        </div>

        <div className="card keys">
          <h3>{t('gs.keys')}</h3>
          <p className="muted small">{t('gs.keysHint')}</p>
          {keyGroups().map(([group, keys]) => (
            <div key={group} className="key-group">
              <span className="key-group__title">{group}</span>
              {keys.map(([id, label]) => (
                <div key={id} className="key-row">
                  <span>{label}</span>
                  <button className={'key-btn' + (capturing === id ? ' capturing' : '')} onClick={() => setCapturing(capturing === id ? null : id)}>
                    {capturing === id ? t('gs.pressKey') : keyLabel(o[`key_key.${id}`])}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string | ((v: number) => string)
  onChange: (v: number) => void
}

/** Curseur : affichage en direct pendant le glisser, enregistrement au relâchement */
function Slider({ label, value, min, max, step = 1, display, onChange }: SliderProps) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  const text = typeof display === 'function' ? display(local) : display
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="slider-line">
        <input
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={local}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onChange(local)}
          onKeyUp={() => onChange(local)}
        />
        <strong>{text}</strong>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </label>
    </div>
  )
}
