import { useEffect, useState } from 'react'
import { useVersions } from '../hooks/useVersions'
import { ALORIA_HUD_MC_VERSIONS } from '../../../shared/aloriaHud'
import type { LoaderVersion, Profile, ProfileInput } from '../../../shared/types'

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

const EMPTY: ProfileInput = {
  name: '',
  icon: '🌊',
  versionId: 'latest-release',
  loader: 'vanilla',
  loaderVersion: null,
  ramMb: null
}

export default function ProfileEditor({ profile, showSnapshots, defaultRamMb, maxRamMb, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<ProfileInput>(profile ?? EMPTY)
  const [loaders, setLoaders] = useState<LoaderVersion[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const { versions, latestRelease, latestSnapshot } = useVersions(showSnapshots || form.versionId.includes('snapshot'))

  const set = (patch: Partial<ProfileInput>) => setForm((f) => ({ ...f, ...patch }))

  const gameVersion =
    form.versionId === 'latest-release' ? latestRelease : form.versionId === 'latest-snapshot' ? latestSnapshot : form.versionId

  // Versions de Fabric disponibles pour la version du jeu choisie
  useEffect(() => {
    if (form.loader !== 'fabric' || !gameVersion) return
    setLoaders(null)
    window.aloria.game.fabricLoaders(gameVersion).then((res) => setLoaders(res.ok ? res.value : []))
  }, [form.loader, gameVersion])

  const fabricUnavailable = form.loader === 'fabric' && loaders !== null && loaders.length === 0
  const canSave = form.name.trim().length > 0 && !fabricUnavailable && !saving

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
            <button className={form.loader === 'vanilla' ? 'active' : ''} onClick={() => set({ loader: 'vanilla', loaderVersion: null })}>
              Vanilla
            </button>
            <button className={form.loader === 'fabric' ? 'active' : ''} onClick={() => set({ loader: 'fabric' })}>
              Fabric
            </button>
          </div>
        </div>

        {form.loader === 'fabric' && (
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

        {form.loader === 'fabric' && form.aloriaHud !== false && gameVersion && !ALORIA_HUD_MC_VERSIONS.includes(gameVersion) && (
          <small className="warning">
            Aloria HUD n'existe que pour Minecraft {ALORIA_HUD_MC_VERSIONS.join(' et ')} : il ne sera pas chargé en {gameVersion}.
          </small>
        )}

        {form.loader === 'fabric' && (
          <label className="field">
            <span>Version de Fabric</span>
            {loaders === null ? (
              <small className="muted">Chargement…</small>
            ) : fabricUnavailable ? (
              <small className="warning">Fabric n'est pas disponible pour Minecraft {gameVersion}.</small>
            ) : (
              <select value={form.loaderVersion ?? ''} onChange={(e) => set({ loaderVersion: e.target.value || null })}>
                <option value="">Dernière stable ({(loaders.find((l) => l.stable) ?? loaders[0]).version})</option>
                {loaders.map((l) => (
                  <option key={l.version} value={l.version}>
                    {l.version}
                    {l.stable ? '' : ' (bêta)'}
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
