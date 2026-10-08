import { useEffect, useState } from 'react'
import { useVersions } from '../hooks/useVersions'
import { hudAvailable, hudVersionsLabel } from '../../../shared/aloriaHud'
import { forgeSupported, prefersForge } from '../../../shared/loaders'
import type { Loader, LoaderVersion, Profile, ProfileInput, SettingsPreset } from '../../../shared/types'

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
    list.then((res) => setLoaders(res.ok ? res.value : []))
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
        <h3>{profile ? 'Modifier le profil' : 'Nouveau profil'}</h3>

        <div className="field">
          <span>Icône</span>
          <div className="icon-picker">
            {ICONS.map((icon) => (
              <button key={icon} className={form.icon === icon ? 'active' : ''} onClick={() => set({ icon })}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Nom</span>
          <input
            autoFocus
            value={form.name}
            maxLength={32}
            placeholder="Ex. Survie entre amis"
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Version du jeu</span>
          <select value={form.versionId} onChange={(e) => set({ versionId: e.target.value, loaderVersion: null })}>
            <option value="latest-release">Dernière version{latestRelease ? ` (${latestRelease})` : ''}</option>
            {showSnapshots && <option value="latest-snapshot">Dernier snapshot{latestSnapshot ? ` (${latestSnapshot})` : ''}</option>}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
                {v.type === 'snapshot' ? ' (snapshot)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Mods</span>
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
              ✦ Aloria HUD <small className="muted">· FPS, CPS, touches, armure… (Échap ou Maj droite en jeu)</small>
            </span>
          </label>
        )}

        {form.loader !== 'vanilla' && form.aloriaHud !== false && gameVersion && !hudAvailable(form.loader, gameVersion) && (
          <small className="warning">
            Aloria HUD n'existe que pour Minecraft {hudVersionsLabel(form.loader)}
            {form.loader === 'forge' ? ' sous Forge' : ''} : il ne sera pas chargé en {gameVersion}.
          </small>
        )}

        {form.loader === 'forge' && (
          <small className="muted">
            Forge, pour jouer avec OptiFine (shaders, zoom…) dans les versions d'avant Sodium et Iris. Forge vit des publicités
            de son site :{' '}
            <a href="https://www.patreon.com/LexManos/" target="_blank" rel="noreferrer">
              tu peux le soutenir ici
            </a>
            .
          </small>
        )}

        {form.loader !== 'vanilla' && (
          <label className="field">
            <span>Version de {loaderName}</span>
            {loaders === null ? (
              <small className="muted">Chargement…</small>
            ) : loaderUnavailable ? (
              <small className="warning">
                {loaderName} n'est pas disponible pour Minecraft {gameVersion}
                {form.loader === 'forge' ? ' dans Aloria (géré jusqu’à la 1.12.2)' : ''}.
              </small>
            ) : (
              <select value={form.loaderVersion ?? ''} onChange={(e) => set({ loaderVersion: e.target.value || null })}>
                <option value="">
                  {form.loader === 'forge' ? 'Recommandée' : 'Dernière stable'} (
                  {(() => {
                    const l = loaders.find((x) => x.stable) ?? loaders[0]
                    return l.label ?? l.version
                  })()}
                  )
                </option>
                {loaders.map((l) => (
                  <option key={l.version} value={l.version}>
                    {l.label ?? l.version}
                    {form.loader === 'forge' ? (l.stable ? ' (recommandée)' : '') : l.stable ? '' : ' (bêta)'}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <div className="field">
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={form.ramMb !== null}
              onChange={(e) => set({ ramMb: e.target.checked ? defaultRamMb : null })}
            />
            <span>Mémoire personnalisée{form.ramMb === null ? ` (par défaut : ${(defaultRamMb / 1024).toFixed(1)} Go)` : ''}</span>
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
              <strong>{(form.ramMb / 1024).toFixed(1)} Go</strong>
            </div>
          )}
        </div>

        <label className="field">
          <span>Réglages du jeu</span>
          <select
            value={form.settingsPreset === null ? '' : (form.settingsPreset ?? 'main')}
            onChange={(e) => set({ settingsPreset: e.target.value === '' ? null : e.target.value })}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">Propres à ce profil (non partagés)</option>
          </select>
        </label>

        <label className="toggle-line">
          <input type="checkbox" checked={form.shareServers !== false} onChange={(e) => set({ shareServers: e.target.checked })} />
          <span>
            Liste des serveurs commune <small className="muted">· la même dans tous les profils</small>
          </span>
        </label>

        <div className="dialog__actions">
          {profile && onDelete && (
            <div className="dialog__danger">
              {confirmDelete ? (
                <>
                  <button className="danger-btn" onClick={() => onDelete(true)}>
                    Supprimer avec ses fichiers
                  </button>
                  <button className="secondary" onClick={() => onDelete(false)}>
                    Garder les fichiers
                  </button>
                </>
              ) : (
                <button className="link-danger" onClick={() => setConfirmDelete(true)}>
                  Supprimer le profil
                </button>
              )}
            </div>
          )}
          {profile && (
            <button className="secondary" onClick={() => window.aloria.profiles.openFolder(profile.id)}>
              Ouvrir le dossier
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="primary" disabled={!canSave} onClick={save}>
            {profile ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
        {confirmDelete && (
          <small className="muted">
            « Avec ses fichiers » envoie le dossier du profil (mondes, mods, captures) dans la corbeille.
          </small>
        )}
      </div>
    </div>
  )
}
