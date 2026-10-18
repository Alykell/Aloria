import { useCallback, useEffect, useMemo, useState } from 'react'
import PackEditor from './PackEditor'
import RecipeEditor, { hasDatapacks } from './RecipeEditor'
import Select from './Select'
import { useVersions } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { DatapackCreation, PackInfo } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'

interface Props {
  profiles: ProfilesState
  onError: (message: string) => void
  /** Éditeur de recettes ouvert : plein écran, sans le menu de gauche */
  onFocus: (focused: boolean) => void
}

type Tool = 'packs' | 'datapacks'
const TOOLS: { id: Tool; icon: string; title: MessageKey; text: MessageKey }[] = [
  { id: 'packs', icon: '🎨', title: 'creations.tool.packs', text: 'creations.tool.packsText' },
  { id: 'datapacks', icon: '📜', title: 'creations.tool.recipes', text: 'creations.tool.recipesText' }
]
const TOOL_KEY = 'aloria.creations.tool'

function savedTool(): Tool {
  try {
    const v = localStorage.getItem(TOOL_KEY)
    return v === 'datapacks' ? v : 'packs'
  } catch {
    return 'packs'
  }
}

/** « Créations » : les outils de création d'Aloria (packs de textures, recettes…), chacun avec ses créations */
export default function CreationsPage({ profiles, onError, onFocus }: Props) {
  const [tool, setTool] = useState<Tool>(savedTool)
  const [packs, setPacks] = useState<PackInfo[] | null>(null)
  const [datapacks, setDatapacks] = useState<DatapackCreation[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [version, setVersion] = useState('latest-release')
  const { versions } = useVersions(false)

  const refresh = useCallback(async () => {
    const [p, d] = await Promise.all([window.aloria.packs.list(), window.aloria.datapacks.list()])
    if (p.ok) setPacks(p.value)
    else onError(p.error)
    if (d.ok) setDatapacks(d.value)
    else onError(d.error)
  }, [onError])

  useEffect(() => {
    refresh()
  }, [refresh])

  const chooseTool = (next: Tool) => {
    setTool(next)
    try {
      localStorage.setItem(TOOL_KEY, next)
    } catch {
      // stockage indisponible : le choix n'est pas retenu
    }
  }

  const datapack = tool === 'datapacks' ? datapacks?.find((d) => d.id === editing) : undefined
  useEffect(() => {
    onFocus(!!datapack)
  }, [!!datapack, onFocus])
  useEffect(() => () => onFocus(false), [onFocus])

  const openCreate = () => {
    setName('')
    // Version du profil choisi si elle a des datapacks, sinon la dernière
    const selected = profiles.selected?.versionId
    setVersion(selected && hasDatapacks(selected) ? selected : 'latest-release')
    setCreating(true)
  }

  const create = async () => {
    const res = tool === 'packs' ? await window.aloria.packs.create(name) : await window.aloria.datapacks.create(name, version)
    if (!res.ok) return onError(res.error)
    setCreating(false)
    await refresh()
    setEditing(res.value.id)
  }

  const removePack = async (pack: PackInfo) => {
    if (!confirm(t('creations.confirmDelete', { name: pack.name }))) return
    const res = await window.aloria.packs.remove(pack.id)
    if (!res.ok) onError(res.error)
    refresh()
  }

  const removeDatapack = async (dp: DatapackCreation) => {
    if (!confirm(t('creations.confirmDeleteDatapack', { name: dp.name }))) return
    const res = await window.aloria.datapacks.remove(dp.id)
    if (!res.ok) onError(res.error)
    refresh()
  }

  const versionOptions = useMemo(() => {
    const list = [{ value: 'latest-release', label: t('profiles.latestRelease') }]
    for (const v of versions) if (v.type === 'release' && hasDatapacks(v.id)) list.push({ value: v.id, label: `Minecraft ${v.id}` })
    if (!list.some((o) => o.value === version)) list.push({ value: version, label: `Minecraft ${version}` })
    return list
  }, [versions, version])

  const pack = tool === 'packs' ? packs?.find((p) => p.id === editing) : undefined
  if (pack) {
    return (
      <PackEditor
        pack={pack}
        profiles={profiles}
        onBack={() => {
          setEditing(null)
          refresh()
        }}
        onChanged={(next) => setPacks((list) => list?.map((p) => (p.id === next.id ? next : p)) ?? null)}
        onError={onError}
      />
    )
  }
  if (datapack) {
    return (
      <RecipeEditor
        datapack={datapack}
        profiles={profiles}
        onBack={() => {
          setEditing(null)
          refresh()
        }}
        onChanged={(next) => setDatapacks((list) => list?.map((d) => (d.id === next.id ? next : d)) ?? null)}
        onError={onError}
      />
    )
  }

  const count = { packs: packs?.length ?? 0, datapacks: datapacks?.length ?? 0 }
  return (
    <section className="page wide creations">
      <h2>{t('nav.creations')}</h2>
      <p className="page__lead">{t('creations.hubLead')}</p>

      <div className="creation-tools">
        {TOOLS.map((it) => (
          <button key={it.id} className={'creation-tool' + (tool === it.id ? ' active' : '')} onClick={() => chooseTool(it.id)}>
            <span className="creation-tool__icon">{it.icon}</span>
            <span className="creation-tool__text">
              <strong>{t(it.title)}</strong>
              <small>{t(it.text)}</small>
            </span>
            {count[it.id] > 0 && <span className="creation-tool__count">{count[it.id]}</span>}
          </button>
        ))}
        <div className="creation-tool soon" aria-disabled>
          <span className="creation-tool__icon">✨</span>
          <span className="creation-tool__text">
            <strong>{t('creations.tool.soon')}</strong>
            <small>{t('creations.tool.soonText')}</small>
          </span>
        </div>
      </div>

      <p className="muted creations__lead">{t(tool === 'packs' ? 'creations.lead' : 'creations.recipesLead')}</p>

      <div className="pack-grid">
        <button className="pack-card pack-card--new" onClick={openCreate}>
          <span className="pack-card__plus">+</span>
          <strong>{t(tool === 'packs' ? 'creations.create' : 'creations.createDatapack')}</strong>
        </button>
        {tool === 'packs' &&
          packs?.map((p) => (
            <div key={p.id} className="pack-card" onClick={() => setEditing(p.id)}>
              <div className="pack-card__preview">
                {p.images.crosshair ? <img src={p.images.crosshair} alt="" className="pixel" /> : <span>🎨</span>}
              </div>
              <strong>{p.name}</strong>
              <small className="muted">
                {t(Object.keys(p.images).length > 1 ? 'creations.changedMany' : 'creations.changedOne', { n: Object.keys(p.images).length })}
              </small>
              <DeleteButton onClick={() => removePack(p)} />
            </div>
          ))}
        {tool === 'datapacks' &&
          datapacks?.map((d) => (
            <div key={d.id} className="pack-card" onClick={() => setEditing(d.id)}>
              <div className="pack-card__preview">
                <span>📜</span>
              </div>
              <strong>{d.name}</strong>
              <small className="muted">
                {t(d.recipes.length > 1 ? 'rc.countMany' : 'rc.countOne', { n: d.recipes.length })} · {d.gameVersion}
              </small>
              {Object.keys(d.installed).length > 0 && (
                <small className="pack-card__installed">✓ {t('rc.installedIn', { n: Object.keys(d.installed).length })}</small>
              )}
              <DeleteButton onClick={() => removeDatapack(d)} />
            </div>
          ))}
      </div>

      {creating && (
        <div className="overlay" onClick={() => setCreating(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{t(tool === 'packs' ? 'creations.newPack' : 'creations.newDatapack')}</h3>
            <label className="field">
              <span>{t('editor.name')}</span>
              <input
                autoFocus
                placeholder={t(tool === 'packs' ? 'creations.namePlaceholder' : 'creations.datapackPlaceholder')}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </label>
            {tool === 'datapacks' && (
              <label className="field">
                <span>{t('creations.datapackVersion')}</span>
                <Select value={version} options={versionOptions} onChange={setVersion} />
                <small className="muted">{t('creations.datapackVersionHint')}</small>
              </label>
            )}
            <div className="dialog__actions">
              <button onClick={() => setCreating(false)}>{t('common.cancel')}</button>
              <button className="primary" onClick={create}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="pack-card__delete"
      title={t('common.delete')}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      ✕
    </button>
  )
}
