import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { downloadAll } from '../game/download'
import { forgeLoaders } from '../game/forge'
import { createProfile, deleteProfile, gameDirOf } from '../profiles'
import { forgeSupported } from '../../shared/loaders'
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
    supported: v.loaders.includes('fabric') || (v.loaders.includes('forge') && v.game_versions.some(forgeSupported))
  }))
}

// Fichiers .mrpack téléchargés pour un aperçu, réutilisés à l'installation
const cacheDir = () => join(app.getPath('temp'), 'aloria-modpacks')

async function openPack(source: ModpackSource): Promise<{ zip: AdmZip; index: MrpackIndex }> {
  let path: string
  if (source.kind === 'file') path = source.path
  else {
    path = join(cacheDir(), `${source.versionId}.mrpack`)
    if (!existsSync(path)) {
      const version = await getVersion(source.versionId)
      const file = version.files.find((f) => f.filename.endsWith('.mrpack')) ?? version.files.find((f) => f.primary)
      if (!file) throw new Error(tm('err.modpackNoFile'))
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
  const other = deps['neoforge'] ? 'NeoForge' : deps['quilt-loader'] ? 'Quilt' : null
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
  const { zip, index } = await openPack(source)
  const known = await lookup(index)
  const { loader, loaderVersion, unsupported } = loaderOf(index)
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
  const overrides = zip.getEntries().filter((e) => !e.isDirectory && OVERRIDES.some((o) => e.entryName.startsWith(o))).length
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
  const { zip, index } = await openPack(source)
  const { loader, loaderVersion, unsupported } = loaderOf(index)
  if (unsupported) throw new Error(unsupported)
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
