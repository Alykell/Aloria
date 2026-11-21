import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { downloadAll } from '../game/download'
import { getProjects, listVersions, versionsByHash } from '../modrinth/api'
import { cfBestFile, cfFingerprint, cfMods, cfModsByFingerprint, cfSearch, cfSha1, isCurseforgeId, modIdOf } from '../curseforge'
import { prepareServerMods } from '../modrinth/modpack'
import { getServer, serverDirOf } from './store'
import type { Loader, ServerContent, ServerContentDependency, ServerContentHit, ServerContentUpdate, ServerInfo } from '../../shared/types'
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

// ---------------------------------------------------------------- mises à jour

/** Dossier où les anciennes versions remplacées sont gardées (pour revenir en arrière à la main, onglet Fichiers) */
export const OLD_DIR = 'aloria-old'

/** Chargeurs pour lesquels un jar est fait, d'après les fichiers qu'il contient */
function jarLoaders(data: Buffer): Set<string> {
  const kinds = new Set<string>()
  let names: string[]
  try {
    names = new AdmZip(data).getEntries().map((e) => e.entryName)
  } catch {
    return kinds
  }
  for (const n of names) {
    if (n === 'fabric.mod.json') kinds.add('Fabric')
    else if (n === 'quilt.mod.json') kinds.add('Quilt')
    else if (n === 'META-INF/neoforge.mods.toml') kinds.add('NeoForge')
    else if (n === 'META-INF/mods.toml' || n === 'mcmod.info') kinds.add('Forge')
    else if (n === 'plugin.yml' || n === 'paper-plugin.yml') kinds.add('Paper')
    else if (n === 'velocity-plugin.json') kinds.add('Velocity')
    else if (n === 'bungee.yml') kinds.add('BungeeCord')
  }
  return kinds
}

/** Chargeurs (au sens de jarLoaders) qu'accepte ce serveur ; NeoForge lit encore les mods.toml de Forge (1.20.1 à 1.20.4) */
const ACCEPTED: Record<string, string[]> = { paper: ['Paper'], fabric: ['Fabric'], forge: ['Forge'], neoforge: ['NeoForge', 'Forge'] }

/** Jars du dossier (activés ou non), hors fichiers gérés par Aloria */
async function jarsOf(dir: string): Promise<{ fileName: string; path: string }[]> {
  return (await readdir(dir))
    .filter((f) => (f.endsWith('.jar') || f.endsWith(`.jar${DISABLED}`)) && !MANAGED.test(f))
    .map((f) => ({ fileName: f.endsWith(DISABLED) ? f.slice(0, -DISABLED.length) : f, path: join(dir, f) }))
}

const sha1Of = (data: Buffer) => createHash('sha1').update(data).digest('hex')

/** Fichier à installer pour un projet Modrinth : la dernière version stable pour ce serveur (null : aucune) */
async function modrinthTarget(server: ServerInfo, project: string, currentSha1?: string) {
  const versions = await listVersions(project, loadersOf(server), [server.gameVersion])
  const best = versions.find((v) => v.version_type === 'release') ?? versions[0]
  const file = best?.files.find((f) => f.primary) ?? best?.files[0]
  if (!best || !file) return null
  // Version installée plus récente que la stable proposée (une bêta choisie exprès) : on ne redescend pas
  const current = currentSha1 ? versions.findIndex((v) => v.files.some((f) => f.hashes.sha1 === currentSha1)) : -1
  const upToDate = current !== -1 && current <= versions.indexOf(best)
  return { version: best, file, upToDate }
}

/**
 * Compare chaque mod ou plugin à ce qui existe pour la version du serveur. Les jars mis à la main sont reconnus à leur
 * empreinte (Modrinth, puis CurseForge pour les mods) et rangés dans l'index, avec leur nom et leur icône.
 */
export async function checkServerContentUpdates(id: string): Promise<ServerContentUpdate[]> {
  const server = getServer(id)
  loadersOf(server)
  const dir = join(serverDirOf(id), folderOf(server))
  if (!existsSync(dir)) return []
  const index = await readIndex(dir)
  const jars = await Promise.all(
    (await jarsOf(dir)).map(async (j) => {
      const data = await readFile(j.path)
      const fingerprint = !index[j.fileName] && server.type !== 'paper' ? cfFingerprint(data) : 0
      return { ...j, sha1: sha1Of(data), loaders: jarLoaders(data), fingerprint }
    })
  )

  // Jars inconnus de l'index : Modrinth d'abord, puis CurseForge
  let indexChanged = false
  const unknown = jars.filter((j) => !index[j.fileName])
  if (unknown.length > 0) {
    const byHash = await versionsByHash(unknown.map((j) => j.sha1)).catch(() => ({}) as Awaited<ReturnType<typeof versionsByHash>>)
    const found = unknown.filter((j) => byHash[j.sha1])
    const projects = found.length ? await getProjects([...new Set(found.map((j) => byHash[j.sha1].project_id))]).catch(() => []) : []
    for (const j of found) {
      const p = projects.find((x) => x.id === byHash[j.sha1].project_id)
      index[j.fileName] = { projectId: byHash[j.sha1].project_id, title: p?.title ?? j.fileName.replace(/\.jar$/, ''), iconUrl: p?.icon_url ?? null }
      indexChanged = true
    }
    const rest = unknown.filter((j) => !index[j.fileName] && j.fingerprint)
    if (rest.length > 0) {
      const byPrint = await cfModsByFingerprint(rest.map((j) => j.fingerprint)).catch(() => new Map<number, number>())
      const mods = byPrint.size ? await cfMods([...new Set(byPrint.values())]).catch(() => []) : []
      for (const j of rest) {
        const mod = mods.find((m) => m.id === byPrint.get(j.fingerprint))
        if (!mod) continue
        index[j.fileName] = { projectId: `cf:${mod.id}`, title: mod.name, iconUrl: mod.logo?.thumbnailUrl ?? null }
        indexChanged = true
      }
    }
  }
  if (indexChanged) await writeFile(join(dir, INDEX), JSON.stringify(index, null, 2))

  const accepted = ACCEPTED[server.type] ?? []
  return Promise.all(
    jars.map(async (j): Promise<ServerContentUpdate> => {
      const wrong = j.loaders.size > 0 && ![...j.loaders].some((l) => accepted.includes(l))
      const base: ServerContentUpdate = { fileName: j.fileName, status: 'unknown', ...(wrong ? { wrongLoader: [...j.loaders][0] } : {}) }
      const entry = index[j.fileName]
      if (!entry) return base
      try {
        if (isCurseforgeId(entry.projectId)) {
          const best = await cfBestFile(modIdOf(entry.projectId), 'mod', server.gameVersion, server.type as Loader)
          if (!best) return { ...base, status: 'missing' }
          const same = cfSha1(best) === j.sha1 || best.fileName === j.fileName
          return same && !wrong ? { ...base, status: 'upToDate' } : { ...base, status: 'update', newVersion: best.displayName }
        }
        const target = await modrinthTarget(server, entry.projectId, j.sha1)
        if (!target) return { ...base, status: 'missing' }
        return target.upToDate && !wrong ? { ...base, status: 'upToDate' } : { ...base, status: 'update', newVersion: target.version.version_number }
      } catch {
        return base
      }
    })
  )
}

/**
 * Remplace des mods ou plugins par leur version pour le serveur. L'ancien jar part dans aloria-old/<dossier>, le nouveau
 * garde l'état activé ou non ; les nouvelles dépendances obligatoires sont installées ensuite.
 */
export async function updateServerContent(id: string, fileNames: string[]): Promise<void> {
  const server = getServer(id)
  const folder = folderOf(server)
  const dir = join(serverDirOf(id), folder)
  const oldDir = join(serverDirOf(id), OLD_DIR, folder)
  const tmpDir = join(serverDirOf(id), OLD_DIR, '.download')
  const index = await readIndex(dir)
  const deps = new Set<string>()
  const failed: string[] = []
  await mkdir(oldDir, { recursive: true })
  for (const name of fileNames) {
    const entry = index[name]
    if (!entry || name.includes('/') || name.includes('\\')) continue
    const disabled = !existsSync(join(dir, name)) && existsSync(join(dir, name + DISABLED))
    const current = join(dir, disabled ? name + DISABLED : name)
    try {
      let target: { url: string; fileName: string; sha1?: string; size?: number } | null = null
      if (isCurseforgeId(entry.projectId)) {
        const best = await cfBestFile(modIdOf(entry.projectId), 'mod', server.gameVersion, server.type as Loader)
        const sha1 = best ? cfSha1(best) : ''
        const url =
          best?.downloadUrl ??
          (sha1
            ? (await versionsByHash([sha1]).catch(() => ({}) as Awaited<ReturnType<typeof versionsByHash>>))[sha1]?.files.find((f) => f.hashes.sha1 === sha1)?.url
            : undefined)
        if (best && url) {
          target = { url, fileName: best.fileName, sha1: sha1 || undefined, size: best.fileLength }
          for (const d of best.dependencies ?? []) if (d.relationType === 3) deps.add(`cf:${d.modId}`)
        }
      } else {
        const t = await modrinthTarget(server, entry.projectId)
        if (t) {
          target = { url: t.file.url, fileName: t.file.filename, sha1: t.file.hashes.sha1, size: t.file.size }
          for (const d of t.version.dependencies) if (d.dependency_type === 'required' && d.project_id) deps.add(d.project_id)
        }
      }
      if (!target || target.fileName.includes('/') || target.fileName.includes('\\')) {
        failed.push(entry.title)
        continue
      }
      // Téléchargé à part d'abord : rien n'est touché si ça échoue (et le nom peut être le même que l'ancien)
      const tmp = join(tmpDir, target.fileName)
      await downloadAll([{ url: target.url, path: tmp, sha1: target.sha1, size: target.size }], () => {})
      await rm(join(oldDir, name), { force: true })
      await rename(current, join(oldDir, name))
      await rename(tmp, join(dir, disabled ? target.fileName + DISABLED : target.fileName))
      delete index[name]
      index[target.fileName] = entry
    } catch (e) {
      console.log('[server-content] mise à jour', name, e)
      failed.push(entry.title)
    }
  }
  await writeFile(join(dir, INDEX), JSON.stringify(index, null, 2))
  await rm(tmpDir, { recursive: true, force: true })
  const installed = new Set(Object.values(index).map((e) => e.projectId))
  for (const dep of deps) if (!installed.has(dep)) await installServerContent(id, dep, true).catch(() => {})
  if (failed.length > 0) throw new Error(tm('err.serverContentUpdate', { names: failed.join(', ') }))
}
