import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAll } from '../game/download'
import { getProjects, listVersions } from '../modrinth/api'
import { getServer, serverDirOf } from './store'
import type { ServerContent, ServerContentDependency, ServerContentHit, ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Mods (Fabric, Forge, NeoForge) et plugins (Paper) d'un serveur, depuis Modrinth. La recherche ne garde que ce qui
 * marche sur un serveur (mods « côté serveur », plugins Paper/Spigot/Bukkit) pour cette version du jeu.
 */
const API = 'https://api.modrinth.com/v2'
const USER_AGENT = 'Alykell/Aloria (github.com/Alykell/Aloria)'
/** Nom, icône et projet de chaque fichier installé par Aloria (les autres, mis à la main, gardent leur nom de fichier) */
const INDEX = 'aloria-content.json'
/** Fichiers gérés par la page (e4mc et son correctif) : pas affichés dans la liste */
const MANAGED = /^aloria-e4mc-/

type Index = Record<string, { projectId: string; title: string; iconUrl: string | null }>

const folderOf = (server: ServerInfo) => (server.type === 'paper' ? 'plugins' : 'mods')

/** Chargeurs Modrinth acceptés : Paper fait tourner les plugins Spigot et Bukkit */
function loadersOf(server: ServerInfo): string[] {
  if (server.type === 'paper') return ['paper', 'spigot', 'bukkit']
  if (server.type === 'vanilla') throw new Error(tm('err.serverNoContent'))
  return [server.type]
}

async function readIndex(dir: string): Promise<Index> {
  try {
    return JSON.parse(await readFile(join(dir, INDEX), 'utf8')) as Index
  } catch {
    return {}
  }
}

export async function searchServerContent(id: string, query: string): Promise<ServerContentHit[]> {
  const server = getServer(id)
  const loaders = loadersOf(server)
  const facets = [
    [server.type === 'paper' ? 'project_type:plugin' : 'project_type:mod'],
    loaders.map((l) => `categories:${l}`),
    [`versions:${server.gameVersion}`],
    ...(server.type === 'paper' ? [] : [['server_side:required', 'server_side:optional']])
  ]
  const params = new URLSearchParams({ query, limit: '30', index: query ? 'relevance' : 'downloads', facets: JSON.stringify(facets) })
  const res = await fetch(`${API}/search?${params}`, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(tm('err.fetch', { url: 'api.modrinth.com', status: res.status }))
  const { hits } = (await res.json()) as {
    hits: { project_id: string; title: string; description: string; icon_url: string | null; downloads: number; client_side: string }[]
  }
  return hits.map((h) => ({
    projectId: h.project_id,
    title: h.title,
    description: h.description,
    iconUrl: h.icon_url,
    downloads: h.downloads,
    clientRequired: server.type !== 'paper' && h.client_side === 'required'
  }))
}

export async function listServerContent(id: string): Promise<ServerContent[]> {
  const server = getServer(id)
  const dir = join(serverDirOf(id), folderOf(server))
  if (!existsSync(dir)) return []
  const index = await readIndex(dir)
  return (await readdir(dir))
    .filter((f) => f.endsWith('.jar') && !MANAGED.test(f))
    .map((fileName) => ({
      fileName,
      projectId: index[fileName]?.projectId ?? null,
      title: index[fileName]?.title ?? fileName.replace(/\.jar$/, ''),
      iconUrl: index[fileName]?.iconUrl ?? null
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Version à installer pour ce serveur (la dernière stable compatible) */
async function pickVersion(server: ServerInfo, project: string) {
  const versions = await listVersions(project, loadersOf(server), [server.gameVersion])
  return versions.find((v) => v.version_type === 'release') ?? versions[0] ?? null
}

/**
 * Dépendances obligatoires pas encore installées (un niveau, assez pour les proposer au joueur avant l'installation)
 */
export async function missingDependencies(id: string, projectId: string): Promise<ServerContentDependency[]> {
  const server = getServer(id)
  const index = await readIndex(join(serverDirOf(id), folderOf(server)))
  const installed = new Set(Object.values(index).map((e) => e.projectId))
  const version = await pickVersion(server, projectId)
  if (!version) throw new Error(tm('err.serverContentMissing', { version: server.gameVersion }))
  const ids = [...new Set(version.dependencies.filter((d) => d.dependency_type === 'required' && d.project_id).map((d) => d.project_id!))]
  const missing = ids.filter((d) => !installed.has(d))
  if (missing.length === 0) return []
  const projects = await getProjects(missing)
  return projects.map((p) => ({ projectId: p.id, title: p.title, iconUrl: p.icon_url }))
}

/** Installe la dernière version compatible ; avec `withDeps`, aussi ses dépendances obligatoires */
export async function installServerContent(id: string, projectId: string, withDeps = true): Promise<void> {
  const server = getServer(id)
  const dir = join(serverDirOf(id), folderOf(server))
  await mkdir(dir, { recursive: true })
  const index = await readIndex(dir)
  const installed = new Set(Object.values(index).map((e) => e.projectId))

  const install = async (project: string, required: boolean): Promise<void> => {
    if (installed.has(project)) return
    installed.add(project)
    const version = await pickVersion(server, project)
    const file = version?.files.find((f) => f.primary) ?? version?.files[0]
    if (!version || !file) {
      if (required) throw new Error(tm('err.serverContentMissing', { version: server.gameVersion }))
      return
    }
    await downloadAll([{ url: file.url, path: join(dir, file.filename), sha1: file.hashes.sha1, size: file.size }], () => {})
    const meta = (await (await fetch(`${API}/project/${project}`, { headers: { 'User-Agent': USER_AGENT } })).json()) as {
      title: string
      icon_url: string | null
    }
    index[file.filename] = { projectId: project, title: meta.title, iconUrl: meta.icon_url }
    if (!withDeps) return
    for (const dep of version.dependencies) {
      if (dep.dependency_type === 'required' && dep.project_id) await install(dep.project_id, false)
    }
  }
  try {
    await install(projectId, true)
  } finally {
    await writeFile(join(dir, INDEX), JSON.stringify(index, null, 2))
  }
}

export async function removeServerContent(id: string, fileName: string): Promise<void> {
  const server = getServer(id)
  const dir = join(serverDirOf(id), folderOf(server))
  if (fileName.includes('/') || fileName.includes('\\')) return
  await rm(join(dir, fileName), { force: true })
  const index = await readIndex(dir)
  delete index[fileName]
  await writeFile(join(dir, INDEX), JSON.stringify(index, null, 2))
}
