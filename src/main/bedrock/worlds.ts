import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { paths } from '../game/paths'
import type { BedrockWorld } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Données de Minecraft Bedrock (version GDK du Microsoft Store) : %APPDATA%\Minecraft Bedrock\Users\<joueur>\games\com.mojang,
 * avec un dossier par compte Xbox et « Shared » pour les packs communs. En développement, ALORIA_BEDROCK_ROOT en prend un autre.
 */
export const BEDROCK_ROOT = (!app.isPackaged && process.env.ALORIA_BEDROCK_ROOT) || join(app.getPath('appData'), 'Minecraft Bedrock')
export const BEDROCK_ID = 'bedrock'

const usersDir = () => join(BEDROCK_ROOT, 'Users')
const mojangDir = (user: string) => join(usersDir(), user, 'games', 'com.mojang')
export const sharedDir = () => mojangDir('Shared')

async function users(): Promise<string[]> {
  if (!existsSync(usersDir())) return []
  return (await readdir(usersDir(), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && existsSync(mojangDir(d.name)))
    .map((d) => d.name)
}

/** Dossier du joueur qui a joué en dernier (là où le jeu crée ses mondes) ; « Shared » s'il n'y en a pas */
export async function mainUserDir(): Promise<string> {
  let best: { dir: string; time: number } | null = null
  for (const user of await users()) {
    if (user === 'Shared') continue
    const options = join(mojangDir(user), 'minecraftpe', 'options.txt')
    const time = existsSync(options) ? (await stat(options)).mtimeMs : 0
    if (!best || time > best.time) best = { dir: mojangDir(user), time }
  }
  return best?.dir ?? sharedDir()
}

const worldDirs = async () => (await users()).map((u) => join(mojangDir(u), 'minecraftWorlds')).filter((d) => existsSync(d))

export const bedrockBackupsDir = () => join(paths.root, 'bedrock', 'backups')

export const safeName = (name: string) => !!name && !/[/\\]/.test(name) && name !== '..' && name !== '.'

/** Dossier d'un monde ; un monde disparu (restauration) revient chez le joueur principal */
export async function bedrockWorldDir(id: string): Promise<string> {
  if (!safeName(id)) throw new Error(tm('err.worldMissing'))
  for (const dir of await worldDirs()) if (existsSync(join(dir, id, 'level.dat'))) return join(dir, id)
  return join(await mainUserDir(), 'minecraftWorlds', id)
}

async function folderSize(dir: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    total += entry.isDirectory() ? await folderSize(path) : (await stat(path)).size
  }
  return total
}

export async function listBedrockWorlds(withSize = false): Promise<BedrockWorld[]> {
  const worlds: BedrockWorld[] = []
  for (const dir of await worldDirs()) {
    for (const id of await readdir(dir)) {
      const levelDat = join(dir, id, 'level.dat')
      if (!existsSync(levelDat)) continue
      const nameFile = join(dir, id, 'levelname.txt')
      const iconFile = join(dir, id, 'world_icon.jpeg')
      worlds.push({
        id,
        name: (existsSync(nameFile) ? (await readFile(nameFile, 'utf8')).trim() : '') || id,
        lastPlayed: (await stat(levelDat)).mtimeMs,
        sizeMb: withSize ? Math.round(((await folderSize(join(dir, id))) / 1024 / 1024) * 10) / 10 : 0,
        icon: existsSync(iconFile) ? `data:image/jpeg;base64,${(await readFile(iconFile)).toString('base64')}` : null
      })
    }
  }
  return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
}

/** Fichiers verrouillés tant que le jeu a le monde ouvert (LevelDB), inutiles dans une copie */
export const lockedFile = (name: string) => /(^|[/\\])LOCK$/.test(name)

/** Monde en .mcworld (zip du contenu du dossier, sans dossier parent), que Bedrock sait importer */
export async function exportBedrockWorld(id: string, file: string): Promise<void> {
  const src = await bedrockWorldDir(id)
  if (!existsSync(src)) throw new Error(tm('err.worldMissing'))
  const zip = new AdmZip()
  await zip.addLocalFolderPromise(src, {
    filter: (name: string) => !lockedFile(name)
  })
  await zip.writeZipPromise(file)
}

export async function deleteBedrockWorld(id: string): Promise<void> {
  const dir = await bedrockWorldDir(id)
  if (existsSync(join(dir, 'level.dat'))) await rm(dir, { recursive: true, force: true })
}

/** Extrait les fichiers sous `prefix` dans `dest`, sans jamais sortir de `dest` */
export function extractUnder(zip: AdmZip, prefix: string, dest: string): void {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue
    const rel = entry.entryName.slice(prefix.length)
    if (!rel || rel.split('/').some((part) => part === '..' || part === '')) continue
    zip.extractEntryTo(entry, join(dest, ...rel.split('/').slice(0, -1)), false, true)
  }
}

/** Monde d'un .mcworld (level.dat à la racine ou dans un seul dossier) : nouveau dossier chez le joueur principal ; renvoie son nom */
export async function importBedrockWorld(zip: AdmZip): Promise<string | null> {
  const levelDat = zip
    .getEntries()
    .map((e) => e.entryName)
    .filter((n) => n === 'level.dat' || n.endsWith('/level.dat'))
    .sort((a, b) => a.length - b.length)[0]
  if (!levelDat) return null
  const prefix = levelDat.slice(0, -'level.dat'.length)
  const folder = randomBytes(9).toString('base64url')
  const dest = join(await mainUserDir(), 'minecraftWorlds', folder)
  await mkdir(dest, { recursive: true })
  extractUnder(zip, prefix, dest)
  const name = zip.getEntry(`${prefix}levelname.txt`)?.getData().toString('utf8').trim()
  return name || folder
}
