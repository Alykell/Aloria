import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadAll } from '../game/download'
import { resolveVersionId } from '../game/versions'
import { gameDirOf, getProfile } from '../profiles'
import { getProject, getVersion, listVersions, search, type ModrinthVersion } from './api'
import type { ContentType, InstalledContent, Profile, SearchHit, SearchQuery } from '../../shared/types'

const FOLDERS: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }
const LOADERS: Record<ContentType, string[]> = { mod: ['fabric'], resourcepack: ['minecraft'], shader: ['iris'] }
const EXTENSIONS: Record<ContentType, string[]> = { mod: ['.jar'], resourcepack: ['.zip'], shader: ['.zip'] }
const IRIS_PROJECT = 'YL57xq9U'
const DISABLED = '.disabled'

type IndexEntry = Omit<InstalledContent, 'fileName' | 'enabled'>
type Index = Record<string, IndexEntry>

interface Context {
  profile: Profile
  gameDir: string
  gameVersion: string
}

async function context(profileId: string): Promise<Context> {
  const profile = getProfile(profileId)
  return { profile, gameDir: gameDirOf(profile.id), gameVersion: await resolveVersionId(profile.versionId) }
}

// Ce qu'Aloria a installé dans un profil (titre, icône, version…), indexé par nom de fichier
const indexPath = (gameDir: string) => join(gameDir, 'aloria-content.json')

async function readIndex(gameDir: string): Promise<Index> {
  try {
    return JSON.parse(await readFile(indexPath(gameDir), 'utf8')) as Index
  } catch {
    return {}
  }
}

async function writeIndex(gameDir: string, index: Index): Promise<void> {
  await mkdir(gameDir, { recursive: true })
  await writeFile(indexPath(gameDir), JSON.stringify(index, null, 2))
}

function requireFabric(ctx: Context, type: ContentType): void {
  if (ctx.profile.loader === 'fabric') return
  throw new Error(
    type === 'shader'
      ? 'Les shaders ont besoin du mod Iris : choisis un profil Fabric.'
      : 'Les mods ont besoin de Fabric : choisis ou crée un profil Fabric.'
  )
}

export async function searchContent(q: SearchQuery): Promise<{ hits: SearchHit[]; total: number; gameVersion: string }> {
  const { gameVersion } = await context(q.profileId)
  return { ...(await search(q, gameVersion)), gameVersion }
}

export async function listInstalled(profileId: string): Promise<InstalledContent[]> {
  const gameDir = gameDirOf(profileId)
  const index = await readIndex(gameDir)
  const items: InstalledContent[] = []

  for (const type of Object.keys(FOLDERS) as ContentType[]) {
    const dir = join(gameDir, FOLDERS[type])
    if (!existsSync(dir)) continue
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const enabled = !entry.name.endsWith(DISABLED)
      const fileName = enabled ? entry.name : entry.name.slice(0, -DISABLED.length)
      // Les packs décompressés (dossiers) comptent aussi pour les resource packs et shaders
      const valid = EXTENSIONS[type].some((ext) => fileName.endsWith(ext)) || (entry.isDirectory() && type !== 'mod')
      if (!valid) continue
      const meta: IndexEntry | undefined = index[fileName]
      items.push({ ...meta, title: meta?.title ?? fileName, fileName, type, enabled })
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title))
}

/** Choisit la meilleure version d'un projet pour le profil (release de préférence). */
async function pickVersion(projectId: string, type: ContentType, gameVersion: string, title: string): Promise<ModrinthVersion> {
  let versions = await listVersions(projectId, LOADERS[type], [gameVersion])
  // Resource packs et shaders fonctionnent souvent sur des versions non déclarées
  if (versions.length === 0 && type !== 'mod') versions = await listVersions(projectId, LOADERS[type], undefined)
  if (versions.length === 0) throw new Error(`« ${title} » n'est pas disponible pour Minecraft ${gameVersion}.`)
  return versions.find((v) => v.version_type === 'release') ?? versions[0]
}

async function installOne(
  ctx: Context,
  index: Index,
  projectId: string,
  type: ContentType,
  auto: boolean,
  pinnedVersionId: string | null,
  visited: Set<string>
): Promise<void> {
  if (visited.has(projectId)) return
  visited.add(projectId)

  const findExisting = (id: string) => Object.entries(index).find(([, e]) => e.projectId === id)
  // Une dépendance déjà présente suffit, inutile de la remplacer
  if (auto && findExisting(projectId)) return

  // Accepte aussi un slug (« sodium ») : on se ramène à l'id réel du projet
  const project = await getProject(projectId)
  projectId = project.id
  visited.add(projectId)
  const existing = findExisting(projectId)
  if (existing && auto) return

  let version = pinnedVersionId ? await getVersion(pinnedVersionId) : null
  if (!version || !version.game_versions.includes(ctx.gameVersion)) {
    version = await pickVersion(projectId, type, ctx.gameVersion, project.title)
  }

  const file = version.files.find((f) => f.primary) ?? version.files[0]
  const dir = join(ctx.gameDir, FOLDERS[type])
  await downloadAll([{ url: file.url, path: join(dir, file.filename), sha1: file.hashes.sha1, size: file.size }], () => {})

  if (existing && existing[0] !== file.filename) {
    await rm(join(dir, existing[0]), { force: true })
    await rm(join(dir, existing[0] + DISABLED), { force: true })
    delete index[existing[0]]
  }
  index[file.filename] = {
    type,
    projectId,
    versionId: version.id,
    versionNumber: version.version_number,
    title: project.title,
    iconUrl: project.icon_url,
    auto: existing ? existing[1].auto && auto : auto
  }

  // Dépendances obligatoires (Fabric API, Sodium pour Iris…)
  for (const dep of version.dependencies) {
    if (dep.dependency_type !== 'required') continue
    const depProject = dep.project_id ?? (dep.version_id ? (await getVersion(dep.version_id)).project_id : null)
    if (depProject) await installOne(ctx, index, depProject, 'mod', true, dep.version_id, visited)
  }
}

export async function installContent(profileId: string, projectId: string, type: ContentType): Promise<void> {
  const ctx = await context(profileId)
  if (type !== 'resourcepack') requireFabric(ctx, type)

  const index = await readIndex(ctx.gameDir)
  const visited = new Set<string>()
  try {
    await installOne(ctx, index, projectId, type, false, null, visited)
    // Les shaders ont besoin d'Iris (qui amène Sodium)
    if (type === 'shader') await installOne(ctx, index, IRIS_PROJECT, 'mod', true, null, visited)
  } finally {
    // On garde la trace de ce qui a pu être installé, même en cas d'erreur en cours de route
    await writeIndex(ctx.gameDir, index)
  }
}

export async function setContentEnabled(profileId: string, type: ContentType, fileName: string, enabled: boolean): Promise<void> {
  const base = join(gameDirOf(profileId), FOLDERS[type], fileName)
  const [from, to] = enabled ? [base + DISABLED, base] : [base, base + DISABLED]
  if (existsSync(from)) await rename(from, to)
}

export async function removeContent(profileId: string, type: ContentType, fileName: string): Promise<void> {
  const gameDir = gameDirOf(profileId)
  const base = join(gameDir, FOLDERS[type], fileName)
  await rm(base, { force: true, recursive: true })
  await rm(base + DISABLED, { force: true, recursive: true })
  const index = await readIndex(gameDir)
  delete index[fileName]
  await writeIndex(gameDir, index)
}

export async function openContentFolder(profileId: string, type: ContentType): Promise<string> {
  const dir = join(gameDirOf(profileId), FOLDERS[type])
  await mkdir(dir, { recursive: true })
  return dir
}
