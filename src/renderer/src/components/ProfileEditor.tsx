import { useEffect, useState } from 'react'
import { useVersions } from '../hooks/useVersions'
import { hudAvailable, hudVersionsLabel } from '../../../shared/aloriaHud'
import { forgeSupported, prefersForge } from '../../../shared/loaders'
import type { Loader, LoaderVersion, Profile, ProfileInput, SettingsPreset } from '../../../shared/types'
import Select from './Select'
import { gb, presetName, t } from '../i18n'

const ICONS = ['🏝️', '🌊', '🐚', '⚓', '🐬', '🐠', '🦀', '🌴', '⛵', '🏰', '⚔️', '🧪', '🌙', '🔥', '💎', '🌸']

interface Props {
  /** Profil à modifier, ou null pour en créer un */
  profile: Profile | null
  showSnapshots: boolean
  defaultRamMb: number
  maxRamMb: number
  onSave: (input: ProfileInput) => Promise<void>
  onDelete?: (deleteFiles: boolean) => Promise<void>
  onClose: () => void
}

const LOADER_LABELS: Record<Loader, string> = { fabric: 'Fabric', forge: 'Forge', vanilla: 'Vanilla' }

const EMPTY: ProfileInput = {
  name: '',
  icon: '🌊',
  versionId: 'latest-release',
  loader: 'fabric',
  loaderVersion: null,
  ramMb: null
}

export default function ProfileEditor({ profile, showSnapshots, defaultRamMb, maxRamMb, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<ProfileInput>(profile ?? EMPTY)
  const [loaders, setLoaders] = useState<LoaderVersion[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [presets, setPresets] = useState<SettingsPreset[]>([])
  useEffect(() => {
    window.aloria.presets.list().then(setPresets)
  }, [])
  const [saving, setSaving] = useState(false)
  const { versions, latestRelease, latestSnapshot } = useVersions(showSnapshots || form.versionId.includes('snapshot'))

  const set = (patch: Partial<ProfileInput>) => setForm((f) => ({ ...f, ...patch }))

  const gameVersion =
    form.versionId === 'latest-release' ? latestRelease : form.versionId === 'latest-snapshot' ? latestSnapshot : form.versionId

  // Nouveau profil : le chargeur suit la version (Forge avant Sodium et Iris, Fabric après), tant qu'on n'en a pas choisi un
  const [loaderChosen, setLoaderChosen] = useState(!!profile)
  const forgeAvailable = !!gameVersion && forgeSupported(gameVersion)
  useEffect(() => {
    if (loaderChosen || !gameVersion) return
    set({ loader: prefersForge(gameVersion) ? 'forge' : 'fabric', loaderVersion: null })
  }, [gameVersion, loaderChosen])
  const chooseLoader = (loader: Loader) => {
    setLoaderChosen(true)
    set({ loader, loaderVersion: null })
  }
  // Forge n'est proposé que là où Aloria sait l'installer, et il y passe alors en premier
  const loaderOrder: Loader[] = forgeAvailable
    ? ['forge', 'fabric', 'vanilla']
    : form.loader === 'forge'
      ? ['fabric', 'forge', 'vanilla']
      : ['fabric', 'vanilla']

  // Versions du chargeur disponibles pour la version du jeu choisie
  useEffect(() => {
    if (form.loader === 'vanilla' || !gameVersion) return
    setLoaders(null)
    const list = form.loader === 'forge' ? window.aloria.game.forgeLoaders(gameVersion) : window.aloria.game.fabricLoaders(gameVersion)
    // Une réponse arrivée après un changement de chargeur ou de version est ignorée (sinon Fabric écrasait Forge)
    let current = true
    list.then((res) => current && setLoaders(res.ok ? res.value : []))
    return () => {
      current = false
    }
  }, [form.loader, gameVersion])

  const loaderName = form.loader === 'forge' ? 'Forge' : 'Fabric'
  const loaderUnavailable = form.loader !== 'vanilla' && loaders !== null && loaders.length === 0
  const canSave = form.name.trim().length > 0 && !loaderUnavailable && !saving

  const save = async () => {
    setSaving(true)
    await onSave({ ...form, name: form.name.trim() })
    setSaving(false)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog editor" onClick={(e) => e.stopPropagation()}>
        <h3>{profile ? t('editor.editTitle') : t('profiles.new')}</h3>

        <div className="field">
          <span>{t('editor.icon')}</span>
          <div className="icon-picker">
            {ICONS.map((icon) => (
              <button key={icon} className={form.icon === icon ? 'active' : ''} onClick={() => set({ icon })}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{t('editor.name')}</span>
          <input
            autoFocus
            value={form.name}
            maxLength={32}
            placeholder={t('editor.namePlaceholder')}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        <div className="field">
          <span>{t('editor.version')}</span>
          <Select
            name="game-version"
            value={form.versionId}
            onChange={(v) => set({ versionId: v, loaderVersion: null })}
            options={[
              { value: 'latest-release', label: `${t('profiles.latestRelease')}${latestRelease ? ` (${latestRelease})` : ''}` },
              ...(showSnapshots ? [{ value: 'latest-snapshot', label: `${t('profiles.latestSnapshot')}${latestSnapshot ? ` (${latestSnapshot})` : ''}` }] : []),
              ...versions.map((v) => ({ value: v.id, label: `${v.id}${v.type === 'snapshot' ? t('editor.snapshotTag') : ''}` }))
            ]}
          />
        </div>

        <div className="field">
          <span>{t('editor.mods')}</span>
          <div className="segmented">
            {loaderOrder.map((l) => (
              <button key={l} className={form.loader === l ? 'active' : ''} onClick={() => chooseLoader(l)}>
                {LOADER_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {form.loader !== 'vanilla' && (
          <label className="toggle-line hud-toggle">
            <input
              type="checkbox"
              checked={form.aloriaHud !== false}
              onChange={(ev) => set({ aloriaHud: ev.target.checked })}
            />
            <span>
              ✦ Aloria HUD <small className="muted">{t('editor.hudHint')}</small>
            </span>
          </label>
        )}

        {form.loader !== 'vanilla' && form.aloriaHud !== false && gameVersion && !hudAvailable(form.loader, gameVersion) && (
          <small className="warning">
            {t('editor.hudMissing', {
              versions: hudVersionsLabel(form.loader, t('common.and')),
              forge: form.loader === 'forge' ? t('editor.hudMissingForge') : '',
              version: gameVersion
            })}
          </small>
        )}

        {form.loader === 'forge' && (
          <small className="muted">
            {t('editor.forgeHint')}{' '}
            <a href="https://www.patreon.com/LexManos/" target="_blank" rel="noreferrer">
              {t('editor.forgeSupport')}
            </a>
            .
          </small>
        )}

        {form.loader !== 'vanilla' && (
          <div className="field">
            <span>{t('editor.loaderVersion', { loader: loaderName })}</span>
            {loaders === null ? (
              <small className="muted">{t('common.loading')}</small>
            ) : loaderUnavailable ? (
              <small className="warning">
                {t('editor.loaderUnavailable', {
                  loader: loaderName,
                  version: gameVersion ?? '',
                  forge: form.loader === 'forge' ? t('editor.loaderUnavailableForge') : ''
                })}
              </small>
            ) : (
              <Select
                value={form.loaderVersion ?? ''}
                onChange={(v) => set({ loaderVersion: v || null })}
                options={[
                  {
                    value: '',
                    label: t(form.loader === 'forge' ? 'editor.recommended' : 'editor.latestStable', {
                      version: (() => {
                        const l = loaders.find((x) => x.stable) ?? loaders[0]
                        return l.label ?? l.version
                      })()
                    })
                  },
                  ...loaders.map((l) => ({
                    value: l.version,
                    label: `${l.label ?? l.version}${form.loader === 'forge' ? (l.stable ? t('editor.recommendedTag') : '') : l.stable ? '' : t('editor.betaTag')}`
                  }))
                ]}
              />
            )}
          </div>
        )}

        <div className="field">
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={form.ramMb !== null}
              onChange={(e) => set({ ramMb: e.target.checked ? defaultRamMb : null })}
            />
            <span>
              {t('editor.customRam')}
              {form.ramMb === null ? t('editor.customRamDefault', { ram: gb(defaultRamMb) }) : ''}
            </span>
          </label>
          {form.ramMb !== null && (
            <div className="slider-line">
              <input
                type="range"
                className="slider"
                min={1024}
                max={maxRamMb}
                step={512}
                value={Math.min(form.ramMb, maxRamMb)}
                onChange={(e) => set({ ramMb: Number(e.target.value) })}
              />
              <strong>{gb(form.ramMb)}</strong>
            </div>
          )}
        </div>

        <div className="field">
          <span>{t('editor.gameSettings')}</span>
          <Select
            value={form.settingsPreset === null ? '' : (form.settingsPreset ?? 'main')}
            onChange={(v) => set({ settingsPreset: v === '' ? null : v })}
            options={[...presets.map((p) => ({ value: p.id, label: presetName(p) })), { value: '', label: t('editor.ownSettings') }]}
          />
        </div>

        <label className="toggle-line">
          <input type="checkbox" checked={form.shareServers !== false} onChange={(e) => set({ shareServers: e.target.checked })} />
          <span>
            {t('editor.sharedServers')} <small className="muted">{t('editor.sharedServersHint')}</small>
          </span>
        </label>

        <div className="dialog__actions">
          {profile && onDelete && (
            <div className="dialog__danger">
              {confirmDelete ? (
                <>
                  <button className="danger-btn" onClick={() => onDelete(true)}>
                    {t('editor.deleteWithFiles')}
                  </button>
                  <button className="secondary" onClick={() => onDelete(false)}>
                    {t('editor.keepFiles')}
                  </button>
                </>
              ) : (
                <button className="link-danger" onClick={() => setConfirmDelete(true)}>
                  {t('editor.deleteProfile')}
                </button>
              )}
            </div>
          )}
          {profile && (
            <button className="secondary" onClick={() => window.aloria.profiles.openFolder(profile.id)}>
              {t('common.openFolder')}
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary" disabled={!canSave} onClick={save}>
            {profile ? t('common.save') : t('common.create')}
          </button>
        </div>
        {confirmDelete && (
          <small className="muted">
            {t('editor.deleteHint')}
          </small>
        )}
      </div>
    </div>
  )
}
