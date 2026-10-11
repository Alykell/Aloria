import { useEffect, useState } from 'react'
import type { ContentType, ModpackPreview, ModpackProgress, ModpackSource, ModpackVersion, Profile } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import Select from './Select'
import { t } from '../i18n'

/** Modpack à ouvrir : un projet Modrinth (on choisit sa version) ou un fichier .mrpack du joueur */
export type ModpackTarget = { projectId: string; title: string; iconUrl: string | null } | { file: string }

const GROUPS: { type: ContentType | 'other'; label: MessageKey; icon: string }[] = [
  { type: 'mod', label: 'library.tabMods', icon: '🧩' },
  { type: 'resourcepack', label: 'library.tabResourcepacks', icon: '🎨' },
  { type: 'shader', label: 'library.tabShaders', icon: '✨' },
  { type: 'other', label: 'modpack.other', icon: '📄' }
]

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt', vanilla: 'Vanilla' }

interface Props {
  target: ModpackTarget
  onClose: () => void
  onInstalled: (profile: Profile) => void
}

/** Aperçu d'un modpack (version, liste des mods) puis installation dans un nouveau profil */
export default function ModpackDialog({ target, onClose, onInstalled }: Props) {
  const [versions, setVersions] = useState<ModpackVersion[] | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ModpackPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ModpackProgress | null>(null)
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState<Profile | null>(null)

  // Projet Modrinth : ses versions, la plus récente installable (finale de préférence) choisie d'office
  useEffect(() => {
    if (!('projectId' in target)) return
    window.aloria.modpacks.versions(target.projectId).then((res) => {
      if (!res.ok) return setError(res.error)
      setVersions(res.value)
      const pick = res.value.find((v) => v.supported && v.stable) ?? res.value.find((v) => v.supported) ?? res.value[0]
      setVersionId(pick?.id ?? null)
    })
  }, [target])

  const source: ModpackSource | null =
    'file' in target ? { kind: 'file', path: target.file } : versionId ? { kind: 'modrinth', projectId: target.projectId, versionId } : null

  useEffect(() => {
    if (!source) return
    let cancelled = false
    setPreview(null)
    setError(null)
    window.aloria.modpacks.preview(source).then((res) => {
      if (cancelled) return
      if (res.ok) setPreview(res.value)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [source?.kind === 'file' ? source.path : versionId])

  useEffect(() => window.aloria.modpacks.onProgress(setProgress), [])

  const install = async () => {
    if (!source) return
    setInstalling(true)
    setError(null)
    setProgress(null)
    const res = await window.aloria.modpacks.install(source)
    setInstalling(false)
    if (!res.ok) return setError(res.error)
    setDone(res.value)
    onInstalled(res.value)
  }

  const title = preview?.name ?? ('title' in target ? target.title : '…')
  const iconUrl = 'iconUrl' in target ? target.iconUrl : null
  const percent = progress && progress.totalFiles > 0 ? Math.round((progress.doneFiles / progress.totalFiles) * 100) : 0

  return (
    <div className="overlay" onClick={installing ? undefined : onClose}>
      <div className="dialog modpack" onClick={(e) => e.stopPropagation()}>
        <div className="modpack__head">
          {iconUrl ? <img src={iconUrl} alt="" /> : <div className="result__noicon">📦</div>}
          <div>
            <h3>{title}</h3>
            {preview && (
              <small className="muted">
                Minecraft {preview.gameVersion} · {LOADER_NAMES[preview.loader] ?? preview.loader}
                {preview.loaderVersion ? ` ${preview.loaderVersion}` : ''}
              </small>
            )}
          </div>
        </div>

        {versions && versions.length > 0 && (
          <label className="modpack__version">
            <span>{t('modpack.version')}</span>
            <Select
              name="modpack-version"
              value={versionId ?? ''}
              onChange={setVersionId}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.versionNumber} · ${v.gameVersions.join(', ')}${v.stable ? '' : ` · ${t('modpack.beta')}`}${v.supported ? '' : ` · ${t('modpack.notSupported')}`}`
              }))}
            />
          </label>
        )}

        {preview?.summary && <p className="muted">{preview.summary}</p>}
        {preview?.unsupported && <p className="modpack__warning">⚠️ {preview.unsupported}</p>}
        {error && <p className="modpack__warning">⚠️ {error}</p>}

        {!preview && !error && <p className="muted center">{t('common.loading')}</p>}

        {preview && (
          <div className="modpack__files">
            {GROUPS.map((group) => {
              const list = preview.files.filter((f) => f.type === group.type)
              if (list.length === 0) return null
              return (
                <div key={group.type}>
                  <h4>
                    {group.icon} {t(group.label)} <span className="muted">({list.length})</span>
                  </h4>
                  {list.map((f) => (
                    <div key={f.path} className="modpack__file">
                      {f.iconUrl ? <img src={f.iconUrl} alt="" loading="lazy" /> : <div className="result__noicon small">{group.icon}</div>}
                      <span>{f.title}</span>
                      {f.optional && <span className="chip">{t('modpack.optional')}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
            {preview.overrides > 0 && <p className="muted">{t('modpack.overrides', { n: preview.overrides })}</p>}
          </div>
        )}

        {installing && (
          <div className="progress">
            <div className="progress__label">
              <span>{t('modpack.installing')}</span>
              <span>{progress ? `${progress.doneFiles} / ${progress.totalFiles}` : ''}</span>
            </div>
            <div className={'progress__bar' + (progress ? '' : ' indeterminate')}>
              <div className="progress__fill" style={progress ? { width: `${percent}%` } : undefined} />
            </div>
          </div>
        )}

        {done && <p className="modpack__done">✓ {t('modpack.done', { name: done.name })}</p>}

        <div className="dialog__actions">
          <button className="secondary" disabled={installing} onClick={onClose}>
            {t(done ? 'common.close' : 'common.cancel')}
          </button>
          {!done && (
            <button className="primary" disabled={!preview || !!preview.unsupported || installing} onClick={install}>
              {installing ? t('library.installing') : t('modpack.install')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
