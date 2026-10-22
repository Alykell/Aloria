import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import AdmZip from 'adm-zip'
import { basename, join } from 'node:path'
import { downloadAll } from '../game/download'
import { resolveVersionId } from '../game/versions'
import { gameDirOf, getProfile } from '../profiles'
import { getProject, getVersion, listVersions, search, versionsByHash, type ModrinthVersion } from './api'
import type { ContentType, ImportResult, InstalledContent, Loader, Profile, SearchHit, SearchQuery } from '../../shared/types'
import { tm } from '../i18n'
import { isCurseforgePack, isInstanceZip } from '../instances'
import { cfBestFile, cfMods, cfSearch, cfSha1, isCurseforgeId, modIdOf } from '../curseforge'

/** Les datapacks sont propres à chaque monde : ceux du profil sont copiés dans tous ses mondes au lancement (game/datapacks.ts) */
const FOLDERS: Record<ContentType, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }
/** Chargeur Modrinth du contenu : mods du chargeur du profil, shaders pour Iris (Fabric, NeoForge) ou OptiFine (Forge) */
export function modrinthLoaders(type: ContentType, loader: Loader): string[] {
  if (type === 'resourcepack') return ['minecraft']
  if (type === 'datapack') return ['datapack']
  if (type === 'shader') return loader === 'forge' ? ['optifine'] : ['iris']
  return [loader === 'vanilla' ? 'fabric' : loader]
}

/** Iris existe pour Fabric et NeoForge : il est ajouté avec les shaders */
const usesIris = (loader: Loader) => loader === 'fabric' || loader === 'neoforge'
const EXTENSIONS: Record<ContentType, string[]> = { mod: ['.jar'], resourcepack: ['.zip'], shader: ['.zip'], datapack: ['.zip'] }
const IRIS_PROJECT = 'YL57xq9U'
const LOADER_NAMES: Record<Loader, string> = { vanilla: 'Minecraft', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }
const DISABLED = '.disabled'

type IndexEntry = Omit<InstalledContent, 'fileName' | 'enabled'>
type Index = Record<string, IndexEntry>

interface Context {
  profile: Profile
  gameDir: string
  gameVersion: string
  /** Identifiants des mods Fabric ajoutés à la main (sans projet Modrinth connu), pour ne pas les installer en double */
  localIds?: Set<string>
}

async function context(profileId: string): Promise<Context> {
  const profile = getProfile(profileId)
  return { profile, gameDir: gameDirOf(profile.id), gameVersion: await resolveVersionId(profile.versionId) }
}

/** Identifiants (fabric.mod.json) des mods ajoutés à la main dans le dossier mods */
async function localModIds(gameDir: string, index: Index): Promise<Set<string>> {
  const ids = new Set<string>()
  const dir = join(gameDir, FOLDERS.mod)
  if (!existsSync(dir)) return ids
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.jar') || index[name]?.projectId) continue
    try {
      const raw = new AdmZip(join(dir, name)).getEntry('fabric.mod.json')?.getData().toString('utf8')
      const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined
      if (id) ids.add(id)
    } catch {
      // Jar illisible : il n'empêche pas l'installation
    }
  }
  return ids
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

function requireModLoader(ctx: Context, type: ContentType): void {
  if (ctx.profile.loader !== 'vanilla') return
  throw new Error(
    type === 'shader'
      ? tm('err.shadersNeedLoader')
      : tm('err.modsNeedLoader')
  )
}

const looseTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Recherche sur Modrinth, CurseForge, ou les deux (« all », par défaut). offset : premier résultat de la page (page × limit).
 * Les deux sites : moitié de la page chacun, alternés (ou triés par téléchargements) ; un projet publié sur les deux sites
 * n'apparaît qu'une fois (sa fiche Modrinth). Un site qui ne répond pas n'empêche pas l'autre.
 */
export async function searchContent(q: SearchQuery): Promise<{ hits: SearchHit[]; total: number; gameVersion: string }> {
  const { gameVersion, profile } = await context(q.profileId)
  const loaders = q.type === 'modpack' ? ['fabric', 'neoforge', 'forge'] : modrinthLoaders(q.type, profile.loader)
  const limit = Math.min(Math.max(q.limit ?? 20, 2), 50)
  if (q.source === 'curseforge') return { ...(await cfSearch(q, gameVersion, profile.loader, limit)), gameVersion }
  if (q.source === 'modrinth') return { ...(await search(q, gameVersion, loaders, limit)), gameVersion }

  const half = { ...q, offset: Math.floor(q.offset / 2) }
  const [mr, cf] = await Promise.allSettled([
    search(half, gameVersion, loaders, Math.ceil(limit / 2)),
    cfSearch(half, gameVersion, profile.loader, Math.floor(limit / 2))
  ])
  if (mr.status === 'rejected' && cf.status === 'rejected') throw mr.reason
  const a = mr.status === 'fulfilled' ? mr.value : { hits: [], total: 0 }
  const b = cf.status === 'fulfilled' ? cf.value : { hits: [], total: 0 }
  let hits: SearchHit[] = []
  for (let i = 0; i < Math.max(a.hits.length, b.hits.length); i++) hits.push(...[a.hits[i], b.hits[i]].filter((h): h is SearchHit => !!h))
  const seen = new Set<string>()
  hits = hits.filter((h) => {
    const key = looseTitle(h.title)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (q.sort === 'downloads') hits.sort((x, y) => y.downloads - x.downloads)
  return { hits, total: a.total + b.total, gameVersion }
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
      // Le mod intégré au launcher est géré par le profil, pas par la bibliothèque
      if (type === 'mod' && fileName === 'aloria-hud.jar') continue
      const meta: IndexEntry | undefined = index[fileName]
      items.push({ ...meta, title: meta?.title ?? fileName, fileName, type, enabled })
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title))
}

/** Choisit la meilleure version d'un projet pour le profil (release de préférence). */
async function pickVersion(projectId: string, type: ContentType, ctx: Context, title: string): Promise<ModrinthVersion> {
  const { gameVersion } = ctx
  const loaders = modrinthLoaders(type, ctx.profile.loader)
  let versions = await listVersions(projectId, loaders, [gameVersion])
  // Resource packs et shaders fonctionnent souvent sur des versions non déclarées
  if (versions.length === 0 && (type === 'resourcepack' || type === 'shader')) versions = await listVersions(projectId, loaders, undefined)
  if (versions.length === 0) throw new Error(tm('err.contentUnavailable', { title, version: gameVersion }))
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
  if (isCurseforgeId(projectId)) return installCurseforge(ctx, index, projectId, type, auto, visited)

  // Même mod installé depuis CurseForge : il porte aussi son projet Modrinth
  const findExisting = (id: string) => Object.entries(index).find(([, e]) => e.projectId === id || e.modrinthId === id)
  // Une dépendance déjà présente suffit, inutile de la remplacer
  if (auto && findExisting(projectId)) return

  // Accepte aussi un slug (« sodium ») : on se ramène à l'id réel du projet
  const project = await getProject(projectId)
  projectId = project.id
  visited.add(projectId)
  // Même mod déjà ajouté à la main (l'identifiant du mod est presque toujours le nom court du projet Modrinth)
  if (auto && ctx.localIds?.has(project.slug)) return
  const existing = findExisting(projectId)
  if (existing && auto) return

  let version = pinnedVersionId ? await getVersion(pinnedVersionId) : null
  if (!version || !version.game_versions.includes(ctx.gameVersion)) {
    version = await pickVersion(projectId, type, ctx, project.title)
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

  // Dépendances obligatoires (Fabric API, Sodium pour Iris…) ; celles d'un datapack seraient des mods, sans objet en vanilla
  if (type === 'datapack') return
  for (const dep of version.dependencies) {
    if (dep.dependency_type !== 'required') continue
    const depProject = dep.project_id ?? (dep.version_id ? (await getVersion(dep.version_id)).project_id : null)
    if (depProject) await installOne(ctx, index, depProject, 'mod', true, dep.version_id, visited)
  }
}

/**
 * Installe un projet CurseForge (« cf:<id> ») : fichier adapté au profil, dépendances obligatoires CurseForge. Un fichier que
 * CurseForge ne laisse pas télécharger est pris sur Modrinth (même SHA-1), sinon le joueur doit passer par le site.
 */
async function installCurseforge(ctx: Context, index: Index, projectId: string, type: ContentType, auto: boolean, visited: Set<string>): Promise<void> {
  const findExisting = (id: string) => Object.entries(index).find(([, e]) => e.projectId === id || (!!e.modrinthId && e.modrinthId === id))
  if (auto && findExisting(projectId)) return
  const [mod] = await cfMods([modIdOf(projectId)])
  if (!mod) throw new Error(tm('err.contentUnavailable', { title: projectId, version: ctx.gameVersion }))
  // Dépendance déjà ajoutée à la main (identifiant du mod souvent égal au nom court du projet)
  if (auto && ctx.localIds?.has(mod.slug)) return
  const file = await cfBestFile(mod.id, type, ctx.gameVersion, ctx.profile.loader)
  if (!file) throw new Error(tm('err.contentUnavailable', { title: mod.name, version: ctx.gameVersion }))

  // Projet Modrinth du même fichier : évite les doublons entre les deux sites, et sert d'adresse si CurseForge refuse
  const sha1 = cfSha1(file)
  const onModrinth = sha1 ? (await versionsByHash([sha1]).catch(() => ({}) as Awaited<ReturnType<typeof versionsByHash>>))[sha1] : undefined
  if (auto && onModrinth && findExisting(onModrinth.project_id)) return
  const url = file.downloadUrl ?? onModrinth?.files.find((f) => f.hashes.sha1 === sha1)?.url
  if (!url) throw new Error(tm('err.curseforgeBlocked', { title: mod.name }))

  const existing = findExisting(projectId) ?? (onModrinth ? findExisting(onModrinth.project_id) : undefined)
  const dir = join(ctx.gameDir, FOLDERS[type])
  await downloadAll([{ url, path: join(dir, file.fileName), sha1: sha1 || undefined, size: file.fileLength }], () => {})
  if (existing && existing[0] !== file.fileName) {
    await rm(join(dir, existing[0]), { force: true })
    await rm(join(dir, existing[0] + DISABLED), { force: true })
    delete index[existing[0]]
  }
  index[file.fileName] = {
    type,
    projectId,
    versionId: String(file.id),
    versionNumber: file.displayName,
    title: mod.name,
    iconUrl: mod.logo?.thumbnailUrl ?? null,
    ...(onModrinth ? { modrinthId: onModrinth.project_id } : {}),
    auto: existing ? existing[1].auto && auto : auto
  }

  if (type === 'datapack') return
  for (const dep of file.dependencies ?? []) {
    if (dep.relationType === 3) await installOne(ctx, index, `cf:${dep.modId}`, 'mod', true, null, visited)
  }
}

export async function installContent(profileId: string, projectId: string, type: ContentType): Promise<void> {
  const ctx = await context(profileId)
  if (type === 'mod' || type === 'shader') requireModLoader(ctx, type)

  const index = await readIndex(ctx.gameDir)
  ctx.localIds = await localModIds(ctx.gameDir, index)
  const visited = new Set<string>()
  try {
    await installOne(ctx, index, projectId, type, false, null, visited)
    // Les shaders ont besoin d'Iris (qui amène Sodium) ; sous Forge, c'est OptiFine, ajouté à la main
    if (type === 'shader' && usesIris(ctx.profile.loader)) await installOne(ctx, index, IRIS_PROJECT, 'mod', true, null, visited)
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

/** OptiFine n'est pas sur Modrinth (sa licence interdit de le redistribuer) : le joueur le télécharge, puis on le range */
export const isOptiFine = (fileName: string) => /optifine/i.test(fileName) && fileName.toLowerCase().endsWith('.jar')

/** Ajoute le jar d'OptiFine choisi par le joueur dans les mods d'un profil Forge */
export async function addOptiFine(profileId: string, file: string): Promise<void> {
  const ctx = await context(profileId)
  if (ctx.profile.loader !== 'forge') throw new Error(tm('err.optifineForge'))
  const name = basename(file)
  if (!isOptiFine(name)) throw new Error(tm('err.notOptifine', { name }))
  // « OptiFine_1.8.9_HD_U_M5.jar » : la version du jeu est dans le nom
  if (!name.includes(`_${ctx.gameVersion}_`)) {
    throw new Error(tm('err.optifineVersion', { name, version: ctx.gameVersion }))
  }
  const dir = join(ctx.gameDir, FOLDERS.mod)
  await mkdir(dir, { recursive: true })
  // Une seule version d'OptiFine à la fois
  for (const entry of await readdir(dir)) {
    if (isOptiFine(entry.replace(/\.disabled$/, '')) && entry !== name) await rm(join(dir, entry), { force: true })
  }
  await copyFile(file, join(dir, name))
  const index = await readIndex(ctx.gameDir)
  for (const key of Object.keys(index)) if (isOptiFine(key) && key !== name) delete index[key]
  index[name] = { type: 'mod', title: 'OptiFine', versionNumber: name.replace(/^OptiFine_/i, '').replace(/\.jar$/i, '') }
  await writeIndex(ctx.gameDir, index)
}

/** Nom et version lus dans un jar de mod (fabric.mod.json, mods.toml ou mcmod.info), et son chargeur */
function modInfo(zip: AdmZip): { loader: Loader | null; title?: string; version?: string } {
  const text = (path: string) => zip.getEntry(path)?.getData().toString('utf8')
  const fabric = text('fabric.mod.json')
  if (fabric) {
    try {
      const json = JSON.parse(fabric) as { name?: string; version?: string }
      return { loader: 'fabric', title: json.name, version: json.version }
    } catch {
      return { loader: 'fabric' }
    }
  }
  const neo = text('META-INF/neoforge.mods.toml')
  const toml = neo ?? text('META-INF/mods.toml')
  if (toml) {
    const field = (key: string) => toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1]
    const version = field('version')
    return { loader: neo ? 'neoforge' : 'forge', title: field('displayName'), version: version?.includes('$') ? undefined : version }
  }
  const mcmod = text('mcmod.info')
  if (mcmod) {
    try {
      const raw = JSON.parse(mcmod) as { name?: string; version?: string }[] | { modList?: { name?: string; version?: string }[] }
      const first = Array.isArray(raw) ? raw[0] : raw.modList?.[0]
      return { loader: 'forge', title: first?.name, version: first?.version?.includes('$') ? undefined : first?.version }
    } catch {
      return { loader: 'forge' }
    }
  }
  return { loader: null }
}

/**
 * Ce qu'est un fichier ou dossier importé : mod (.jar), datapack (pack.mcmeta et dossier data/), resource pack (pack.mcmeta)
 * ou shader (dossier shaders/)
 */
function detectType(zip: AdmZip | null, dir: string | null): ContentType | null {
  if (dir) {
    if (existsSync(join(dir, 'pack.mcmeta'))) return existsSync(join(dir, 'data')) ? 'datapack' : 'resourcepack'
    if (existsSync(join(dir, 'shaders'))) return 'shader'
    return null
  }
  if (!zip) return null
  const names = zip.getEntries().map((e) => e.entryName)
  if (names.includes('pack.mcmeta')) return names.some((n) => n.startsWith('data/')) ? 'datapack' : 'resourcepack'
  if (names.some((n) => n.startsWith('shaders/'))) return 'shader'
  return null
}

/**
 * Importe des fichiers choisis ou glissés par le joueur (mods .jar, resource packs, shaders et datapacks en .zip ou en
 * dossier) dans un profil. Les fichiers refusés ne bloquent pas les autres : leurs erreurs sont renvoyées.
 */
export async function importFiles(profileId: string, paths: string[]): Promise<ImportResult> {
  const ctx = await context(profileId)
  const index = await readIndex(ctx.gameDir)
  const added: ContentType[] = []
  const errors: string[] = []
  const modpacks: string[] = []
  const instances: string[] = []
  let needIris = false

  for (const path of paths) {
    const name = basename(path)
    // Un modpack crée son propre profil : le renderer l'affiche avant de l'installer
    if (name.toLowerCase().endsWith('.mrpack')) {
      modpacks.push(path)
      continue
    }
    try {
      const isDir = (await stat(path)).isDirectory()
      const lower = name.toLowerCase()
      if (!isDir && isOptiFine(name)) {
        await addOptiFine(profileId, path)
        added.push('mod')
        continue
      }
      if (!isDir && !lower.endsWith('.jar') && !lower.endsWith('.zip')) throw new Error(tm('err.importUnknown', { name }))
      let zip: AdmZip | null = null
      try {
        if (!isDir) zip = new AdmZip(path)
      } catch {
        throw new Error(tm('err.importUnreadable', { name }))
      }

      // Modpack CurseForge : aperçu puis nouveau profil, comme un .mrpack
      if (zip && lower.endsWith('.zip') && isCurseforgePack(zip)) {
        modpacks.push(path)
        continue
      }
      // Profil complet exporté (Aloria, Prism, MultiMC) : il devient un nouveau profil
      if (zip && lower.endsWith('.zip') && isInstanceZip(zip)) {
        instances.push(path)
        continue
      }

      let type: ContentType
      let meta: IndexEntry | undefined
      if (zip && lower.endsWith('.jar')) {
        type = 'mod'
        requireModLoader(ctx, type)
        const info = modInfo(zip)
        // Un mod Fabric dans un profil Forge (ou l'inverse) ferait planter le jeu au lancement. Forge et NeoForge
        // restent proches (mods.toml) : on ne bloque qu'un mod NeoForge récent dans un profil Forge
        const wrong =
          !!info.loader &&
          ((info.loader === 'fabric') !== (ctx.profile.loader === 'fabric') || (info.loader === 'neoforge' && ctx.profile.loader === 'forge'))
        if (wrong) throw new Error(tm('err.importWrongLoader', { name, loader: LOADER_NAMES[info.loader!] }))
        meta = { type, title: info.title || name.replace(/\.jar$/i, ''), versionNumber: info.version }
      } else {
        const detected = detectType(zip, isDir ? path : null)
        // Zip de plusieurs packs (Vanilla Tweaks donne ses datapacks ainsi) : chacun est importé à part
        const inner = !detected && zip ? zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.zip')) : []
        if (inner.length > 0) {
          for (const entry of inner) {
            const data = entry.getData()
            const innerName = basename(entry.entryName)
            let innerType: ContentType | null = null
            try {
              innerType = detectType(new AdmZip(data), null)
            } catch {
              // Illisible : signalé ci-dessous
            }
            if (innerType !== 'datapack' && innerType !== 'resourcepack') {
              errors.push(tm('err.importUnknown', { name: `${name} › ${innerName}` }))
              continue
            }
            const dir = join(ctx.gameDir, FOLDERS[innerType])
            await mkdir(dir, { recursive: true })
            await rm(join(dir, innerName + DISABLED), { force: true })
            await writeFile(join(dir, innerName), data)
            delete index[innerName]
            added.push(innerType)
          }
          continue
        }
        if (!detected) throw new Error(tm('err.importUnknown', { name }))
        type = detected
        if (type === 'shader') requireModLoader(ctx, type)
        if (type === 'shader' && usesIris(ctx.profile.loader)) needIris = true
      }

      const dir = join(ctx.gameDir, FOLDERS[type])
      await mkdir(dir, { recursive: true })
      const dest = join(dir, name)
      await rm(dest + DISABLED, { force: true, recursive: true })
      if (isDir) await cp(path, dest, { recursive: true, force: true })
      else await copyFile(path, dest)
      if (meta) index[name] = meta
      else delete index[name]
      added.push(type)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Même refus pour plusieurs fichiers (mods dans un profil vanilla…) : une seule fois
      if (!errors.includes(message)) errors.push(message)
    }
  }

  try {
    // Comme depuis la recherche : les shaders ont besoin d'Iris sous Fabric
    ctx.localIds = await localModIds(ctx.gameDir, index)
    if (needIris) await installOne(ctx, index, IRIS_PROJECT, 'mod', true, null, new Set())
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    await writeIndex(ctx.gameDir, index)
  }
  return { added, errors, modpacks, instances }
}

export async function openContentFolder(profileId: string, type: ContentType): Promise<string> {
  const dir = join(gameDirOf(profileId), FOLDERS[type])
  await mkdir(dir, { recursive: true })
  return dir
}
