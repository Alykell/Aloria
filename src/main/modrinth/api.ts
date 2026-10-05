import { app } from 'electron'
import type { ContentType, SearchHit, SearchQuery } from '../../shared/types'

const API = 'https://api.modrinth.com/v2'

export interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  loaders: string[]
  game_versions: string[]
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha1: string } }[]
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }[]
}

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  project_type: ContentType
  icon_url: string | null
}

// Modrinth demande un User-Agent qui identifie l'application
async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value))
  }
  const res = await fetch(`${API}${path}${query.size ? `?${query}` : ''}`, {
    headers: { 'User-Agent': `Alykell/Aloria/${app.getVersion()} (github.com/Alykell/Aloria)` }
  })
  if (res.status === 429) throw new Error('Trop de requêtes vers Modrinth, réessaie dans une minute.')
  if (!res.ok) throw new Error(`Erreur Modrinth (HTTP ${res.status}).`)
  return (await res.json()) as T
}

export async function search(q: SearchQuery, gameVersion: string): Promise<{ hits: SearchHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${q.type}`], [`versions:${gameVersion}`]]
  if (q.type === 'mod') facets.push(['categories:fabric'])
  if (q.type === 'shader') facets.push(['categories:iris'])

  const res = await get<{
    total_hits: number
    hits: {
      project_id: string
      slug: string
      title: string
      author: string
      description: string
      downloads: number
      icon_url: string | null
      display_categories: string[]
    }[]
  }>('/search', { query: q.query || undefined, facets, index: q.sort, limit: 20, offset: q.offset })

  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      author: h.author,
      description: h.description,
      downloads: h.downloads,
      iconUrl: h.icon_url,
      categories: h.display_categories.filter((c) => !['fabric', 'forge', 'neoforge', 'quilt', 'iris', 'optifine', 'minecraft'].includes(c))
    }))
  }
}

export const getProject = (idOrSlug: string) => get<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`)

export const getVersion = (id: string) => get<ModrinthVersion>(`/version/${encodeURIComponent(id)}`)

export const listVersions = (projectId: string, loaders: string[] | undefined, gameVersions: string[] | undefined) =>
  get<ModrinthVersion[]>(`/project/${encodeURIComponent(projectId)}/version`, { loaders, game_versions: gameVersions })
