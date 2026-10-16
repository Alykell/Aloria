import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Datapacks d'un profil (dossier datapacks/ du profil, rempli par la Bibliothèque) : copiés dans tous ses mondes à chaque
 * lancement, Minecraft active tout seul un datapack qu'il découvre dans un monde. Un monde créé pendant la partie les
 * reçoit donc au lancement suivant.
 * Chaque monde garde la liste de ce qu'Aloria y a mis : un datapack supprimé à la main d'un monde n'y revient pas, et un
 * datapack retiré ou désactivé dans la Bibliothèque disparaît des mondes où Aloria l'avait mis (pas des autres).
 */
/** À côté du dossier datapacks du monde (dedans, Minecraft le prendrait pour un pack invalide) */
const MARKER = 'aloria-datapacks.json'
const DISABLED = '.disabled'

interface Marker {
  /** Datapacks qu'Aloria a déjà donnés à ce monde */
  given: string[]
}

async function readMarker(worldDir: string): Promise<Marker> {
  try {
    return JSON.parse(await readFile(join(worldDir, MARKER), 'utf8')) as Marker
  } catch {
    return { given: [] }
  }
}

/** Le datapack du profil a changé depuis sa copie (nouvelle version importée) */
async function isNewer(source: string, dest: string): Promise<boolean> {
  const [a, b] = await Promise.all([stat(source), stat(dest)])
  return a.isFile() && (a.size !== b.size || a.mtimeMs > b.mtimeMs)
}

export async function syncDatapacks(gameDir: string): Promise<void> {
  const source = join(gameDir, 'datapacks')
  const saves = join(gameDir, 'saves')
  if (!existsSync(saves)) return
  const enabled = existsSync(source) ? (await readdir(source)).filter((n) => !n.endsWith(DISABLED)) : []

  for (const world of await readdir(saves, { withFileTypes: true })) {
    if (!world.isDirectory() || !existsSync(join(saves, world.name, 'level.dat'))) continue
    const worldDir = join(saves, world.name)
    const dir = join(worldDir, 'datapacks')
    try {
      const marker = await readMarker(worldDir)
      // Pas de dossier datapacks à créer dans les mondes d'un profil qui n'en a jamais eu
      if (enabled.length === 0 && marker.given.length === 0) continue
      const given = new Set(marker.given)
      for (const name of enabled) {
        const dest = join(dir, name)
        if (!given.has(name)) {
          // Même nom déjà mis à la main dans ce monde : il reste au joueur (Aloria ne le supprimera pas)
          if (existsSync(dest)) continue
          await mkdir(dir, { recursive: true })
          await cp(join(source, name), dest, { recursive: true, force: true })
          given.add(name)
        } else if (existsSync(dest) && (await isNewer(join(source, name), dest))) {
          await cp(join(source, name), dest, { recursive: true, force: true })
        }
      }
      for (const name of [...given]) {
        if (enabled.includes(name)) continue
        await rm(join(dir, name), { recursive: true, force: true })
        given.delete(name)
      }
      if (given.size > 0 || marker.given.length > 0) {
        await writeFile(join(worldDir, MARKER), JSON.stringify({ given: [...given] } satisfies Marker, null, 2))
      }
    } catch (err) {
      // Un monde en lecture seule ou abîmé n'empêche pas de jouer
      console.warn('[datapacks]', world.name, err)
    }
  }
}
