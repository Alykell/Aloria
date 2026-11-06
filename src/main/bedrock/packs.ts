import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { getSettings } from '../settings'
import { extractUnder, importBedrockWorld, mainUserDir, safeName, sharedDir } from './worlds'
import type { BedrockImport, BedrockPack, BedrockPackType } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Packs de Bedrock (dossiers de « Shared ») : ressources, comportements, skins. Un .mcpack ou un .mcaddon s'installe sans ouvrir
 * le jeu ; un pack de ressources est aussitôt activé pour tous les mondes (global_resource_packs.json du joueur).
 */
const TYPE_DIRS: Record<BedrockPackType, string> = {
  resources: 'resource_packs',
  behavior: 'behavior_packs',
  skins: 'skin_packs'
}

interface Manifest {
  header?: {
    name?: string
    description?: string
    uuid?: string
    version?: number[] | string
  }
  modules?: { type?: string }[]
}

/** manifest.json de Bedrock : du JSON qui tolère parfois les commentaires et les virgules en trop */
function parseManifest(text: string): Manifest {
  const clean = text.replace(/^﻿/, '')
  try {
    return JSON.parse(clean)
  } catch {
    return JSON.parse(
      clean
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1')
    )
  }
}

function packType(manifest: Manifest): BedrockPackType | null {
  const types = (manifest.modules ?? []).map((m) => m.type)
  if (types.includes('resources')) return 'resources'
  if (types.some((t) => t === 'data' || t === 'script' || t === 'javascript' || t === 'client_data')) return 'behavior'
  if (types.includes('skin_pack')) return 'skins'
  return null
}

const versionText = (v: number[] | string | undefined) => (Array.isArray(v) ? v.join('.') : (v ?? ''))

/** Nom traduit (« pack.name ») depuis texts/<langue>.lang du pack */
async function localized(dir: string, text: string): Promise<string> {
  if (!/^[\w.]+$/.test(text) || !text.includes('.')) return text
  const lang = getSettings().language === 'en' ? ['en_US', 'fr_FR'] : ['fr_FR', 'en_US']
  for (const l of lang) {
    const file = join(dir, 'texts', `${l}.lang`)
    if (!existsSync(file)) continue
    const line = (await readFile(file, 'utf8')).split(/\r?\n/).find((s) => s.startsWith(`${text}=`))
    if (line)
      return line
        .slice(text.length + 1)
        .replace(/\s*#.*$/, '')
        .trim()
  }
  return text
}

/** Packs de ressources actifs dans tous les mondes, chez le joueur principal */
const globalFile = async () => join(await mainUserDir(), 'minecraftpe', 'global_resource_packs.json')

async function readGlobal(): Promise<{ pack_id: string; version: number[] }[]> {
  const file = await globalFile()
  try {
    return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : []
  } catch {
    return []
  }
}

async function writeGlobal(list: { pack_id: string; version: number[] }[]): Promise<void> {
  const file = await globalFile()
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(list, null, 2))
}

export async function listBedrockPacks(): Promise<BedrockPack[]> {
  const global = new Set((await readGlobal()).map((g) => g.pack_id))
  const packs: BedrockPack[] = []
  for (const [type, sub] of Object.entries(TYPE_DIRS) as [BedrockPackType, string][]) {
    const root = join(sharedDir(), sub)
    if (!existsSync(root)) continue
    for (const folder of (await readdir(root)).filter((f) => !f.startsWith('.aloria-'))) {
      const dir = join(root, folder)
      const manifestFile = join(dir, 'manifest.json')
      if (!existsSync(manifestFile)) continue
      try {
        const { header = {} } = parseManifest(await readFile(manifestFile, 'utf8'))
        const iconFile = join(dir, 'pack_icon.png')
        packs.push({
          type,
          folder,
          uuid: header.uuid ?? '',
          name: (await localized(dir, header.name ?? '')).replace(/§./g, '') || folder,
          description: (await localized(dir, header.description ?? '')).replace(/§./g, ''),
          version: versionText(header.version),
          icon: existsSync(iconFile) ? `data:image/png;base64,${(await readFile(iconFile)).toString('base64')}` : null,
          global: type === 'resources' && !!header.uuid && global.has(header.uuid)
        })
      } catch {
        // Manifeste illisible : pack ignoré
      }
    }
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name))
}

export async function setBedrockPackGlobal(folder: string, on: boolean): Promise<void> {
  const pack = (await listBedrockPacks()).find((p) => p.type === 'resources' && p.folder === folder)
  if (!pack?.uuid) return
  const manifest = parseManifest(await readFile(join(sharedDir(), TYPE_DIRS.resources, folder, 'manifest.json'), 'utf8'))
  const version = Array.isArray(manifest.header?.version) ? manifest.header.version : [1, 0, 0]
  const list = (await readGlobal()).filter((g) => g.pack_id !== pack.uuid)
  // Le premier de la liste passe au-dessus des autres
  await writeGlobal(on ? [{ pack_id: pack.uuid, version }, ...list] : list)
}

export async function deleteBedrockPack(type: BedrockPackType, folder: string): Promise<void> {
  if (!TYPE_DIRS[type] || !safeName(folder)) return
  if (type === 'resources') await setBedrockPackGlobal(folder, false)
  await rm(join(sharedDir(), TYPE_DIRS[type], folder), {
    recursive: true,
    force: true
  })
}

/** Nom de dossier lisible tiré du nom du pack */
const folderName = (name: string, uuid: string) =>
  name
    .replace(/§./g, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 40) ||
  uuid.slice(0, 8) ||
  'pack'

/** Installe les packs (et mondes) d'une archive, y compris les .mcpack / .mcworld rangés dans un .mcaddon */
async function installZip(zip: AdmZip, out: BedrockImport): Promise<void> {
  // Monde (ses propres packs compris) : level.dat à la racine ou dans un seul dossier
  const world = await importBedrockWorld(zip)
  if (world) {
    out.worlds.push(world)
    return
  }
  const entries = zip.getEntries()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    if (/\.(mcpack|mcworld|zip)$/i.test(entry.entryName)) await installZip(new AdmZip(entry.getData()), out)
  }
  const manifests = entries.map((e) => e.entryName).filter((n) => n === 'manifest.json' || n.endsWith('/manifest.json'))
  for (const name of manifests) {
    const prefix = name.slice(0, -'manifest.json'.length)
    // Manifeste rangé dans un autre pack (sous-pack, modèle) : il fait partie de ce dernier
    if (manifests.some((other) => other !== name && prefix.startsWith(other.slice(0, -'manifest.json'.length)))) continue
    let manifest: Manifest
    try {
      manifest = parseManifest(zip.getEntry(name)!.getData().toString('utf8'))
    } catch {
      continue
    }
    const type = packType(manifest)
    if (!type) continue
    const root = join(sharedDir(), TYPE_DIRS[type])
    const uuid = manifest.header?.uuid ?? ''
    // Même pack déjà installé (même uuid) : remplacé par cette version
    const installed = (await listBedrockPacks()).find((p) => p.type === type && p.uuid && p.uuid === uuid)
    if (installed) await rm(join(root, installed.folder), { recursive: true, force: true })
    // Extrait d'abord dans un dossier provisoire : le nom lisible peut venir des traductions du pack (« pack.name »)
    const temp = join(root, `.aloria-${Date.now()}`)
    await mkdir(temp, { recursive: true })
    extractUnder(zip, prefix, temp)
    const title = await localized(temp, manifest.header?.name ?? '')
    const base = installed?.folder ?? folderName(title, uuid)
    let folder = base
    for (let i = 2; existsSync(join(root, folder)); i++) folder = `${base} ${i}`
    await rename(temp, join(root, folder))
    out.packs.push(title.replace(/§./g, '') || folder)
    if (type === 'resources' && uuid) await setBedrockPackGlobal(folder, true)
  }
}

/** .mcpack, .mcaddon, .mcworld (ou leur version .zip) */
export async function importBedrockFile(file: string): Promise<BedrockImport> {
  let zip: AdmZip
  try {
    zip = new AdmZip(file)
  } catch {
    throw new Error(tm('err.bedrockBadFile'))
  }
  const out: BedrockImport = { packs: [], worlds: [] }
  await installZip(zip, out)
  if (out.packs.length === 0 && out.worlds.length === 0) throw new Error(tm('err.bedrockBadFile'))
  return out
}
