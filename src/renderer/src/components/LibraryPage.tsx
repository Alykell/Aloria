import { useCallback, useEffect, useRef, useState } from 'react'
import InstalledList from './InstalledList'
import { describeProfile } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { ContentType, InstalledContent, SearchHit, SearchSort } from '../../../shared/types'
import Select from './Select'
import { compactNumber, t } from '../i18n'
import type { MessageKey } from '../../../shared/i18n'

type Tab = ContentType | 'installed'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'mod', label: 'library.tabMods' },
  { id: 'resourcepack', label: 'library.tabResourcepacks' },
  { id: 'shader', label: 'library.tabShaders' },
  { id: 'installed', label: 'library.tabInstalled' }
]

const SEARCH_PLACEHOLDERS: Record<ContentType, MessageKey> = {
  mod: 'library.searchMods',
  resourcepack: 'library.searchResourcepacks',
  shader: 'library.searchShaders'
}

const SORTS: { id: SearchSort; label: MessageKey }[] = [
  { id: 'relevance', label: 'library.sortRelevance' },
  { id: 'downloads', label: 'library.sortDownloads' },
  { id: 'updated', label: 'library.sortUpdated' },
  { id: 'newest', label: 'library.sortNewest' }
]

interface Props {
  profiles: ProfilesState
  onError: (message: string) => void
  onOpenProfiles: () => void
}

export default function LibraryPage({ profiles, onError, onOpenProfiles }: Props) {
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
  const requestId = useRef(0)

  const profile = profiles.profiles.find((p) => p.id === profileId) ?? profiles.selected
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

  const install = async (hit: SearchHit) => {
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

  const installedIds = new Set(installed.map((i) => i.projectId).filter(Boolean))

  if (!profile) return null

  return (
    <section className="page wide library">
      <div className="library__header">
        <h2>{t('library.title')}</h2>
        <div className="library__profile">
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
        {TABS.map((it) => (
          <button key={it.id} className={tab === it.id ? 'active' : ''} onClick={() => setTab(it.id)}>
            {t(it.label)}
            {it.id === 'installed' && installed.length > 0 && <span className="badge">{installed.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'installed' ? (
        <InstalledList profileId={profile.id} items={installed} onChanged={refreshInstalled} onError={onError} />
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
              {t('library.results', { n: compactNumber(total), version: gameVersion })}
              {tab === 'shader' && t('library.shadersAuto')}
            </small>
          )}

          <div className="results">
            {hits.map((hit) => {
              const isInstalled = installedIds.has(hit.projectId)
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
                    {busy ? t('library.installing') : isInstalled ? t('library.installed') : t('library.install')}
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
