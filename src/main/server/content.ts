import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAll } from '../game/download'
import { getProjects, listVersions, versionsByHash } from '../modrinth/api'
import { cfBestFile, cfFiles, cfMods, cfSearch, cfSha1, isCurseforgeId, modIdOf } from '../curseforge'
import { prepareServerMods } from '../modrinth/modpack'
import { getServer, serverDirOf } from './store'
import type { Loader, ServerContent, ServerContentDependency, ServerContentHit, ServerInfo } from '../../shared/types'
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

const DISABLED = '.disabled'
const looseTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Recherche de mods (Modrinth, CurseForge ou les deux, alternés et sans doublon) ou de plugins Paper (Modrinth seulement).
 * CurseForge ne dit pas quels mods marchent sur un serveur : un mod Fabric « client » est refusé à l'installation.
 */
export async function searchServerContent(id: string, query: string, source: 'all' | 'modrinth' | 'curseforge' = 'all'): Promise<ServerContentHit[]> {
  const server = getServer(id)
  if (server.type === 'paper' || source === 'modrinth') return searchModrinth(server, query)
  const fromCf = async (): Promise<ServerContentHit[]> => {
    const q = { profileId: '', type: 'mod' as const, query, sort: query ? ('relevance' as const) : ('downloads' as const), offset: 0 }
    const { hits } = await cfSearch(q, server.gameVersion, server.type as Loader, source === 'all' ? 15 : 30)
    return hits.map((h) => ({ projectId: h.projectId, title: h.title, description: h.description, iconUrl: h.iconUrl, downloads: h.downloads, clientRequired: false }))
  }
  if (source === 'curseforge') return fromCf()
  const [mr, cf] = await Promise.allSettled([searchModrinth(server, query, 15), fromCf()])
  if (mr.status === 'rejected' && cf.status === 'rejected') throw mr.reason
  const a = mr.status === 'fulfilled' ? mr.value : []
  const b = cf.status === 'fulfilled' ? cf.value : []
  const seen = new Set<string>()
  const out: ServerContentHit[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const h of [a[i], b[i]]) {
      if (!h || seen.has(looseTitle(h.title))) continue
      seen.add(looseTitle(h.title))
      out.push(h)
    }
  }
  if (!query) out.sort((x, y) => y.downloads - x.downloads)
  return out
}

async function searchModrinth(server: ServerInfo, query: string, limit = 30): Promise<ServerContentHit[]> {
  const loaders = loadersOf(server)
  const facets = [
    [server.type === 'paper' ? 'project_type:plugin' : 'project_type:mod'],
    loaders.map((l) => `categories:${l}`),
    [`versions:${server.gameVersion}`],
    ...(server.type === 'paper' ? [] : [['server_side:required', 'server_side:optional']])
  ]
  const params = new URLSearchParams({ query, limit: String(limit), index: query ? 'relevance' : 'downloads', facets: JSON.stringify(facets) })
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
    .filter((f) => (f.endsWith('.jar') || f.endsWith(`.jar${DISABLED}`)) && !MANAGED.test(f))
    .map((f) => {
      const fileName = f.endsWith(DISABLED) ? f.slice(0, -DISABLED.length) : f
      return {
        fileName,
        enabled: fileName === f,
        projectId: index[fileName]?.projectId ?? null,
        title: index[fileName]?.title ?? fileName.replace(/\.jar$/, ''),
        iconUrl: index[fileName]?.iconUrl ?? null
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Active ou désactive un mod (ou plugin) : « .disabled » au bout du nom, le serveur ne le charge plus */
export async function setServerContentEnabled(id: string, fileName: string, enabled: boolean): Promise<void> {
  const server = getServer(id)
  if (fileName.includes('/') || fileName.includes('\\')) return
  const base = join(serverDirOf(id), folderOf(server), fileName)
  const [from, to] = enabled ? [base + DISABLED, base] : [base, base + DISABLED]
  if (existsSync(from)) await rename(from, to)
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
  if (isCurseforgeId(projectId)) {
    const file = await cfBestFile(modIdOf(projectId), 'mod', server.gameVersion, server.type as Loader)
    if (!file) throw new Error(tm('err.serverContentMissing', { version: server.gameVersion }))
    const ids = [...new Set((file.dependencies ?? []).filter((d) => d.relationType === 3).map((d) => d.modId))].filter((m) => !installed.has(`cf:${m}`))
    if (ids.length === 0) return []
    return (await cfMods(ids)).map((m) => ({ projectId: `cf:${m.id}`, title: m.name, iconUrl: m.logo?.thumbnailUrl ?? null }))
  }
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
    if (isCurseforgeId(project)) return installCurseforge(project, required)
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
  // Mod CurseForge : fichier du chargeur et de la version du serveur ; s'il ne marche que côté joueur (Fabric), il est refusé
  const installCurseforge = async (project: string, required: boolean): Promise<void> => {
    const [mod] = await cfMods([modIdOf(project)])
    const file = mod ? await cfBestFile(mod.id, 'mod', server.gameVersion, server.type as Loader) : null
    if (!mod || !file) {
      if (required) throw new Error(tm('err.serverContentMissing', { version: server.gameVersion }))
      return
    }
    const sha1 = cfSha1(file)
    const url =
      file.downloadUrl ??
      (sha1 ? (await versionsByHash([sha1]).catch(() => ({}) as Awaited<ReturnType<typeof versionsByHash>>))[sha1]?.files.find((f) => f.hashes.sha1 === sha1)?.url : undefined)
    if (!url) {
      if (required) throw new Error(tm('err.curseforgeBlocked', { title: mod.name }))
      return
    }
    await downloadAll([{ url, path: join(dir, file.fileName), sha1: sha1 || undefined, size: file.fileLength }], () => {})
    if ((await prepareServerMods(dir, [file.fileName])).length > 0) {
      if (required) throw new Error(tm('err.serverClientOnly', { title: mod.name }))
      return
    }
    index[file.fileName] = { projectId: project, title: mod.name, iconUrl: mod.logo?.thumbnailUrl ?? null }
    if (!withDeps) return
    for (const dep of file.dependencies ?? []) if (dep.relationType === 3) await install(`cf:${dep.modId}`, false)
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
  await rm(join(dir, fileName + DISABLED), { force: true })
  const index = await readIndex(dir)
  delete index[fileName]
  await writeFile(join(dir, INDEX), JSON.stringify(index, null, 2))
}
