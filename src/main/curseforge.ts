import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ModpackVersion, SearchHit, SearchQuery } from '../shared/types'
import { forgeSupported, neoforgeSupported } from '../shared/loaders'
import { tm } from './i18n'

const API = 'https://api.curseforge.com/v1'
const MINECRAFT = 432
const CLASS_MODPACK = 4471
// Dossier du profil selon la catégorie CurseForge du fichier (mods par défaut)
const CLASS_FOLDERS: Record<number, string> = { 6: 'mods', 12: 'resourcepacks', 6552: 'shaderpacks', 6945: 'datapacks' }

// Clé de l'API CurseForge : mise à la compilation par la CI (secret CURSEFORGE_API_KEY), sinon fichier hors du dépôt (développement)
declare const __CURSEFORGE_KEY__: string
let key: string | null = null
function apiKey(): string {
  if (key === null) {
    key = __CURSEFORGE_KEY__
    if (!key) {
      try {
        key = readFileSync(join(homedir(), '.aloria-curseforge-key'), 'utf8').trim()
      } catch {
        key = ''
      }
    }
  }
  if (!key) throw new Error(tm('err.curseforgeKey'))
  return key
}

async function get<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'x-api-key': apiKey(),
      Accept: 'application/json',
      'User-Agent': `Alykell/Aloria/${app.getVersion()} (github.com/Alykell/Aloria)`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) throw new Error(tm('err.curseforge', { status: res.status }))
  return ((await res.json()) as { data: T }).data
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  classId?: number
  downloadCount: number
  logo: { thumbnailUrl: string } | null
  authors: { name: string }[]
  categories: { name: string }[]
  links: { websiteUrl: string | null }
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: 1 | 2 | 3
  fileLength: number
  downloadUrl: string | null
  hashes: { value: string; algo: 1 | 2 }[]
  gameVersions: string[]
  isServerPack?: boolean
}

/** Modpack CurseForge : manifest.json à la racine du zip, dossier overrides/ */
export interface CfManifest {
  manifestType: string
  minecraft: { version: string; modLoaders: { id: string; primary?: boolean }[] }
  name: string
  version: string
  files: { projectID: number; fileID: number; required?: boolean }[]
}

/** Projets CurseForge rangés dans profile.modpack.projectId sous la forme « cf:<id> » (Modrinth : id tel quel) */
export const isCurseforgeId = (projectId: string) => projectId.startsWith('cf:')
const modIdOf = (projectId: string) => Number(projectId.slice(3))

const SORT_FIELDS: Record<SearchQuery['sort'], number> = { relevance: 1, downloads: 6, newest: 11, updated: 3 }

export async function searchModpacks(q: SearchQuery): Promise<{ hits: SearchHit[]; total: number }> {
  const params = new URLSearchParams({
    gameId: String(MINECRAFT),
    classId: String(CLASS_MODPACK),
    sortField: String(SORT_FIELDS[q.sort]),
    sortOrder: 'desc',
    index: String(q.offset),
    pageSize: '20'
  })
  if (q.query) params.set('searchFilter', q.query)
  const res = await fetch(`${API}/mods/search?${params}`, { headers: { 'x-api-key': apiKey(), Accept: 'application/json' } })
  if (!res.ok) throw new Error(tm('err.curseforge', { status: res.status }))
  const { data, pagination } = (await res.json()) as { data: CfMod[]; pagination: { totalCount: number } }
  return {
    // L'API ne sert pas au-delà de 10 000 résultats
    total: Math.min(pagination.totalCount, 10_000),
    hits: data.map((m) => ({
      projectId: `cf:${m.id}`,
      slug: m.slug,
      title: m.name,
      author: m.authors[0]?.name ?? '',
      description: m.summary,
      downloads: m.downloadCount,
      iconUrl: m.logo?.thumbnailUrl ?? null,
      categories: m.categories.map((c) => c.name),
      url: m.links.websiteUrl ?? `https://www.curseforge.com/minecraft/modpacks/${m.slug}`
    }))
  }
}

export const modpackSummary = async (projectId: string) => (await get<CfMod>(`/mods/${modIdOf(projectId)}`)).summary

const LOADERS: Record<string, string> = { Forge: 'forge', Fabric: 'fabric', NeoForge: 'neoforge', Quilt: 'quilt' }

/** Versions d'un modpack CurseForge, les plus récentes d'abord (sans les packs serveur) */
export async function cfModpackVersions(projectId: string): Promise<ModpackVersion[]> {
  const files: CfFile[] = []
  // Les plus récentes suffisent : 4 pages de 50
  for (let index = 0; index < 200; index += 50) {
    const res = await fetch(`${API}/mods/${modIdOf(projectId)}/files?index=${index}&pageSize=50`, {
      headers: { 'x-api-key': apiKey(), Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(tm('err.curseforge', { status: res.status }))
    const page = (await res.json()) as { data: CfFile[]; pagination: { totalCount: number } }
    files.push(...page.data)
    if (index + 50 >= page.pagination.totalCount) break
  }
  return files
    .filter((f) => !f.isServerPack)
    .map((f) => {
      const gameVersions = f.gameVersions.filter((v) => /^\d/.test(v))
      const loaders = f.gameVersions.map((v) => LOADERS[v]).filter((l): l is string => !!l)
      return {
        id: String(f.id),
        versionNumber: f.displayName,
        gameVersions,
        loaders,
        stable: f.releaseType === 1,
        supported:
          loaders.includes('fabric') ||
          (loaders.includes('forge') && gameVersions.some(forgeSupported)) ||
          (loaders.includes('neoforge') && gameVersions.some(neoforgeSupported))
      }
    })
}

const sha1Of = (f: CfFile) => f.hashes.find((h) => h.algo === 1)?.value ?? ''

/** Fichier .zip d'une version de modpack (adresse, taille, SHA-1) ; refusé si son auteur interdit les autres launchers */
export async function cfPackFile(projectId: string, fileId: string): Promise<{ url: string; size: number; sha1: string }> {
  const file = await get<CfFile>(`/mods/${modIdOf(projectId)}/files/${fileId}`)
  if (!file.downloadUrl) throw new Error(tm('err.curseforgeNoDownload'))
  return { url: file.downloadUrl, size: file.fileLength, sha1: sha1Of(file) }
}

/** Fichier d'un modpack CurseForge ; sans adresse (url null), son auteur n'autorise que le site de CurseForge */
export interface CfPackFile {
  path: string
  fileName: string
  sha1: string
  size: number
  url: string | null
  title: string
  iconUrl: string | null
  projectId: string
  versionId: string
  pageUrl: string
}

/** Fichiers et chargeur d'un manifest.json, retrouvés par l'API (les fichiers non requis sont ceux que l'auteur a désactivés) */
export async function resolveManifest(manifest: CfManifest): Promise<{ dependencies: Record<string, string>; files: CfPackFile[] }> {
  const dependencies: Record<string, string> = { minecraft: manifest.minecraft.version }
  const loader = manifest.minecraft.modLoaders.find((l) => l.primary) ?? manifest.minecraft.modLoaders[0]
  if (loader) {
    const [name, ...rest] = loader.id.split('-')
    const version = rest.join('-')
    const key = name === 'fabric' ? 'fabric-loader' : name === 'quilt' ? 'quilt-loader' : name
    dependencies[key] = version
  }

  const wanted = manifest.files.filter((f) => f.required !== false)
  return { dependencies, files: await resolveFiles(wanted.map((f) => f.fileID)) }
}

/** Fichiers CurseForge par leur numéro, avec le nom et l'icône de leur projet ; folder : dossier imposé (sinon selon la catégorie) */
export async function resolveFiles(fileIds: number[], folder?: string): Promise<CfPackFile[]> {
  const files: CfFile[] = []
  const mods = new Map<number, CfMod>()
  // Par paquets, pour ne pas envoyer des requêtes énormes
  for (let i = 0; i < fileIds.length; i += 200) {
    const slice = await get<CfFile[]>('/mods/files', { fileIds: fileIds.slice(i, i + 200) })
    files.push(...slice)
    const modIds = [...new Set(slice.map((f) => f.modId))]
    for (const m of await get<CfMod[]>('/mods', { modIds, filterPcOnly: true })) mods.set(m.id, m)
  }
  return files.map((f) => {
    const mod = mods.get(f.modId)
    const site = mod?.links.websiteUrl ?? `https://www.curseforge.com/projects/${f.modId}`
    return {
      path: `${folder ?? CLASS_FOLDERS[mod?.classId ?? 6] ?? 'mods'}/${f.fileName}`,
      fileName: f.fileName,
      sha1: sha1Of(f),
      size: f.fileLength,
      url: f.downloadUrl,
      title: mod?.name ?? f.fileName,
      iconUrl: mod?.logo?.thumbnailUrl ?? null,
      projectId: `cf:${f.modId}`,
      versionId: String(f.id),
      pageUrl: `${site}/files/${f.id}`
    }
  })
}
