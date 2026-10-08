import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { downloadAll } from './game/download'
import { paths } from './game/paths'
import { loadVersion, resolveVersionId } from './game/versions'
import { gameDirOf, getProfile } from './profiles'
import type { PackElement, PackInfo, PackLayout, PackVanilla } from '../shared/types'

/**
 * Packs de ressources créés dans Aloria (« Créations ») : quelques éléments simples (viseur, hotbar, totem) gardés
 * dans un format unique, puis convertis pour la version du profil où on les installe. Depuis la 1.20.2 chaque élément
 * a son image (sprites/hud/…) ; avant, ils sont rangés dans de grandes planches (icons.png, widgets.png) que
 * l'interface recompose à partir de celles du jeu. Le format du pack se lit dans le jar de la version.
 */
const PACKS = join(paths.root, 'packs')
const ELEMENTS: PackElement[] = ['crosshair', 'hotbar', 'hotbar_selection', 'totem', 'heart_full', 'heart_half', 'armor_full', 'armor_half', 'food_full', 'food_half']

/** Icônes de la barre de vie (1.20.2+) : chemin sous textures/gui/sprites/hud/, éléments modifiables puis fonds (aperçu) */
const HUD_SPRITES: Record<string, string> = {
  heart_full: 'heart/full',
  heart_half: 'heart/half',
  heart_container: 'heart/container',
  armor_full: 'armor_full',
  armor_half: 'armor_half',
  armor_empty: 'armor_empty',
  food_full: 'food_full',
  food_half: 'food_half',
  food_empty: 'food_empty'
}
const packDir = (id: string) => join(PACKS, id)
const infoFile = (id: string) => join(packDir(id), 'pack.json')
const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`
const fromDataUrl = (url: string) => Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64')

export async function listPacks(): Promise<PackInfo[]> {
  if (!existsSync(PACKS)) return []
  const packs: PackInfo[] = []
  for (const id of await readdir(PACKS)) {
    try {
      packs.push(await getPack(id))
    } catch {
      // Dossier abîmé ou incomplet : ignoré
    }
  }
  return packs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getPack(id: string): Promise<PackInfo> {
  const info = JSON.parse(await readFile(infoFile(id), 'utf8')) as Omit<PackInfo, 'images'>
  const images: PackInfo['images'] = {}
  for (const el of ELEMENTS) {
    const file = join(packDir(id), `${el}.png`)
    if (existsSync(file)) images[el] = dataUrl(await readFile(file))
  }
  return { ...info, images }
}

export async function createPack(name: string): Promise<PackInfo> {
  const id = randomUUID().slice(0, 8)
  const now = Date.now()
  await mkdir(packDir(id), { recursive: true })
  await writeFile(infoFile(id), JSON.stringify({ id, name: name.trim() || 'Mon pack', createdAt: now, updatedAt: now }, null, 2))
  return getPack(id)
}

export async function renamePack(id: string, name: string): Promise<void> {
  const info = JSON.parse(await readFile(infoFile(id), 'utf8')) as PackInfo
  info.name = name.trim() || info.name
  info.updatedAt = Date.now()
  await writeFile(infoFile(id), JSON.stringify(info, null, 2))
}

export async function deletePack(id: string): Promise<void> {
  await rm(packDir(id), { recursive: true, force: true })
}

/** Image d'un élément (data URL PNG), ou null pour revenir à celle du jeu */
export async function savePackImage(id: string, element: PackElement, image: string | null): Promise<void> {
  if (!ELEMENTS.includes(element)) throw new Error(`Élément inconnu : ${element}`)
  const file = join(packDir(id), `${element}.png`)
  if (image) await writeFile(file, fromDataUrl(image))
  else await rm(file, { force: true })
  const info = JSON.parse(await readFile(infoFile(id), 'utf8')) as PackInfo
  info.updatedAt = Date.now()
  await writeFile(infoFile(id), JSON.stringify(info, null, 2))
}

/** Jar du client pour une version du jeu, téléchargé s'il manque (profil jamais lancé) */
async function clientJar(gameVersion: string): Promise<string> {
  const jar = paths.versionJar(gameVersion)
  if (existsSync(jar)) return jar
  const version = await loadVersion(gameVersion)
  const client = version.downloads?.client
  if (!client) throw new Error(`Jeu introuvable pour Minecraft ${gameVersion}.`)
  await downloadAll([{ url: client.url, path: jar, sha1: client.sha1, size: client.size }], () => {})
  return jar
}

/** Format de pack de ressources de la version (lu dans le jar ; table pour les versions sans version.json) */
function packFormat(zip: AdmZip, gameVersion: string): [number, number] {
  const raw = zip.getEntry('version.json')?.getData().toString('utf8')
  if (raw) {
    const pv = (JSON.parse(raw) as { pack_version?: number | { resource?: number; resource_major?: number; resource_minor?: number } }).pack_version
    if (typeof pv === 'number') return [pv, 0]
    if (pv?.resource_major !== undefined) return [pv.resource_major, pv.resource_minor ?? 0]
    if (pv?.resource !== undefined) return [pv.resource, 0]
  }
  const minor = Number(/^1\.(\d+)/.exec(gameVersion)?.[1] ?? 0)
  return [minor <= 8 ? 1 : minor <= 10 ? 2 : minor <= 12 ? 3 : 4, 0]
}

/** Où vont les éléments dans cette version, et les planches d'origine à recomposer (anciennes versions) */
export async function packVanilla(gameVersionOrProfile: { profileId?: string; gameVersion?: string }): Promise<PackVanilla> {
  const gameVersion = gameVersionOrProfile.gameVersion ?? (await resolveVersionId(getProfile(gameVersionOrProfile.profileId!).versionId))
  const zip = new AdmZip(await clientJar(gameVersion))
  const png = (path: string) => {
    const data = zip.getEntry(path)?.getData()
    return data ? dataUrl(data) : null
  }
  const has = (path: string) => !!zip.getEntry(path)
  const T = 'assets/minecraft/textures/'
  let layout: PackLayout
  if (has(`${T}gui/sprites/hud/crosshair.png`)) layout = 'sprites'
  else layout = 'atlas'
  const totemPath = has(`${T}item/totem_of_undying.png`)
    ? `${T}item/totem_of_undying.png`
    : has(`${T}items/totem.png`)
      ? `${T}items/totem.png`
      : null
  return {
    gameVersion,
    layout,
    format: packFormat(zip, gameVersion),
    totemPath,
    images:
      layout === 'sprites'
        ? {
            crosshair: png(`${T}gui/sprites/hud/crosshair.png`),
            hotbar: png(`${T}gui/sprites/hud/hotbar.png`),
            hotbar_selection: png(`${T}gui/sprites/hud/hotbar_selection.png`),
            totem: totemPath ? png(totemPath) : null,
            ...Object.fromEntries(Object.entries(HUD_SPRITES).map(([k, path]) => [k, png(`${T}gui/sprites/hud/${path}.png`)]))
          }
        : { totem: totemPath ? png(totemPath) : null },
    atlases: layout === 'atlas' ? { icons: png(`${T}gui/icons.png`), widgets: png(`${T}gui/widgets.png`) } : {}
  }
}

/**
 * Écrit le pack (fichiers déjà convertis pour la version par l'interface : chemin → PNG) dans les resource packs
 * du profil et l'active dans son options.txt, en dernier (au-dessus des autres).
 */
export async function installPack(packId: string, profileId: string, files: Record<string, string>): Promise<string> {
  const pack = await getPack(packId)
  const profile = getProfile(profileId)
  const gameVersion = await resolveVersionId(profile.versionId)
  const zip = new AdmZip(await clientJar(gameVersion))
  const [major, minor] = packFormat(zip, gameVersion)

  const out = new AdmZip()
  const description = `${pack.name} · fait avec Aloria`
  // Depuis la 1.21.9 (format 65), pack_format est remplacé par min_format / max_format
  const meta =
    major >= 65
      ? { pack: { description, min_format: [major, minor], max_format: [major, minor] } }
      : { pack: { pack_format: major, description } }
  out.addFile('pack.mcmeta', Buffer.from(JSON.stringify(meta, null, 2)))
  for (const [path, image] of Object.entries(files)) out.addFile(path, fromDataUrl(image))

  const gameDir = gameDirOf(profileId)
  const fileName = `Aloria - ${pack.name.replace(/[\\/:*?"<>|]/g, '').trim() || pack.id}.zip`
  await mkdir(join(gameDir, 'resourcepacks'), { recursive: true })
  await writeFile(join(gameDir, 'resourcepacks', fileName), out.toBuffer())
  await enablePack(gameDir, fileName, major)
  return fileName
}

/** Ajoute le pack à la liste des packs actifs d'options.txt (en dernier : priorité la plus haute) */
async function enablePack(gameDir: string, fileName: string, format: number): Promise<void> {
  const file = join(gameDir, 'options.txt')
  const lines = existsSync(file) ? (await readFile(file, 'utf8')).split(/\r?\n/) : []
  // 1.13+ : « file/<nom> » à côté de « vanilla » ; avant : le nom seul
  const entry = format >= 4 ? `file/${fileName}` : fileName
  const i = lines.findIndex((l) => l.startsWith('resourcePacks:'))
  let packs: string[] = format >= 4 ? ['vanilla'] : []
  if (i >= 0) {
    try {
      packs = JSON.parse(lines[i].slice('resourcePacks:'.length)) as string[]
    } catch {
      // Ligne illisible : on repart de la liste par défaut
    }
  }
  packs = [...packs.filter((p) => p !== entry), entry]
  const line = `resourcePacks:${JSON.stringify(packs)}`
  if (i >= 0) lines[i] = line
  else lines.push(line)
  // Le jeu retire de la liste les packs « incompatibles » : on le retire aussi de cette liste-là
  const j = lines.findIndex((l) => l.startsWith('incompatibleResourcePacks:'))
  if (j >= 0) {
    try {
      const bad = (JSON.parse(lines[j].slice('incompatibleResourcePacks:'.length)) as string[]).filter((p) => p !== entry)
      lines[j] = `incompatibleResourcePacks:${JSON.stringify(bad)}`
    } catch {
      // ignorée
    }
  }
  await writeFile(file, lines.filter((l, k) => l !== '' || k < lines.length - 1).join('\n') + '\n')
}
