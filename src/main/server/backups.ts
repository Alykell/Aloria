import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import AdmZip from 'adm-zip'
import { readProperties } from './manage'
import { getServer, serverDirOf } from './store'
import type { ServerBackup, ServerBackupKind } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Sauvegardes du monde d'un serveur : zips dans servers/<id>/backups, les plus anciennes effacées au-delà du nombre
 * gardé. Le monde, c'est le dossier level-name (« world ») et, sous Paper, ses dossiers _nether et _the_end.
 */
const backupDir = (id: string) => join(serverDirOf(id), 'backups')

/** Nom de fichier : date, puis l'occasion (« 2026-10-12_15-30-00_auto.zip ») */
function fileName(kind: ServerBackupKind): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_${kind}.zip`
}

async function worldFolders(id: string): Promise<string[]> {
  const level = (await readProperties(id))['level-name'] || 'world'
  return [level, `${level}_nether`, `${level}_the_end`].filter((f) => existsSync(join(serverDirOf(id), f)))
}

export async function listBackups(id: string): Promise<ServerBackup[]> {
  const dir = backupDir(id)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => f.endsWith('.zip'))
  const list = await Promise.all(
    files.map(async (file) => {
      const st = await stat(join(dir, file))
      const kind = (/_(manual|auto|version|restore)\.zip$/.exec(file)?.[1] ?? 'manual') as ServerBackupKind
      return { file, kind, date: st.mtimeMs, sizeMb: Math.round((st.size / 1024 / 1024) * 10) / 10 }
    })
  )
  return list.sort((a, b) => b.date - a.date)
}

/** Zippe le monde (le serveur doit avoir enregistré ses fichiers avant : voir runner.backupServer) */
export async function writeBackup(id: string, kind: ServerBackupKind): Promise<string | null> {
  const folders = await worldFolders(id)
  if (folders.length === 0) return null
  const zip = new AdmZip()
  // session.lock est verrouillé par le serveur allumé (et inutile dans une sauvegarde)
  const filter = (name: string) => !name.endsWith('session.lock')
  for (const folder of folders) await zip.addLocalFolderPromise(join(serverDirOf(id), folder), { zipPath: folder, filter })
  await mkdir(backupDir(id), { recursive: true })
  const file = fileName(kind)
  await zip.writeZipPromise(join(backupDir(id), file))
  await prune(id)
  return file
}

/** Garde les plus récentes, selon le réglage du serveur (10 par défaut) */
async function prune(id: string): Promise<void> {
  const keep = Math.max(1, getServer(id).backupKeep ?? 10)
  for (const old of (await listBackups(id)).slice(keep)) await rm(join(backupDir(id), old.file), { force: true })
}

/** Remet un monde sauvegardé (serveur éteint) ; le monde actuel est d'abord sauvegardé, au cas où */
export async function restoreBackup(id: string, file: string): Promise<void> {
  if (file.includes('/') || file.includes('\\')) return
  const path = join(backupDir(id), file)
  if (!existsSync(path)) throw new Error(tm('err.serverBackupMissing'))
  await writeBackup(id, 'restore')
  for (const folder of await worldFolders(id)) await rm(join(serverDirOf(id), folder), { recursive: true, force: true })
  await new Promise<void>((resolve, reject) =>
    new AdmZip(path).extractAllToAsync(serverDirOf(id), true, false, (err) => (err ? reject(err) : resolve()))
  )
}

export async function deleteBackup(id: string, file: string): Promise<void> {
  if (file.includes('/') || file.includes('\\')) return
  await rm(join(backupDir(id), file), { force: true })
}

export async function openBackupFolder(id: string): Promise<void> {
  await mkdir(backupDir(id), { recursive: true })
  await shell.openPath(backupDir(id))
}
