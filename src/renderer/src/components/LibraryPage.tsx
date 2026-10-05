import { useCallback, useEffect, useRef, useState } from 'react'
import InstalledList from './InstalledList'
import { describeProfile } from '../hooks/useVersions'
import type { ProfilesState } from '../hooks/useProfiles'
import type { ContentType, InstalledContent, SearchHit, SearchSort } from '../../../shared/types'

type Tab = ContentType | 'installed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Resource packs' },
  { id: 'shader', label: 'Shaders' },
  { id: 'installed', label: 'Installés' }
]

const SORTS: { id: SearchSort; label: string }[] = [
  { id: 'relevance', label: 'Pertinence' },
  { id: 'downloads', label: 'Téléchargements' },
  { id: 'updated', label: 'Mis à jour récemment' },
  { id: 'newest', label: 'Nouveautés' }
]

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

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
  const needsFabric = (tab === 'mod' || tab === 'shader') && profile?.loader !== 'fabric'

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
        <h2>Bibliothèque</h2>
        <label className="library__profile">
          <span>Profil</span>
          <select value={profile.id} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name} · {describeProfile(p)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'installed' && installed.length > 0 && <span className="badge">{installed.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'installed' ? (
        <InstalledList profileId={profile.id} items={installed} onChanged={refreshInstalled} onError={onError} />
      ) : needsFabric ? (
        <div className="notice">
          <strong>{tab === 'shader' ? 'Les shaders ont besoin de Fabric' : 'Les mods ont besoin de Fabric'}</strong>
          <p>
            Le profil « {profile.name} » est en vanilla.{' '}
            {tab === 'shader'
              ? 'Pour les shaders, Aloria installe le mod Iris, qui fonctionne avec Fabric.'
              : 'Choisis un profil Fabric en haut, ou crées-en un.'}
          </p>
          <button className="primary" onClick={onOpenProfiles}>
            Gérer les profils
          </button>
        </div>
      ) : (
        <>
          <div className="search-bar">
            <input
              type="search"
              placeholder={`Rechercher des ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as SearchSort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {gameVersion && (
            <small className="muted">
              {compact.format(total)} résultats compatibles avec Minecraft {gameVersion}
              {tab === 'shader' && ' · Iris et Sodium seront installés automatiquement'}
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
                      <span className="muted"> par {hit.author}</span>
                    </div>
                    <p>{hit.description}</p>
                    <div className="result__meta">
                      <span>⬇ {compact.format(hit.downloads)}</span>
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
                    {busy ? 'Installation…' : isInstalled ? 'Installé ✓' : 'Installer'}
                  </button>
                </article>
              )
            })}
          </div>

          {loading && <p className="muted center">Chargement…</p>}
          {!loading && hits.length === 0 && <p className="muted center">Aucun résultat.</p>}
          {!loading && hits.length < total && (
            <button className="secondary more" onClick={() => runSearch(hits.length)}>
              Voir plus
            </button>
          )}
        </>
      )}
    </section>
  )
}
