import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { inflateRawSync } from 'node:zlib'
import { downloadAll } from '../game/download'
import { forgeLoaders } from '../game/forge'
import { createProfile, deleteProfile, gameDirOf } from '../profiles'
import { forgeSupported, neoforgeSupported } from '../../shared/loaders'
import { getProject, getProjects, getVersion, listVersions, versionsByHash } from './api'
import type { ContentType, ModpackEntry, ModpackPreview, ModpackProgress, ModpackSource, ModpackVersion, Profile } from '../../shared/types'
import { tm } from '../i18n'

/** Format .mrpack de Modrinth : un zip avec modrinth.index.json et les dossiers overrides/ et client-overrides/ */
interface MrpackIndex {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: {
    path: string
    hashes: { sha1: string; sha512?: string }
    env?: { client?: 'required' | 'optional' | 'unsupported'; server?: string }
    downloads: string[]
    fileSize: number
  }[]
  dependencies: Record<string, string>
}

// Hébergeurs autorisés par le format .mrpack : un modpack ne peut pas faire télécharger n'importe quoi
const ALLOWED_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']
const OVERRIDES = ['overrides/', 'client-overrides/']
const FOLDER_TYPES: Record<string, ContentType> = { mods: 'mod', resourcepacks: 'resourcepack', shaderpacks: 'shader' }

const typeOf = (path: string): ContentType | 'other' => FOLDER_TYPES[path.split('/')[0]] ?? 'other'
const fileName = (path: string) => path.split('/').pop() ?? path

/** Chemin d'un fichier du modpack dans le dossier du profil, refusé s'il en sortirait (« ../ », chemin absolu) */
export function safeJoin(gameDir: string, path: string): string {
  const dest = resolve(gameDir, path)
  const rel = relative(gameDir, dest)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(tm('err.modpackPath', { path }))
  return dest
}

/** Versions d'un modpack Modrinth, les plus récentes d'abord */
export async function modpackVersions(projectId: string): Promise<ModpackVersion[]> {
  const versions = await listVersions(projectId, undefined, undefined)
  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.version_number,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    stable: v.version_type === 'release',
    supported:
      v.loaders.includes('fabric') ||
      (v.loaders.includes('forge') && v.game_versions.some(forgeSupported)) ||
      (v.loaders.includes('neoforge') && v.game_versions.some(neoforgeSupported))
  }))
}

// Fichiers .mrpack téléchargés pour un aperçu, réutilisés à l'installation
const cacheDir = () => join(app.getPath('temp'), 'aloria-modpacks')

/** Fichier .mrpack d'une version Modrinth (adresse, taille, SHA-1) */
async function packFile(versionId: string) {
  const version = await getVersion(versionId)
  const file = version.files.find((f) => f.filename.endsWith('.mrpack')) ?? version.files.find((f) => f.primary)
  if (!file) throw new Error(tm('err.modpackNoFile'))
  return file
}

async function openPack(source: ModpackSource, onDownload?: (bytes: number) => void): Promise<{ zip: AdmZip; index: MrpackIndex }> {
  let path: string
  if (source.kind === 'file') path = source.path
  else {
    path = join(cacheDir(), `${source.versionId}.mrpack`)
    if (!existsSync(path)) {
      const file = await packFile(source.versionId)
      onDownload?.(file.size)
      await downloadAll([{ url: file.url, path, sha1: file.hashes.sha1, size: file.size }], () => {})
    }
  }
  try {
    const zip = new AdmZip(path)
    const raw = zip.getEntry('modrinth.index.json')?.getData().toString('utf8')
    if (!raw) throw new Error()
    return { zip, index: JSON.parse(raw) as MrpackIndex }
  } catch {
    throw new Error(tm('err.modpackRead'))
  }
}

/** Morceau d'un fichier distant (null si le serveur ne sait pas envoyer seulement une partie) */
async function fetchRange(url: string, start: number, end: number): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  if (res.status !== 206) return null
  return Buffer.from(await res.arrayBuffer())
}

/** Ce que l'aperçu lit d'un .mrpack : index, nombre de fichiers fournis, mods à télécharger à la main (null : aucun) */
interface PackSummary {
  index: MrpackIndex
  overrides: number
  manualMods: number | null
}

/**
 * Modpacks qui comptent sur des mods CurseForge que Modrinth n'a pas le droit d'héberger : le mod « Missing Mods Checker »
 * et sa liste (config/missing_mods_checker.json) font télécharger ces mods à la main, un par un, au premier lancement.
 */
const isCheckerList = (name: string) => /(^|\/)missing_mods_checker\.json$/i.test(name)
const isCheckerJar = (name: string) => /(^|\/)mods\/missingmodschecker[^/]*\.jar$/i.test(name)

/** Nombre de mods de la liste du vérificateur (0 si elle est illisible : on sait seulement qu'il en manque) */
function countManual(raw: Buffer | undefined): number {
  try {
    const list = JSON.parse(raw?.toString('utf8') ?? '') as unknown
    return Array.isArray(list) ? list.length : 0
  } catch {
    return 0
  }
}

/**
 * Index et nombre de fichiers fournis d'un .mrpack distant, sans le télécharger en entier : on lit la fin du zip
 * (son sommaire), puis seulement modrinth.index.json (et la liste des mods à télécharger à la main, s'il y en a une).
 * Certains modpacks pèsent plus de 100 Mo pour quelques Ko d'index.
 * null si ce n'est pas possible (serveur, zip64…) : l'appelant télécharge alors le fichier complet.
 */
async function remoteSummary(url: string, size: number): Promise<PackSummary | null> {
  // Fin du sommaire (22 octets, plus un commentaire de 64 Ko au plus)
  const tailStart = Math.max(0, size - 65_557)
  const tail = await fetchRange(url, tailStart, size - 1)
  if (!tail) return null
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) return null
  const cdSize = tail.readUInt32LE(eocd + 12)
  const cdOffset = tail.readUInt32LE(eocd + 16)
  if (cdOffset === 0xffffffff) return null
  const cd = cdOffset >= tailStart ? tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize) : await fetchRange(url, cdOffset, cdOffset + cdSize - 1)
  if (!cd) return null

  type Entry = { method: number; compressedSize: number; offset: number }
  let overrides = 0
  let indexEntry: Entry | null = null
  let checkerList: Entry | null = null
  let checkerJar = false
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nameLen = cd.readUInt16LE(p + 28)
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
    const entry = { method: cd.readUInt16LE(p + 10), compressedSize: cd.readUInt32LE(p + 20), offset: cd.readUInt32LE(p + 42) }
    if (name === 'modrinth.index.json') indexEntry = entry
    else if (!name.endsWith('/') && OVERRIDES.some((o) => name.startsWith(o))) {
      overrides++
      if (isCheckerList(name)) checkerList = entry
      if (isCheckerJar(name)) checkerJar = true
    }
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32)
  }
  if (!indexEntry) return null

  // En-tête local (30 octets + nom + extra) puis les données compressées
  const read = async (entry: Entry): Promise<Buffer | null> => {
    const head = await fetchRange(url, entry.offset, entry.offset + 29)
    if (!head || head.readUInt32LE(0) !== 0x04034b50) return null
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
    const data = entry.compressedSize ? await fetchRange(url, start, start + entry.compressedSize - 1) : Buffer.alloc(0)
    if (!data) return null
    return entry.method === 8 ? inflateRawSync(data) : data
  }
  const raw = await read(indexEntry)
  if (!raw) return null
  const index = JSON.parse(raw.toString('utf8')) as MrpackIndex
  const listed = index.files.some((f) => isCheckerJar(f.path))
  const manualMods = checkerList ? countManual((await read(checkerList)) ?? undefined) : checkerJar || listed ? 0 : null
  return { index, overrides, manualMods }
}

/** Mods à télécharger à la main d'un .mrpack déjà sur le disque (null : aucun) */
function localManual(zip: AdmZip, index: MrpackIndex): number | null {
  const entries = zip.getEntries().filter((e) => OVERRIDES.some((o) => e.entryName.startsWith(o)))
  const list = entries.find((e) => isCheckerList(e.entryName))
  if (list) return countManual(list.getData())
  return entries.some((e) => isCheckerJar(e.entryName)) || index.files.some((f) => isCheckerJar(f.path)) ? 0 : null
}

/** Explication montrée à la place du bouton d'installation */
const manualMessage = (n: number) => (n > 0 ? tm('err.modpackManual', { n }) : tm('err.modpackManualSome'))

/** Index et nombre de fichiers fournis, pour l'aperçu : lecture partielle quand c'est possible */
async function packSummary(source: ModpackSource): Promise<PackSummary> {
  if (source.kind === 'modrinth' && !existsSync(join(cacheDir(), `${source.versionId}.mrpack`))) {
    const file = await packFile(source.versionId)
    const summary = await remoteSummary(file.url, file.size).catch(() => null)
    if (summary) return summary
  }
  const { zip, index } = await openPack(source)
  const overrides = zip.getEntries().filter((e) => !e.isDirectory && OVERRIDES.some((o) => e.entryName.startsWith(o))).length
  return { index, overrides, manualMods: localManual(zip, index) }
}

/** Chargeur du modpack et raison de le refuser (Quilt, NeoForge, Forge moderne : Aloria ne sait pas les lancer) */
function loaderOf(index: MrpackIndex): { loader: string; loaderVersion: string | null; unsupported: string | null } {
  const deps = index.dependencies
  const gameVersion = deps.minecraft
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'], unsupported: null }
  if (deps.forge) {
    return {
      loader: 'forge',
      loaderVersion: deps.forge,
      unsupported: forgeSupported(gameVersion) ? null : tm('err.modpackForge', { version: gameVersion })
    }
  }
  if (deps.neoforge) {
    return {
      loader: 'neoforge',
      loaderVersion: deps.neoforge,
      unsupported: neoforgeSupported(gameVersion) ? null : tm('err.modpackLoader', { loader: 'NeoForge' })
    }
  }
  const other = deps['quilt-loader'] ? 'Quilt' : null
  if (other) return { loader: other.toLowerCase(), loaderVersion: null, unsupported: tm('err.modpackLoader', { loader: other }) }
  return { loader: 'vanilla', loaderVersion: null, unsupported: null }
}

/** Nom, icône et projet Modrinth des fichiers du modpack (retrouvés par leur SHA-1 ; tant pis si Modrinth ne répond pas) */
async function lookup(index: MrpackIndex): Promise<Map<string, { title: string; iconUrl: string | null; projectId: string; versionId: string; versionNumber: string }>> {
  const out = new Map<string, { title: string; iconUrl: string | null; projectId: string; versionId: string; versionNumber: string }>()
  try {
    const versions = await versionsByHash(index.files.map((f) => f.hashes.sha1))
    const ids = [...new Set(Object.values(versions).map((v) => v.project_id))]
    const projects = new Map<string, { title: string; icon_url: string | null }>()
    // Par paquets : l'adresse de la requête a une longueur limitée
    for (let i = 0; i < ids.length; i += 100) {
      for (const p of await getProjects(ids.slice(i, i + 100))) projects.set(p.id, p)
    }
    for (const [sha1, v] of Object.entries(versions)) {
      const project = projects.get(v.project_id)
      if (project) out.set(sha1, { title: project.title, iconUrl: project.icon_url, projectId: v.project_id, versionId: v.id, versionNumber: v.version_number })
    }
  } catch {
    // Les noms de fichiers suffiront
  }
  return out
}

const clientFiles = (index: MrpackIndex) => index.files.filter((f) => f.env?.client !== 'unsupported')

export async function previewModpack(source: ModpackSource): Promise<ModpackPreview> {
  const { index, overrides, manualMods } = await packSummary(source)
  const known = await lookup(index)
  const { loader, loaderVersion, unsupported: loaderProblem } = loaderOf(index)
  // Mods à télécharger à la main : le jeu ne se lancerait pas sans eux (ou il faudrait en désactiver d'autres en cascade)
  const unsupported = loaderProblem ?? (manualMods !== null ? manualMessage(manualMods) : null)
  const files: ModpackEntry[] = clientFiles(index).map((f) => {
    const info = known.get(f.hashes.sha1)
    return {
      path: f.path,
      type: typeOf(f.path),
      title: info?.title ?? fileName(f.path),
      iconUrl: info?.iconUrl ?? null,
      optional: f.env?.client === 'optional',
      size: f.fileSize
    }
  })
  files.sort((a, b) => a.title.localeCompare(b.title))
  let summary = index.summary ?? ''
  if (!summary && source.kind === 'modrinth') summary = (await getProject(source.projectId).catch(() => null))?.description ?? ''
  return {
    name: index.name,
    summary,
    versionNumber: index.versionId,
    gameVersion: index.dependencies.minecraft,
    loader,
    loaderVersion,
    unsupported,
    files,
    overrides
  }
}

/** Version de Forge du modpack (« 14.23.5.2859 ») au format du launcher (« 1.12.2-14.23.5.2859 ») */
export async function forgeVersion(gameVersion: string, forge: string): Promise<string> {
  const all = await forgeLoaders(gameVersion)
  const found = all.find((v) => v.version === `${gameVersion}-${forge}` || v.version.startsWith(`${gameVersion}-${forge}-`) || v.label === forge)
  if (!found) throw new Error(tm('err.modpackForgeVersion', { version: forge }))
  return found.version
}

/**
 * Installe un modpack dans un nouveau profil : chargeur et version du jeu du modpack, fichiers téléchargés (SHA-1 vérifié),
 * puis overrides copiés par-dessus. En cas d'échec, le profil à moitié installé est supprimé.
 */
export async function installModpack(source: ModpackSource, onProgress: (p: ModpackProgress) => void): Promise<Profile> {
  const { zip, index } = await openPack(source, (bytes) => onProgress({ doneFiles: 0, totalFiles: 0, packBytes: bytes }))
  const { loader, loaderVersion, unsupported } = loaderOf(index)
  if (unsupported) throw new Error(unsupported)
  const manual = localManual(zip, index)
  if (manual !== null) throw new Error(manualMessage(manual))
  const gameVersion = index.dependencies.minecraft

  const files = clientFiles(index)
  for (const f of files) {
    const url = f.downloads.find((d) => {
      try {
        return ALLOWED_HOSTS.includes(new URL(d).hostname)
      } catch {
        return false
      }
    })
    if (!url) throw new Error(tm('err.modpackHost', { file: fileName(f.path) }))
  }

  const profile = createProfile({
    name: index.name,
    icon: '📦',
    versionId: gameVersion,
    loader: loader as Profile['loader'],
    loaderVersion: loader === 'forge' && loaderVersion ? await forgeVersion(gameVersion, loaderVersion) : loaderVersion,
    ramMb: null,
    modpack: {
      name: index.name,
      versionNumber: index.versionId,
      ...(source.kind === 'modrinth' ? { projectId: source.projectId, versionId: source.versionId } : {})
    }
  })
  const gameDir = gameDirOf(profile.id)

  try {
    const tasks = files.map((f) => ({
      url: f.downloads.find((d) => ALLOWED_HOSTS.includes(new URL(d).hostname))!,
      path: safeJoin(gameDir, f.path),
      sha1: f.hashes.sha1,
      size: f.fileSize
    }))
    await downloadAll(tasks, (p) => onProgress({ doneFiles: p.doneFiles, totalFiles: p.totalFiles }))

    // Configs, réglages, packs fournis tels quels ; client-overrides passe après (spécifique au jeu, pas au serveur)
    for (const prefix of OVERRIDES) {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue
        const dest = safeJoin(gameDir, entry.entryName.slice(prefix.length))
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, entry.getData())
      }
    }

    // Bibliothèque : les fichiers du modpack apparaissent avec leur nom et leur icône dans « Installés »
    const known = await lookup(index)
    const contentIndex: Record<string, object> = {}
    for (const f of files) {
      const type = typeOf(f.path)
      const info = known.get(f.hashes.sha1)
      if (type === 'other' || !info || f.path.split('/').length !== 2) continue
      contentIndex[fileName(f.path)] = { type, ...info }
    }
    await writeFile(join(gameDir, 'aloria-content.json'), JSON.stringify(contentIndex, null, 2))
  } catch (err) {
    await deleteProfile(profile.id, true).catch(() => {})
    throw err
  }
  return profile
}
