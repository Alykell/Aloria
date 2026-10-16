import { useCallback, useEffect, useRef, useState } from 'react'
import InstalledList from './InstalledList'
import ModpackDialog, { type ModpackTarget } from './ModpackDialog'
import { describeProfile } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { ContentType, InstalledContent, Profile, SearchHit, SearchSort } from '../../../shared/types'
import Select from './Select'
import { compactNumber, t } from '../i18n'
import type { MessageKey } from '../../../shared/i18n'

type Tab = ContentType | 'modpack' | 'installed'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'mod', label: 'library.tabMods' },
  { id: 'resourcepack', label: 'library.tabResourcepacks' },
  { id: 'shader', label: 'library.tabShaders' },
  { id: 'datapack', label: 'library.tabDatapacks' },
  { id: 'modpack', label: 'library.tabModpacks' },
  { id: 'installed', label: 'library.tabInstalled' }
]

const SEARCH_PLACEHOLDERS: Record<ContentType | 'modpack', MessageKey> = {
  mod: 'library.searchMods',
  resourcepack: 'library.searchResourcepacks',
  shader: 'library.searchShaders',
  datapack: 'library.searchDatapacks',
  modpack: 'library.searchModpacks'
}

/** Les datapacks existent depuis la 1.13 (« latest-release », snapshots et 26.x : récents) */
const hasDatapacks = (versionId: string) => {
  const m = /^1\.(\d+)/.exec(versionId)
  return !m || Number(m[1]) >= 13
}

const SORTS: { id: SearchSort; label: MessageKey }[] = [
  { id: 'relevance', label: 'library.sortRelevance' },
  { id: 'downloads', label: 'library.sortDownloads' },
  { id: 'updated', label: 'library.sortUpdated' },
  { id: 'newest', label: 'library.sortNewest' }
]

interface Props {
  profiles: ProfilesState
  /** Onglet Modpacks (masquable dans les Paramètres) */
  showModpacks: boolean
  onError: (message: string) => void
  onOpenProfiles: () => void
}

export default function LibraryPage({ profiles, showModpacks, onError, onOpenProfiles }: Props) {
  const [profileId, setProfileId] = useState<string | null>(profiles.selected?.id ?? null)
  const [tab, setTab] = useState<Tab>('mod')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [gameVersion, setGameVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [installed, setInstalled] = useState<InstalledContent[]>([])
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [modpack, setModpack] = useState<ModpackTarget | null>(null)
  const requestId = useRef(0)
  // dragenter / dragleave se déclenchent aussi en passant d'un élément à l'autre : on compte les entrées
  const dragDepth = useRef(0)

  const profile = profiles.profiles.find((p) => p.id === profileId) ?? profiles.selected
  const datapacks = !profile || hasDatapacks(profile.versionId)
  // Profil 1.8.9 choisi depuis l'onglet Datapacks : retour aux mods
  useEffect(() => {
    if (!datapacks && tab === 'datapack') setTab('mod')
  }, [datapacks, tab])
  const needsLoader = (tab === 'mod' || tab === 'shader') && profile?.loader === 'vanilla'
  // Profils Forge : OptiFine (shaders, zoom…) s'ajoute à la main, il n'est pas sur Modrinth
  const showOptiFine = (tab === 'mod' || tab === 'shader') && profile?.loader === 'forge'
  const optiFine = installed.find((i) => i.type === 'mod' && /optifine/i.test(i.fileName))
  const addOptiFine = async () => {
    if (!profile) return
    const res = await window.aloria.library.addOptiFine(profile.id)
    if (!res.ok) onError(res.error)
    else if (res.value) refreshInstalled()
  }

  useEffect(() => {
    if (!profileId && profiles.selected) setProfileId(profiles.selected.id)
  }, [profileId, profiles.selected])

  const refreshInstalled = useCallback(async () => {
    if (!profile) return
    const res = await window.aloria.library.installed(profile.id)
    if (res.ok) setInstalled(res.value)
  }, [profile?.id])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  const runSearch = useCallback(
    async (offset: number) => {
      if (!profile || tab === 'installed') return
      const id = ++requestId.current
      setLoading(true)
      const res = await window.aloria.library.search({ profileId: profile.id, type: tab, query, sort, offset })
      // On ignore les réponses d'une recherche déjà remplacée par une plus récente
      if (id !== requestId.current) return
      setLoading(false)
      if (!res.ok) return onError(res.error)
      setGameVersion(res.value.gameVersion)
      setTotal(res.value.total)
      setHits((prev) => (offset === 0 ? res.value.hits : [...prev, ...res.value.hits]))
    },
    [profile?.id, tab, query, sort, onError]
  )

  // Recherche avec un petit délai pendant la frappe
  useEffect(() => {
    const timer = setTimeout(() => runSearch(0), query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [runSearch])

  // Un modpack crée son propre profil : la Bibliothèque passe dessus pour montrer ce qu'il contient
  const modpackInstalled = async (created: Profile) => {
    await profiles.refresh()
    setProfileId(created.id)
    setTab('installed')
  }

  const install = async (hit: SearchHit) => {
    if (tab === 'modpack') return setModpack({ projectId: hit.projectId, title: hit.title, iconUrl: hit.iconUrl })
    if (!profile || tab === 'installed') return
    setInstalling((s) => new Set(s).add(hit.projectId))
    const res = await window.aloria.library.install(profile.id, hit.projectId, tab)
    setInstalling((s) => {
      const next = new Set(s)
      next.delete(hit.projectId)
      return next
    })
    if (!res.ok) onError(res.error)
    await refreshInstalled()
  }

  // Fichiers du joueur (bouton : fenêtre de choix ; glisser-déposer : fichiers donnés)
  const importFiles = async (files: File[] | null) => {
    if (!profile || importing) return
    setImporting(true)
    const res = await window.aloria.library.import(profile.id, files)
    setImporting(false)
    if (!res.ok) return onError(res.error)
    if (!res.value) return
    await refreshInstalled()
    if (res.value.added.length > 0) setTab('installed')
    if (res.value.errors.length > 0) onError(res.value.errors.join(' '))
    if (res.value.modpacks.length > 0) setModpack({ file: res.value.modpacks[0] })
    // Profils complets glissés : chacun devient un nouveau profil, la Bibliothèque passe sur le dernier
    let created: Profile | null = null
    for (const path of res.value.instances) {
      const imported = await window.aloria.profiles.importZip(path)
      if (!imported.ok) onError(imported.error)
      else if (imported.value && 'id' in imported.value) created = imported.value
    }
    if (created) await modpackInstalled(created)
  }

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) importFiles(files)
    }
  }

  const installedIds = new Set(installed.map((i) => i.projectId).filter(Boolean))

  if (!profile) return null

  return (
    <section className="page wide library" {...dropHandlers}>
      {modpack && <ModpackDialog target={modpack} onClose={() => setModpack(null)} onInstalled={modpackInstalled} />}
      {dragging && (
        <div className="library__drop">
          <strong>📥 {t('library.drop')}</strong>
          <span>{t('library.dropProfile', { name: profile.name })}</span>
        </div>
      )}
      <div className="library__header">
        <h2>{t('library.title')}</h2>
        <div className="library__profile">
          <button className="secondary" disabled={importing} title={t('library.importHint')} onClick={() => importFiles(null)}>
            📥 {importing ? t('library.installing') : t('library.import')}
          </button>
          <span>{t('library.profile')}</span>
          <Select
            name="library-profile"
            value={profile.id}
            onChange={setProfileId}
            options={profiles.profiles.map((p) => ({ value: p.id, label: `${p.icon} ${p.name} · ${describeProfile(p)}` }))}
          />
        </div>
      </div>

      <div className="tabs">
        {TABS.filter((it) => (showModpacks || it.id !== 'modpack') && (datapacks || it.id !== 'datapack')).map((it) => (
          <button key={it.id} className={tab === it.id ? 'active' : ''} onClick={() => setTab(it.id)}>
            {t(it.label)}
            {it.id === 'installed' && installed.length > 0 && <span className="badge">{installed.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'installed' ? (
        <InstalledList profileId={profile.id} items={installed} datapacks={datapacks} onChanged={refreshInstalled} onError={onError} />
      ) : needsLoader ? (
        <div className="notice">
          <strong>{t(tab === 'shader' ? 'library.shadersNeedLoader' : 'library.modsNeedLoader')}</strong>
          <p>
            {t('library.vanillaProfile', { name: profile.name })} {t(tab === 'shader' ? 'library.shadersHow' : 'library.modsHow')}
          </p>
          <button className="primary" onClick={onOpenProfiles}>
            {t('library.manageProfiles')}
          </button>
        </div>
      ) : (
        <>
          {showOptiFine && (
            <div className="notice optifine">
              {optiFine ? (
                <>
                  <strong>{t('library.optifineInstalled')}</strong>
                  <p>
                    {optiFine.fileName}
                    {tab === 'shader' ? t('library.optifineShaders') : ''}
                  </p>
                  <button onClick={addOptiFine}>{t('library.changeVersion')}</button>
                </>
              ) : (
                <>
                  <strong>OptiFine{tab === 'shader' ? t('library.optifineForShaders') : ''}</strong>
                  <p>
                    {t('library.optifineWhy', { version: gameVersion || '…' })}{' '}
                    <a href="https://optifine.net/downloads" target="_blank" rel="noreferrer">
                      optifine.net
                    </a>{' '}
                    {t('library.optifineSteps')}
                  </p>
                  <button className="primary" onClick={addOptiFine}>
                    {t('library.addOptifine')}
                  </button>
                </>
              )}
            </div>
          )}
          <div className="search-bar">
            <input
              type="search"
              placeholder={t(SEARCH_PLACEHOLDERS[tab])}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s.id, label: t(s.label) }))} />
          </div>
          {gameVersion && (
            <small className="muted">
              {tab === 'modpack'
                ? t('library.resultsModpacks', { n: compactNumber(total) })
                : t('library.results', { n: compactNumber(total), version: gameVersion })}
              {tab === 'shader' && t('library.shadersAuto')}
              {tab === 'datapack' && t('library.datapacksWorlds')}
            </small>
          )}

          <div className="results">
            {hits.map((hit) => {
              const isInstalled = tab !== 'modpack' && installedIds.has(hit.projectId)
              const busy = installing.has(hit.projectId)
              return (
                <article key={hit.projectId} className="result">
                  {hit.iconUrl ? <img src={hit.iconUrl} alt="" /> : <div className="result__noicon">🐚</div>}
                  <div className="result__body">
                    <div className="result__title">
                      <a href={`https://modrinth.com/${tab}/${hit.slug}`} target="_blank" rel="noreferrer">
                        {hit.title}
                      </a>
                      <span className="muted">{t('library.by', { author: hit.author })}</span>
                    </div>
                    <p>{hit.description}</p>
                    <div className="result__meta">
                      <span>⬇ {compactNumber(hit.downloads)}</span>
                      {hit.categories.slice(0, 3).map((c) => (
                        <span key={c} className="chip">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className={isInstalled ? 'secondary installed' : 'primary'}
                    disabled={busy || isInstalled}
                    onClick={() => install(hit)}
                  >
                    {tab === 'modpack'
                      ? t('library.view')
                      : busy
                        ? t('library.installing')
                        : isInstalled
                          ? t('library.installed')
                          : t('library.install')}
                  </button>
                </article>
              )
            })}
          </div>

          {loading && <p className="muted center">{t('common.loading')}</p>}
          {!loading && hits.length === 0 && <p className="muted center">{t('library.noResults')}</p>}
          {!loading && hits.length < total && (
            <button className="secondary more" onClick={() => runSearch(hits.length)}>
              {t('library.more')}
            </button>
          )}
        </>
      )}
    </section>
  )
}
