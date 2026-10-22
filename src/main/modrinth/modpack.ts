import { app } from 'electron'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { inflateRawSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { downloadAll, fetchBytes } from '../game/download'
import { forgeLoaders } from '../game/forge'
import { createProfile, deleteProfile, gameDirOf, getProfile, updateProfile } from '../profiles'
import { forgeSupported, neoforgeSupported } from '../../shared/loaders'
import { getProject, getProjects, getVersion, listVersions, versionsByHash } from './api'
import type { ContentType, ModpackEntry, ModpackPreview, ModpackProgress, ModpackSource, ModpackVersion, Profile, ServerInfo, ServerType } from '../../shared/types'
import { tm } from '../i18n'
import { cfModpackVersions, cfPackFile, isCurseforgeId, modpackSummary, resolveFiles, resolveManifest, type CfManifest, type CfPackFile } from '../curseforge'
import { backupWorlds } from '../worldBackups'
import { createServer, deleteServer, freePort, serverDirOf } from '../server/store'
import { e4mcSupported } from '../../shared/aloriaHud'
import { dropOrphanMods } from '../game/modCheck'
import { totalmem } from 'node:os'

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
    /** Modpack CurseForge : nom, icône et projet donnés par l'API CurseForge */
    info?: KnownFile
  }[]
  dependencies: Record<string, string>
  /** Modpack CurseForge : fichiers que leurs auteurs ne laissent télécharger que sur le site de CurseForge */
  manual?: ManualFile[]
}

interface KnownFile {
  title: string
  iconUrl: string | null
  projectId: string
  versionId: string
  versionNumber: string
}

interface ManualFile {
  path: string
  title: string
  fileName: string
  sha1: string
  pageUrl: string
}

// Hébergeurs autorisés par le format .mrpack : un modpack ne peut pas faire télécharger n'importe quoi
// (plus le CDN de CurseForge, d'où viennent les adresses données par son API)
const ALLOWED_HOSTS = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com', 'edge.forgecdn.net', 'mediafilez.forgecdn.net']
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

/** Versions d'un modpack Modrinth ou CurseForge (« cf:<id> »), les plus récentes d'abord */
export async function modpackVersions(projectId: string): Promise<ModpackVersion[]> {
  if (isCurseforgeId(projectId)) return cfModpackVersions(projectId)
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

type PublishedSource = Extract<ModpackSource, { kind: 'modrinth' }>

/** Fichier du modpack d'une version publiée (adresse, taille, SHA-1) : .mrpack Modrinth ou .zip CurseForge */
async function packFile(source: PublishedSource): Promise<{ url: string; size: number; sha1: string }> {
  if (isCurseforgeId(source.projectId)) return cfPackFile(source.projectId, source.versionId)
  const version = await getVersion(source.versionId)
  const file = version.files.find((f) => f.filename.endsWith('.mrpack')) ?? version.files.find((f) => f.primary)
  if (!file) throw new Error(tm('err.modpackNoFile'))
  return { url: file.url, size: file.size, sha1: file.hashes.sha1 }
}

const cachedPack = (source: PublishedSource) =>
  join(cacheDir(), isCurseforgeId(source.projectId) ? `cf-${source.versionId}.zip` : `${source.versionId}.mrpack`)

const INDEX_FILES = ['modrinth.index.json', 'manifest.json']

/** Index du modpack : modrinth.index.json tel quel, ou manifest.json de CurseForge complété par son API */
async function parseIndex(name: string, raw: Buffer): Promise<MrpackIndex> {
  let json: MrpackIndex | CfManifest
  try {
    json = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
  } catch {
    throw new Error(tm('err.modpackRead'))
  }
  if (name === 'modrinth.index.json') return json as MrpackIndex
  const manifest = json as CfManifest
  if (manifest.manifestType !== 'minecraftModpack' || !manifest.minecraft) throw new Error(tm('err.modpackRead'))
  const { dependencies, files } = await resolveManifest(manifest)
  return { formatVersion: 1, game: 'minecraft', versionId: manifest.version, name: manifest.name, dependencies, ...(await cfEntries(files)) }
}

/** Fichiers CurseForge au format de l'index ; ceux que CurseForge ne laisse pas télécharger sont pris sur Modrinth (même SHA-1), sinon à la main */
async function cfEntries(files: CfPackFile[]): Promise<Pick<MrpackIndex, 'files' | 'manual'>> {
  const blocked = files.filter((f) => !f.url && f.sha1)
  if (blocked.length > 0) {
    const found = await versionsByHash(blocked.map((f) => f.sha1)).catch(() => ({}) as Awaited<ReturnType<typeof versionsByHash>>)
    for (const f of blocked) f.url = found[f.sha1]?.files.find((file) => file.hashes.sha1 === f.sha1)?.url ?? null
  }
  return {
    files: files.map((f) => ({
      path: f.path,
      hashes: { sha1: f.sha1 },
      downloads: f.url ? [f.url] : [],
      fileSize: f.size,
      info: { title: f.title, iconUrl: f.iconUrl, projectId: f.projectId, versionId: f.versionId, versionNumber: f.fileName }
    })),
    manual: files.filter((f) => !f.url).map((f) => ({ path: f.path, title: f.title, fileName: f.fileName, sha1: f.sha1, pageUrl: f.pageUrl }))
  }
}

/**
 * Modpack Modrinth avec la liste de Missing Mods Checker : ses adresses CurseForge (« …/download/<numéro> ») donnent les
 * fichiers, téléchargés comme ceux d'un modpack CurseForge. false si la liste est illisible ou si l'API ne répond pas.
 */
async function applyChecker(index: MrpackIndex, raw: Buffer): Promise<boolean> {
  try {
    const list = JSON.parse(raw.toString('utf8').replace(/^﻿/, '')) as { url?: string; destination?: string }[]
    if (!Array.isArray(list) || list.length === 0) return false
    const byFolder = new Map<string, number[]>()
    for (const item of list) {
      const id = Number(/\/(?:download|files)\/(\d+)\/?$/.exec(item.url ?? '')?.[1])
      if (!id) return false
      const folder = (item.destination || 'mods').replace(/^\/+|\/+$/g, '')
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), id])
    }
    const files: CfPackFile[] = []
    for (const [folder, ids] of byFolder) files.push(...(await resolveFiles(ids, folder)))
    if (files.length !== list.length) return false
    const entries = await cfEntries(files)
    index.files.push(...entries.files)
    index.manual = entries.manual
    return true
  } catch {
    return false
  }
}

/** Télécharge un gros fichier en suivant sa progression (octets reçus), SHA-1 vérifié avant de le garder */
async function downloadWithProgress(url: string, path: string, sha1: string, size: number, onBytes: (done: number) => void): Promise<void> {
  // Un nouvel essai (connexion coupée) repart de zéro : la barre recule alors un instant
  const res = await fetchBytes(url, { onBytes: (done) => onBytes(Math.min(done, size)) })
  if (!res.ok) throw new Error(tm('err.download', { url, reason: `HTTP ${res.status}` }))
  if (sha1 && createHash('sha1').update(res.data).digest('hex') !== sha1) throw new Error(tm('err.corrupted'))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.part`, res.data)
  await rename(`${path}.part`, path)
}

async function openPack(source: ModpackSource, onDownload?: (done: number, total: number) => void): Promise<{ zip: AdmZip; index: MrpackIndex }> {
  let path: string
  if (source.kind === 'file') path = source.path
  else {
    path = cachedPack(source)
    if (!existsSync(path)) {
      const file = await packFile(source)
      if (onDownload) await downloadWithProgress(file.url, path, file.sha1, file.size, (done) => onDownload(done, file.size))
      else await downloadAll([{ url: file.url, path, sha1: file.sha1 || undefined, size: file.size }], () => {})
    }
  }
  let zip: AdmZip | null = null
  let entry: AdmZip.IZipEntry | null = null
  try {
    zip = new AdmZip(path)
    entry = INDEX_FILES.map((name) => zip!.getEntry(name)).find((e) => !!e) ?? null
  } catch {
    // Zip illisible
  }
  if (!zip || !entry) throw new Error(tm('err.modpackRead'))
  const index = await parseIndex(entry.entryName, entry.getData())
  const checker = index.manual ? undefined : zip.getEntries().find((e) => OVERRIDES.some((o) => e.entryName.startsWith(o)) && isCheckerList(e.entryName))
  if (checker) await applyChecker(index, checker.getData())
  return { zip, index }
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
  let indexEntry: (Entry & { name: string }) | null = null
  let checkerList: Entry | null = null
  let checkerJar = false
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const nameLen = cd.readUInt16LE(p + 28)
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
    const entry = { method: cd.readUInt16LE(p + 10), compressedSize: cd.readUInt32LE(p + 20), offset: cd.readUInt32LE(p + 42) }
    if (INDEX_FILES.includes(name)) indexEntry = { ...entry, name }
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
  const index = await parseIndex(indexEntry.name, raw)
  if (checkerList) {
    const list = await read(checkerList)
    if (list && (await applyChecker(index, list))) return { index, overrides, manualMods: null }
  }
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
  if (source.kind === 'modrinth' && !existsSync(cachedPack(source))) {
    const file = await packFile(source)
    // Lecture partielle impossible : on télécharge le modpack ; une erreur de l'API CurseForge, elle, est montrée telle quelle
    const summary = await remoteSummary(file.url, file.size).catch((err: Error) => {
      if (err.message.includes('CurseForge')) throw err
      return null
    })
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
async function lookup(index: MrpackIndex): Promise<Map<string, KnownFile>> {
  const out = new Map<string, KnownFile>()
  try {
    const versions = await versionsByHash(index.files.map((f) => f.hashes.sha1).filter((h) => !!h))
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
  // Modpack CurseForge : ce que son API a donné, pour les fichiers que Modrinth ne connaît pas
  for (const f of index.files) if (f.info && f.hashes.sha1 && !out.has(f.hashes.sha1)) out.set(f.hashes.sha1, f.info)
  return out
}

/**
 * Fichiers CurseForge que leurs auteurs ne laissent télécharger que sur le site : le joueur les télécharge depuis la fenêtre
 * du modpack (dossier Téléchargements), on les reconnaît à leur nom et leur SHA-1. Déjà dans le profil : rien à faire.
 */
async function findManual(manual: ManualFile[], gameDir?: string): Promise<{ found: Map<string, string>; missing: ManualFile[] }> {
  const found = new Map<string, string>()
  const missing: ManualFile[] = []
  const downloads = app.getPath('downloads')
  for (const m of manual) {
    const candidates = [join(downloads, m.fileName)]
    if (gameDir) candidates.unshift(safeJoin(gameDir, m.path), safeJoin(gameDir, m.path) + DISABLED)
    let hit: string | null = null
    for (const path of candidates) {
      if (m.sha1 ? (await fileSha1(path)) === m.sha1 : existsSync(path)) {
        hit = path
        break
      }
    }
    if (hit) found.set(m.path, hit)
    else missing.push(m)
  }
  return { found, missing }
}

const clientFiles = (index: MrpackIndex) => index.files.filter((f) => f.env?.client !== 'unsupported')

export async function previewModpack(source: ModpackSource, profileId?: string): Promise<ModpackPreview> {
  const { index, overrides, manualMods } = await packSummary(source)
  const known = await lookup(index)
  const { loader, loaderVersion, unsupported: loaderProblem } = loaderOf(index)
  const cf = await findManual(index.manual ?? [], profileId ? gameDirOf(profileId) : undefined)
  // Mods à télécharger à la main : le jeu ne se lancerait pas sans eux (ou il faudrait en désactiver d'autres en cascade)
  const unsupported =
    loaderProblem ??
    // Modpack CurseForge : sa propre liste de mods à télécharger à la main remplace celle de Missing Mods Checker
    (manualMods !== null && !index.manual ? manualMessage(manualMods) : null) ??
    (cf.missing.length > 0 ? tm('err.modpackCfManual', { n: cf.missing.length }) : null)
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
  if (!summary && source.kind === 'modrinth') {
    summary = isCurseforgeId(source.projectId)
      ? await modpackSummary(source.projectId).catch(() => '')
      : ((await getProject(source.projectId).catch(() => null))?.description ?? '')
  }
  return {
    name: index.name,
    summary,
    versionNumber: index.versionId,
    gameVersion: index.dependencies.minecraft,
    loader,
    loaderVersion,
    unsupported,
    files,
    overrides,
    manual: (index.manual ?? []).map((m) => ({ title: m.title, fileName: m.fileName, url: m.pageUrl, found: cf.found.has(m.path) }))
  }
}

/** Version de Forge du modpack (« 14.23.5.2859 ») au format du launcher (« 1.12.2-14.23.5.2859 ») */
export async function forgeVersion(gameVersion: string, forge: string): Promise<string> {
  const all = await forgeLoaders(gameVersion)
  const found = all.find((v) => v.version === `${gameVersion}-${forge}` || v.version.startsWith(`${gameVersion}-${forge}-`) || v.label === forge)
  if (!found) throw new Error(tm('err.modpackForgeVersion', { version: forge }))
  return found.version
}

/** Adresse de téléchargement autorisée de chaque fichier (refus de tout le modpack si l'un vient d'ailleurs) */
function downloadUrls(files: MrpackIndex['files'], local: Map<string, string>): Map<string, string> {
  const urls = new Map<string, string>()
  for (const f of files) {
    if (local.has(f.path)) continue
    const url = f.downloads.find((d) => {
      try {
        return ALLOWED_HOSTS.includes(new URL(d).hostname)
      } catch {
        return false
      }
    })
    if (!url) throw new Error(tm('err.modpackHost', { file: fileName(f.path) }))
    urls.set(f.path, url)
  }
  return urls
}

/** Configs, réglages, packs fournis tels quels, par chemin dans le profil ; client-overrides passe après (propre au jeu) */
function providedFiles(zip: AdmZip, prefixes = OVERRIDES): Map<string, AdmZip.IZipEntry> {
  const out = new Map<string, AdmZip.IZipEntry>()
  for (const prefix of prefixes) {
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName.startsWith(prefix)) out.set(entry.entryName.slice(prefix.length), entry)
    }
  }
  return out
}

const DISABLED = '.disabled'

const sha1Of = (data: Buffer) => createHash('sha1').update(data).digest('hex')

async function fileSha1(path: string): Promise<string | null> {
  try {
    return sha1Of(await readFile(path))
  } catch {
    return null
  }
}

/**
 * Ce qu'une version du modpack a mis dans le profil (fichiers téléchargés et fichiers fournis, avec leur SHA-1),
 * gardé dans aloria-modpack.json : la mise à jour sait ainsi quoi retirer et quelles configs le joueur a modifiées.
 */
interface Manifest {
  files: Record<string, string>
  overrides: Record<string, string>
}

const manifestPath = (gameDir: string) => join(gameDir, 'aloria-modpack.json')

function manifestOf(index: MrpackIndex, zip: AdmZip): Manifest {
  const overrides: Record<string, string> = {}
  for (const [path, entry] of providedFiles(zip)) overrides[path] = sha1Of(entry.getData())
  return { files: Object.fromEntries(clientFiles(index).map((f) => [f.path, f.hashes.sha1])), overrides }
}

/** Manifeste de la version installée : le fichier du profil, sinon (profils d'avant) la version Modrinth retéléchargée */
async function installedManifest(profile: Profile): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(gameDirOf(profile.id)), 'utf8')) as Manifest
  } catch {
    const { projectId, versionId } = profile.modpack ?? {}
    if (!projectId || !versionId) return null
    const { zip, index } = await openPack({ kind: 'modrinth', projectId, versionId })
    return manifestOf(index, zip)
  }
}

type Known = Awaited<ReturnType<typeof lookup>>

/** Index de la Bibliothèque (aloria-content.json) : nom et icône des fichiers du modpack dans « Installés » */
async function writeContentIndex(gameDir: string, files: MrpackIndex['files'], known: Known, removed: string[]): Promise<void> {
  let contentIndex: Record<string, object> = {}
  try {
    contentIndex = JSON.parse(await readFile(join(gameDir, 'aloria-content.json'), 'utf8')) as Record<string, object>
  } catch {
    // Pas encore d'index
  }
  for (const path of removed) delete contentIndex[fileName(path)]
  for (const f of files) {
    const type = typeOf(f.path)
    const info = known.get(f.hashes.sha1)
    if (type === 'other' || !info || f.path.split('/').length !== 2) continue
    contentIndex[fileName(f.path)] = { type, ...info }
  }
  // Un modpack sans fichier (ou presque) n'a pas encore créé le dossier du profil
  await mkdir(gameDir, { recursive: true })
  await writeFile(join(gameDir, 'aloria-content.json'), JSON.stringify(contentIndex, null, 2))
}

/** Au plus une dizaine de messages par seconde vers la fenêtre (le téléchargement en produit des milliers) */
function throttled(report: (p: ModpackProgress) => void): (p: ModpackProgress) => void {
  let last = { step: '', time: 0 }
  return (p) => {
    const now = Date.now()
    if (p.step === last.step && now - last.time < 100 && p.done < p.total) return
    last = { step: p.step, time: now }
    report(p)
  }
}

/** Ouvre un modpack et vérifie qu'Aloria peut l'installer (chargeur, mods CurseForge, hébergeurs) */
async function openInstallable(source: ModpackSource, onProgress: (p: ModpackProgress) => void, gameDir?: string) {
  onProgress({ step: 'prepare', done: 0, total: 0 })
  const { zip, index } = await openPack(source, (done, total) => onProgress({ step: 'pack', done, total }))
  const { loader, loaderVersion, unsupported } = loaderOf(index)
  if (unsupported) throw new Error(unsupported)
  const manual = index.manual ? null : localManual(zip, index)
  if (manual !== null) throw new Error(manualMessage(manual))
  const cf = await findManual(index.manual ?? [], gameDir)
  if (cf.missing.length > 0) throw new Error(tm('err.modpackCfManual', { n: cf.missing.length }))
  const files = clientFiles(index)
  const gameVersion = index.dependencies.minecraft
  return {
    zip,
    index,
    files,
    urls: downloadUrls(files, cf.found),
    local: cf.found,
    gameVersion,
    loader: loader as Profile['loader'],
    loaderVersion: loader === 'forge' && loaderVersion ? await forgeVersion(gameVersion, loaderVersion) : loaderVersion,
    modpack: {
      name: index.name,
      versionNumber: index.versionId,
      ...(source.kind === 'modrinth' ? { projectId: source.projectId, versionId: source.versionId } : {})
    }
  }
}

type Pack = Awaited<ReturnType<typeof openInstallable>>

async function downloadFiles(gameDir: string, pack: Pack, files: Pack['files'], onProgress: (p: ModpackProgress) => void) {
  // Fichiers téléchargés à la main par le joueur : copiés depuis Téléchargements
  for (const f of files) {
    const from = pack.local.get(f.path)
    const dest = safeJoin(gameDir, f.path)
    if (!from || from === dest) continue
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(from, dest)
  }
  const tasks = files
    .filter((f) => !pack.local.has(f.path))
    .map((f) => ({ url: pack.urls.get(f.path)!, path: safeJoin(gameDir, f.path), sha1: f.hashes.sha1 || undefined, size: f.fileSize }))
  await downloadAll(tasks, (p) =>
    onProgress({ step: 'files', done: p.doneBytes, total: p.totalBytes, doneFiles: p.doneFiles, totalFiles: p.totalFiles })
  )
}

/**
 * Installe un modpack dans un nouveau profil : chargeur et version du jeu du modpack, fichiers téléchargés (SHA-1 vérifié),
 * puis overrides copiés par-dessus. En cas d'échec, le profil à moitié installé est supprimé.
 */
export async function installModpack(source: ModpackSource, report: (p: ModpackProgress) => void): Promise<Profile> {
  const onProgress = throttled(report)
  const pack = await openInstallable(source, onProgress)
  const profile = createProfile({
    name: pack.index.name,
    icon: '📦',
    versionId: pack.gameVersion,
    loader: pack.loader,
    loaderVersion: pack.loaderVersion,
    ramMb: null,
    modpack: pack.modpack
  })
  const gameDir = gameDirOf(profile.id)

  try {
    await downloadFiles(gameDir, pack, pack.files, onProgress)
    const provided = providedFiles(pack.zip)
    let copied = 0
    onProgress({ step: 'overrides', done: 0, total: provided.size })
    for (const [path, entry] of provided) {
      const dest = safeJoin(gameDir, path)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
      onProgress({ step: 'overrides', done: ++copied, total: provided.size })
    }
    onProgress({ step: 'finish', done: 0, total: 0 })

    // Bibliothèque : les fichiers du modpack apparaissent avec leur nom et leur icône dans « Installés »
    await writeContentIndex(gameDir, pack.files, await lookup(pack.index), [])
    await writeFile(manifestPath(gameDir), JSON.stringify(manifestOf(pack.index, pack.zip)))
  } catch (err) {
    await deleteProfile(profile.id, true).catch(() => {})
    throw err
  }
  return profile
}

/** Nouvelle version installable du modpack d'un profil (finale, sauf si le joueur suit déjà les bêtas), sinon null */
export async function modpackUpdate(profileId: string): Promise<ModpackVersion | null> {
  const modpack = getProfile(profileId).modpack
  if (!modpack?.projectId || !modpack.versionId) return null
  const versions = await modpackVersions(modpack.projectId)
  const current = versions.findIndex((v) => v.id === modpack.versionId)
  if (current < 0) return null
  const beta = !versions[current].stable
  return versions.slice(0, current).find((v) => v.supported && (v.stable || beta)) ?? null
}

// Fichiers du joueur jamais remplacés quand ils existent déjà et qu'on ne sait pas s'il les a modifiés
const PLAYER_FILES = ['options.txt', 'servers.dat', 'saves/']
const isPlayerFile = (path: string) => PLAYER_FILES.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p))

/**
 * Passe le profil à une autre version de son modpack : les fichiers que la version installée avait ajoutés et que la
 * nouvelle n'a plus sont retirés, les nouveaux téléchargés, les configs remplacées sauf celles que le joueur a modifiées.
 * Mods ajoutés à la main, mondes et réglages restent ; un mod désactivé par le joueur le reste dans sa nouvelle version.
 */
export async function updateModpack(profileId: string, source: ModpackSource, report: (p: ModpackProgress) => void): Promise<Profile> {
  const profile = getProfile(profileId)
  if (!profile.modpack) throw new Error(tm('err.modpackNotModpack'))
  const gameDir = gameDirOf(profile.id)
  const onProgress = throttled(report)
  const pack = await openInstallable(source, onProgress, gameDir)
  const old = await installedManifest(profile)
  if (!old) throw new Error(tm('err.modpackNoPrevious'))
  // Nouvelle version du jeu : les mondes seront convertis sans retour possible, on les garde d'abord tels quels
  if (pack.gameVersion !== profile.versionId) await backupWorlds(profile.id, 'version')

  // Mods désactivés par le joueur : retrouvés par projet Modrinth (le nom du fichier change d'une version à l'autre)
  let contentIndex: Record<string, { projectId?: string }> = {}
  try {
    contentIndex = JSON.parse(await readFile(join(gameDir, 'aloria-content.json'), 'utf8'))
  } catch {
    // Pas d'index : aucun mod connu comme désactivé
  }
  const disabledProjects = new Set<string>()
  for (const path of Object.keys(old.files)) {
    const projectId = contentIndex[fileName(path)]?.projectId
    if (projectId && existsSync(safeJoin(gameDir, path) + DISABLED)) disabledProjects.add(projectId)
  }

  // Fichiers téléchargés : retirés s'ils ont changé ou disparu, puis ceux qui manquent sont téléchargés
  const wanted = new Map(pack.files.map((f) => [f.path, f.hashes.sha1]))
  const removed = Object.keys(old.files).filter((path) => wanted.get(path) !== old.files[path])
  for (const path of removed) {
    const dest = safeJoin(gameDir, path)
    await rm(dest, { force: true })
    await rm(dest + DISABLED, { force: true })
  }
  const missing: Pack['files'] = []
  for (const f of pack.files) {
    const dest = safeJoin(gameDir, f.path)
    if ((await fileSha1(dest)) !== f.hashes.sha1 && (await fileSha1(dest + DISABLED)) !== f.hashes.sha1) missing.push(f)
  }
  await downloadFiles(gameDir, pack, missing, onProgress)

  // Fichiers fournis : remplacés s'ils sont encore tels que l'ancienne version les avait mis, gardés si le joueur les a changés
  const provided = providedFiles(pack.zip)
  let copied = 0
  onProgress({ step: 'overrides', done: 0, total: provided.size })
  for (const [path, entry] of provided) {
    const dest = safeJoin(gameDir, path)
    const onDisk = await fileSha1(dest)
    const untouched = onDisk === null || (old.overrides[path] ? onDisk === old.overrides[path] : !isPlayerFile(path))
    if (untouched) {
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
    }
    onProgress({ step: 'overrides', done: ++copied, total: provided.size })
  }
  for (const [path, sha1] of Object.entries(old.overrides)) {
    if (provided.has(path)) continue
    const dest = safeJoin(gameDir, path)
    if ((await fileSha1(dest)) === sha1) await rm(dest, { force: true })
  }
  onProgress({ step: 'finish', done: 0, total: 0 })

  const known = await lookup(pack.index)
  for (const f of missing) {
    const projectId = known.get(f.hashes.sha1)?.projectId
    if (projectId && disabledProjects.has(projectId)) {
      const dest = safeJoin(gameDir, f.path)
      await rename(dest, dest + DISABLED)
    }
  }
  await writeContentIndex(gameDir, pack.files, known, removed)
  await writeFile(manifestPath(gameDir), JSON.stringify(manifestOf(pack.index, pack.zip)))
  return updateProfile(profile.id, {
    versionId: pack.gameVersion,
    loader: pack.loader,
    loaderVersion: pack.loaderVersion,
    modpack: pack.modpack
  })
}

// Serveur : overrides puis server-overrides (propres au serveur) ; packs de textures, shaders et réglages du jeu n'y servent pas
const SERVER_OVERRIDES = ['overrides/', 'server-overrides/']
const CLIENT_ONLY = /^(resourcepacks|shaderpacks|screenshots|saves)\/|^options\.txt$|^servers\.dat$/

/** Fichiers (par SHA-1) dont le projet Modrinth dit qu'ils ne marchent pas sur un serveur (mods d'affichage, de menus…) */
async function clientOnlyHashes(hashes: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (hashes.length === 0) return out
  try {
    const versions = await versionsByHash(hashes)
    const ids = [...new Set(Object.values(versions).map((v) => v.project_id))]
    const serverless = new Set<string>()
    for (let i = 0; i < ids.length; i += 100) {
      for (const p of await getProjects(ids.slice(i, i + 100))) {
        if ((p as { server_side?: string }).server_side === 'unsupported') serverless.add(p.id)
      }
    }
    for (const [sha1, v] of Object.entries(versions)) if (serverless.has(v.project_id)) out.add(sha1)
  } catch {
    // Modrinth injoignable : tout est gardé (un mod client seul fait au pire planter le serveur, on le verra dans sa console)
  }
  return out
}

/**
 * Derniers réglages des mods d'un serveur, d'après leurs jars : un mod Fabric déclaré « client » (environment) est retiré ;
 * les fichiers de langue vides (ex. FTB Quests Freeze Fix), que le jeu ignore mais qui font planter le serveur au démarrage
 * (NullPointerException dans Language), sont retirés de la copie du serveur. only : ces jars seulement. Renvoie les jars retirés.
 */
export async function prepareServerMods(modsDir: string, only?: string[]): Promise<string[]> {
  const removed: string[] = []
  if (!existsSync(modsDir)) return removed
  for (const name of only ?? (await readdir(modsDir))) {
    if (!name.endsWith('.jar')) continue
    const path = join(modsDir, name)
    try {
      const zip = new AdmZip(path)
      const fabric = zip.getEntry('fabric.mod.json')?.getData().toString('utf8')
      if (fabric && (JSON.parse(fabric) as { environment?: string }).environment === 'client') {
        await rm(path, { force: true })
        removed.push(name)
        continue
      }
      const empty = zip
        .getEntries()
        .filter((e) => /^assets\/[^/]+\/lang\/[^/]+\.json$/i.test(e.entryName) && e.getData().toString('utf8').trim() === '')
      if (empty.length === 0) continue
      for (const e of empty) zip.deleteFile(e.entryName)
      await writeFile(`${path}.part`, zip.toBuffer())
      await rename(`${path}.part`, path)
    } catch {
      // Jar illisible : le serveur le dira
    }
  }
  return removed
}

/**
 * Crée un serveur à partir d'un modpack : même version du jeu et même chargeur (installés au premier démarrage), mods
 * qui marchent côté serveur (d'après le modpack, Modrinth et le jar lui-même), configs fournies. Le joueur a accepté
 * le CLUF dans la fenêtre du modpack. En cas d'échec, le serveur à moitié créé est supprimé.
 */
export async function installModpackServer(source: ModpackSource, report: (p: ModpackProgress) => void): Promise<ServerInfo> {
  const onProgress = throttled(report)
  const pack = await openInstallable(source, onProgress)
  const type = pack.loader as ServerType
  const server = await createServer({
    name: pack.index.name,
    icon: '📦',
    type,
    gameVersion: pack.gameVersion,
    loaderVersion: pack.loaderVersion,
    // Les modpacks demandent de la mémoire : 6 Go si le PC en a assez (modifiable ensuite)
    ramMb: Math.max(2048, Math.min(6144, Math.floor(totalmem() / 1024 / 1024 / 2 / 512) * 512)),
    port: freePort(),
    tunnel: e4mcSupported(type, pack.gameVersion) ? 'e4mc' : 'none'
  })
  const dir = serverDirOf(server.id)
  try {
    const provided = [...providedFiles(pack.zip, SERVER_OVERRIDES)].filter(([path]) => !CLIENT_ONLY.test(path) && !isCheckerJar(path))
    const candidates = pack.files.filter((f) => f.env?.server !== 'unsupported' && !isCheckerJar(f.path) && ['mod', 'other'].includes(typeOf(f.path)))
    // Modrinth tranche aussi pour les fichiers que le modpack dit compatibles serveur (les auteurs se trompent souvent)
    const providedJars = provided.filter(([path]) => /^mods\/[^/]+\.jar$/i.test(path)).map(([path, entry]) => [path, sha1Of(entry.getData())] as const)
    const clientOnly = await clientOnlyHashes([
      ...candidates.filter((f) => f.hashes.sha1).map((f) => f.hashes.sha1),
      ...providedJars.map(([, sha1]) => sha1)
    ])
    const files = candidates.filter((f) => !clientOnly.has(f.hashes.sha1))
    await downloadFiles(dir, pack, files, onProgress)

    const skipped = new Set(providedJars.filter(([, sha1]) => clientOnly.has(sha1)).map(([path]) => path))
    const kept = provided.filter(([path]) => !skipped.has(path))
    let copied = 0
    onProgress({ step: 'overrides', done: 0, total: kept.length })
    for (const [path, entry] of kept) {
      const dest = safeJoin(dir, path)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
      onProgress({ step: 'overrides', done: ++copied, total: kept.length })
    }
    onProgress({ step: 'finish', done: 0, total: 0 })
    const removed = new Set(await prepareServerMods(join(dir, 'mods')))
    if (type === 'fabric') for (const name of await dropOrphanMods(join(dir, 'mods'))) removed.add(name)

    // Liste des mods de la page Serveurs : nom et icône des mods du modpack
    const known = await lookup(pack.index)
    const contentIndex: Record<string, { projectId: string; title: string; iconUrl: string | null }> = {}
    for (const f of files) {
      const info = known.get(f.hashes.sha1)
      if (info && f.path.startsWith('mods/') && f.path.split('/').length === 2 && !removed.has(fileName(f.path))) {
        contentIndex[fileName(f.path)] = { projectId: info.projectId, title: info.title, iconUrl: info.iconUrl }
      }
    }
    await mkdir(join(dir, 'mods'), { recursive: true })
    await writeFile(join(dir, 'mods', 'aloria-content.json'), JSON.stringify(contentIndex, null, 2))
  } catch (err) {
    await deleteServer(server.id).catch(() => {})
    throw err
  }
  return server
}
