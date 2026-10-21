import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import AdmZip from 'adm-zip'
import { gameDirOf } from './profiles'
import { getSettings } from './settings'
import { listWorlds } from './quickplay'
import type { WorldBackup, WorldBackupKind, WorldBackups } from '../shared/types'
import { tm } from './i18n'

/**
 * Sauvegardes des mondes solo d'un profil : un zip par monde et par sauvegarde dans <profil>/aloria-backups/<monde>.
 * Automatiques après chaque partie (seulement les mondes joués depuis la dernière), avant une mise à jour de modpack
 * qui change la version du jeu, ou à la demande. Les automatiques au-delà des AUTO_KEEP dernières sont effacées.
 */
const AUTO_KEEP = 5
// adm-zip prépare le zip en mémoire : au-delà, le monde est laissé de côté (il faudrait le sauvegarder à la main)
const MAX_BYTES = 1.5 * 1024 ** 3

const savesDir = (profileId: string) => join(gameDirOf(profileId), 'saves')
const backupsDir = (profileId: string, world?: string) => join(gameDirOf(profileId), 'aloria-backups', ...(world ? [world] : []))
const safeName = (name: string) => !!name && !name.includes('/') && !name.includes('\\') && name !== '..' && name !== '.'

/** Nom de fichier : date, puis l'occasion (« 2026-10-21_15-30-00_auto.zip ») */
function fileName(kind: WorldBackupKind): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_${kind}.zip`
}

async function backupsOf(profileId: string, world: string): Promise<WorldBackup[]> {
  const dir = backupsDir(profileId, world)
  if (!existsSync(dir)) return []
  const list = await Promise.all(
    (await readdir(dir))
      .filter((f) => f.endsWith('.zip'))
      .map(async (file) => {
        const st = await stat(join(dir, file))
        const kind = (/_(auto|manual|version|restore)\.zip$/.exec(file)?.[1] ?? 'manual') as WorldBackupKind
        return { file, kind, date: st.mtimeMs, sizeMb: Math.round((st.size / 1024 / 1024) * 10) / 10 }
      })
  )
  return list.sort((a, b) => b.date - a.date)
}

/** Mondes du profil (et mondes supprimés dont il reste des sauvegardes), avec leurs sauvegardes */
export async function listWorldBackups(profileId: string): Promise<WorldBackups[]> {
  const worlds = await listWorlds(profileId)
  const out: WorldBackups[] = []
  for (const w of worlds) out.push({ world: w.id, name: w.name, exists: true, backups: await backupsOf(profileId, w.id) })
  const root = backupsDir(profileId)
  for (const world of existsSync(root) ? await readdir(root) : []) {
    if (worlds.some((w) => w.id === world)) continue
    const backups = await backupsOf(profileId, world)
    if (backups.length > 0) out.push({ world, name: world, exists: false, backups })
  }
  return out
}

async function folderSize(dir: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    total += entry.isDirectory() ? await folderSize(path) : (await stat(path)).size
  }
  return total
}

/** Zippe un monde ; null s'il est trop gros */
export async function backupWorld(profileId: string, world: string, kind: WorldBackupKind): Promise<string | null> {
  if (!safeName(world)) return null
  const src = join(savesDir(profileId), world)
  if (!existsSync(src)) throw new Error(tm('err.worldMissing'))
  if ((await folderSize(src)) > MAX_BYTES) {
    if (kind === 'manual') throw new Error(tm('err.worldTooBig'))
    return null
  }
  const zip = new AdmZip()
  // session.lock est verrouillé tant que le jeu a le monde ouvert (et inutile dans une sauvegarde)
  await zip.addLocalFolderPromise(src, { zipPath: world, filter: (name: string) => !name.endsWith('session.lock') })
  await mkdir(backupsDir(profileId, world), { recursive: true })
  const file = fileName(kind)
  await zip.writeZipPromise(join(backupsDir(profileId, world), file))
  // Les automatiques tournent ; celles faites à la main ou avant un changement de version restent
  for (const old of (await backupsOf(profileId, world)).filter((b) => b.kind === 'auto').slice(AUTO_KEEP)) {
    await rm(join(backupsDir(profileId, world), old.file), { force: true })
  }
  return file
}

/** Mondes modifiés depuis leur dernière sauvegarde (level.dat est réécrit à chaque enregistrement du jeu) */
async function changedWorlds(profileId: string): Promise<string[]> {
  const saves = savesDir(profileId)
  if (!existsSync(saves)) return []
  const changed: string[] = []
  for (const world of await readdir(saves)) {
    const levelDat = join(saves, world, 'level.dat')
    if (!existsSync(levelDat)) continue
    const last = (await backupsOf(profileId, world))[0]
    if (!last || (await stat(levelDat)).mtimeMs > last.date) changed.push(world)
  }
  return changed
}

/** Sauvegarde de tous les mondes modifiés (après une partie) ou de tous les mondes (avant un changement de version) */
export async function backupWorlds(profileId: string, kind: 'auto' | 'version'): Promise<void> {
  if (kind === 'auto' && getSettings().worldBackups === false) return
  const worlds = kind === 'auto' ? await changedWorlds(profileId) : await listWorlds(profileId).then((list) => list.map((w) => w.id))
  for (const world of worlds) {
    await backupWorld(profileId, world, kind).catch((err) => console.warn('[sauvegardes]', world, err))
  }
}

// Sauvegarde en cours après une partie : un nouveau lancement du même profil l'attend
const pending = new Map<string, Promise<void>>()

export function backupAfterPlay(profileId: string): Promise<void> {
  const task = (pending.get(profileId) ?? Promise.resolve())
    .then(() => backupWorlds(profileId, 'auto'))
    .catch((err) => console.warn('[sauvegardes]', err))
  pending.set(profileId, task)
  task.finally(() => pending.get(profileId) === task && pending.delete(profileId))
  return task
}

export const waitForBackup = (profileId: string) => pending.get(profileId) ?? Promise.resolve()

/** Remet un monde sauvegardé (jeu fermé) ; le monde actuel est d'abord sauvegardé, au cas où */
export async function restoreWorld(profileId: string, world: string, file: string): Promise<void> {
  if (!safeName(world) || !safeName(file)) return
  const path = join(backupsDir(profileId, world), file)
  if (!existsSync(path)) throw new Error(tm('err.worldBackupMissing'))
  const dest = join(savesDir(profileId), world)
  if (existsSync(dest)) {
    await backupWorld(profileId, world, 'restore')
    await rm(dest, { recursive: true, force: true })
  }
  await mkdir(savesDir(profileId), { recursive: true })
  const zip = new AdmZip(path)
  // Chaque fichier doit rester dans le dossier du monde (un zip modifié à la main pourrait viser ailleurs)
  if (zip.getEntries().some((e) => !e.entryName.startsWith(`${world}/`) || e.entryName.split('/').includes('..'))) {
    throw new Error(tm('err.worldBackupMissing'))
  }
  await new Promise<void>((resolve, reject) => zip.extractAllToAsync(savesDir(profileId), true, false, (err) => (err ? reject(err) : resolve())))
}

export async function deleteWorldBackup(profileId: string, world: string, file: string): Promise<void> {
  if (!safeName(world) || !safeName(file)) return
  await rm(join(backupsDir(profileId, world), file), { force: true })
}

export async function openWorldBackups(profileId: string, world: string): Promise<void> {
  if (!safeName(world)) return
  await mkdir(backupsDir(profileId, world), { recursive: true })
  await shell.openPath(backupsDir(profileId, world))
}
