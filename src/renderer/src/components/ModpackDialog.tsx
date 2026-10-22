import { useEffect, useRef, useState } from 'react'
import type { ContentType, ModpackPreview, ModpackSource, ModpackVersion, Profile } from '../../../shared/types'
import { PROGRESS_STEPS, clearModpackTask, describeProgress, minimizeModpackTask, startModpackTask, useModpackTask } from '../hooks/useModpackTask'
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
  /** Profil dont on met à jour le modpack (sinon, installation dans un nouveau profil) */
  update?: Profile
  /** Version choisie d'office (la nouvelle version trouvée pour le profil) */
  preferredVersionId?: string
}

/** Aperçu d'un modpack (version, liste des mods) puis installation dans un nouveau profil, ou mise à jour d'un profil */
export default function ModpackDialog({ target, onClose, onInstalled, update, preferredVersionId }: Props) {
  const [versions, setVersions] = useState<ModpackVersion[] | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ModpackPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Installation suivie hors de la fenêtre (elle continue si on la réduit) ; « mine » : lancée depuis cette fenêtre
  const task = useModpackTask()
  const mine = useRef(false)
  const own = mine.current ? task : null
  const installing = !!own?.running
  const done = own?.result ?? null
  const progress = own?.progress ?? null
  // Une autre installation tourne déjà (lancée ailleurs, puis réduite)
  const busyElsewhere = !!task?.running && !mine.current
  // « Vérifier mes téléchargements » : l'aperçu relit le dossier Téléchargements
  const [recheck, setRecheck] = useState(0)
  // Nouveau profil pour jouer, ou serveur (page Serveurs) avec la même version et le même chargeur
  const [asServer, setAsServer] = useState(false)
  const [eula, setEula] = useState(false)

  // Projet Modrinth : ses versions, la plus récente installable (finale de préférence) choisie d'office
  useEffect(() => {
    if (!('projectId' in target)) return
    window.aloria.modpacks.versions(target.projectId).then((res) => {
      if (!res.ok) return setError(res.error)
      setVersions(res.value)
      const pick =
        res.value.find((v) => v.id === preferredVersionId) ??
        res.value.find((v) => v.supported && v.stable) ??
        res.value.find((v) => v.supported) ??
        res.value[0]
      setVersionId(pick?.id ?? null)
    })
  }, [target])

  const source: ModpackSource | null =
    'file' in target ? { kind: 'file', path: target.file } : versionId ? { kind: 'modrinth', projectId: target.projectId, versionId } : null

  useEffect(() => {
    if (!source) return
    let cancelled = false
    if (recheck === 0) setPreview(null)
    setError(null)
    window.aloria.modpacks.preview(source, update?.id).then((res) => {
      if (cancelled) return
      if (res.ok) setPreview(res.value)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [source?.kind === 'file' ? source.path : versionId, recheck])

  const install = () => {
    if (!source) return
    setError(null)
    mine.current = true
    startModpackTask(
      { title, iconUrl, update: !!update, server: asServer && !update },
      () =>
        update
          ? window.aloria.modpacks.update(update.id, source)
          : asServer
            ? window.aloria.modpacks.installServer(source)
            : window.aloria.modpacks.install(source),
      onInstalled
    )
  }

  // Fermer la fenêtre pendant l'installation la réduit ; sinon, l'installation terminée est oubliée
  const close = () => {
    if (installing) minimizeModpackTask()
    else if (mine.current) clearModpackTask()
    onClose()
  }

  const title = preview?.name ?? ('title' in target ? target.title : '…')
  // Mise à jour vers la version déjà installée : rien à faire
  const sameVersion = !!update && 'projectId' in target && versionId === update.modpack?.versionId
  const iconUrl = 'iconUrl' in target ? target.iconUrl : null
  const { stepIndex, percent, label: stepLabel } = describeProgress(progress, !!update)
  const shownError = error ?? own?.error ?? null

  return (
    <div className="overlay" onClick={close}>
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
                label: `${v.versionNumber} · ${v.gameVersions.join(', ')}${v.stable ? '' : ` · ${t('modpack.beta')}`}${v.supported ? '' : ` · ${t('modpack.notSupported')}`}${v.id === update?.modpack?.versionId ? ` · ${t('modpack.current')}` : ''}`
              }))}
            />
          </label>
        )}

        {preview?.summary && <p className="muted">{preview.summary}</p>}
        {!update && !done && (
          <div className="modpack__target">
            <div className="segmented small">
              <button className={asServer ? '' : 'active'} disabled={installing} onClick={() => setAsServer(false)}>
                🎮 {t('modpack.asProfile')}
              </button>
              <button className={asServer ? 'active' : ''} disabled={installing} onClick={() => setAsServer(true)}>
                🖥️ {t('modpack.asServer')}
              </button>
            </div>
            {asServer && (
              <>
                <p className="muted">{t('modpack.serverHint')}</p>
                <label className="toggle-line">
                  <input type="checkbox" checked={eula} disabled={installing} onChange={(e) => setEula(e.target.checked)} />
                  <span>
                    {t('server.eula')}{' '}
                    <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">
                      {t('server.eulaLink')}
                    </a>
                  </span>
                </label>
              </>
            )}
          </div>
        )}
        {preview?.unsupported && <p className="modpack__warning">⚠️ {preview.unsupported}</p>}
        {update && preview && !preview.unsupported && !sameVersion && (
          <>
            <p className="muted">{t('modpack.updateHint')}</p>
            {preview.gameVersion !== update.versionId && (
              <p className="modpack__warning">⚠️ {t('modpack.gameChange', { from: update.versionId, to: preview.gameVersion })}</p>
            )}
          </>
        )}
        {shownError && <p className="modpack__warning">⚠️ {shownError}</p>}
        {busyElsewhere && <p className="muted">{t('modpack.busy')}</p>}

        {!preview && !shownError && <p className="muted center">{t('common.loading')}</p>}

        {preview && preview.manual.length > 0 && (
          <div className="modpack__manual">
            <h4>
              ⬇ {t('modpack.manualTitle', { found: preview.manual.filter((m) => m.found).length, total: preview.manual.length })}
            </h4>
            <p className="muted">{t('modpack.manualHint')}</p>
            {preview.manual.map((m) => (
              <div key={m.fileName} className="modpack__file">
                <span>{m.title}</span>
                {m.found ? (
                  <span className="chip">✓ {t('modpack.manualFound')}</span>
                ) : (
                  <a className="secondary small" href={m.url} target="_blank" rel="noreferrer">
                    {t('modpack.manualDownload')}
                  </a>
                )}
              </div>
            ))}
            {preview.manual.some((m) => !m.found) && (
              <button className="secondary" disabled={installing} onClick={() => setRecheck((n) => n + 1)}>
                {t('modpack.manualCheck')}
              </button>
            )}

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

          </div>
        )}

        {installing && (
          <div className="progress">
            <div className="progress__label">
              <span>
                {stepIndex >= 0 && <strong>{t('modpack.step', { n: stepIndex + 1, total: PROGRESS_STEPS.length })} · </strong>}
                {stepLabel}
              </span>
              <span>{percent !== null ? `${percent} %` : ''}</span>
            </div>
            <div className={'progress__bar' + (percent === null ? ' indeterminate' : '')}>
              <div className="progress__fill" style={percent !== null ? { width: `${percent}%` } : undefined} />
            </div>
          </div>
        )}

        {done && (
          <p className="modpack__done">
            ✓{' '}
            {own?.server
              ? t('modpack.serverDone', { name: done.name })
              : update
                ? t('modpack.updated', { name: done.name, version: ('modpack' in done && done.modpack?.versionNumber) || '' })
                : t('modpack.done', { name: done.name })}
          </p>
        )}

        <div className="dialog__actions">
          <button className="secondary" onClick={close}>
            {t(installing ? 'modpack.minimize' : done ? 'common.close' : 'common.cancel')}
          </button>
          {!done && (
            <button className="primary" disabled={!preview || !!preview.unsupported || installing || busyElsewhere || sameVersion || (asServer && !eula)}
              onClick={install}
            >
              {installing
                ? t('library.installing')
                : preview?.manual.some((m) => !m.found)
                  ? t('modpack.manualMissing')
                  : preview?.unsupported
                    ? t('modpack.notInstallable')
                  : t(update ? 'modpack.update' : asServer ? 'modpack.installServer' : 'modpack.install')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
