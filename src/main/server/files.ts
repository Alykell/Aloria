import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import AdmZip from 'adm-zip'
import { serverDirOf } from './store'
import type { ServerFile } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Onglet Fichiers : parcourir et modifier le dossier d'un serveur depuis le launcher. Chaque chemin reçu de l'interface
 * est relatif au dossier du serveur et ne peut pas en sortir (« ../ » refusé).
 */

/** Fichiers ouverts dans l'éditeur au plus (au-delà, c'est rarement du texte à modifier à la main) */
const MAX_EDIT_BYTES = 4 * 1024 * 1024

function inside(id: string, rel: string): string {
  const base = resolve(serverDirOf(id))
  const full = resolve(base, rel || '.')
  if (full !== base && !full.startsWith(base + sep)) throw new Error(tm('err.serverFileOutside'))
  return full
}

/** Nom de fichier ou de dossier valable sous Windows comme sous Linux */
function checkName(name: string): string {
  const clean = name.trim()
  if (!clean || /[<>:"/\\|?*\u0000-\u001f]/.test(clean) || clean === '.' || clean === '..') throw new Error(tm('err.serverFileName'))
  return clean
}

export async function listFiles(id: string, rel: string): Promise<ServerFile[]> {
  const dir = inside(id, rel)
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (e) => {
      const st = await stat(join(dir, e.name)).catch(() => null)
      return { name: e.name, dir: e.isDirectory(), size: e.isDirectory() ? 0 : (st?.size ?? 0), modified: st?.mtimeMs ?? 0 }
    })
  )
  return files.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export async function readTextFile(id: string, rel: string): Promise<string> {
  const file = inside(id, rel)
  if ((await stat(file)).size > MAX_EDIT_BYTES) throw new Error(tm('err.serverFileTooBig'))
  const data = await readFile(file)
  // Un octet nul : fichier binaire (monde, image, jar…), pas modifiable comme du texte
  if (data.subarray(0, 8000).includes(0)) throw new Error(tm('err.serverFileBinary'))
  return data.toString('utf8')
}

export const writeTextFile = (id: string, rel: string, text: string) => writeFile(inside(id, rel), text, 'utf8')

export async function createEntry(id: string, rel: string, name: string, folder: boolean): Promise<void> {
  const target = join(inside(id, rel), checkName(name))
  if (existsSync(target)) throw new Error(tm('err.serverFileExists'))
  if (folder) await mkdir(target)
  else await writeFile(target, '')
}

export async function renameEntry(id: string, rel: string, name: string): Promise<void> {
  const from = inside(id, rel)
  const to = join(dirname(from), checkName(name))
  if (existsSync(to)) throw new Error(tm('err.serverFileExists'))
  await rename(from, to)
}

export async function deleteEntries(id: string, rels: string[]): Promise<void> {
  for (const rel of rels) {
    const full = inside(id, rel)
    if (full === resolve(serverDirOf(id))) continue
    await rm(full, { recursive: true, force: true })
  }
}

/** Zippe les éléments choisis dans une archive du même dossier */
export async function zipEntries(id: string, rels: string[], name: string): Promise<void> {
  if (rels.length === 0) return
  const zip = new AdmZip()
  for (const rel of rels) {
    const full = inside(id, rel)
    if ((await stat(full)).isDirectory()) await zip.addLocalFolderPromise(full, { zipPath: basename(full) })
    else zip.addLocalFile(full)
  }
  const archive = checkName(name.endsWith('.zip') ? name : `${name}.zip`)
  await zip.writeZipPromise(join(dirname(inside(id, rels[0])), archive))
}

/** Dézippe une archive dans un dossier du même nom */
export async function unzipEntry(id: string, rel: string): Promise<void> {
  const file = inside(id, rel)
  const target = file.replace(/\.zip$/i, '')
  const zip = new AdmZip(file)
  // Chaque élément doit rester dans le dossier cible (archive piégée avec des « ../ »)
  for (const entry of zip.getEntries()) {
    const out = resolve(target, entry.entryName)
    if (out !== target && !out.startsWith(target + sep)) throw new Error(tm('err.serverFileOutside'))
  }
  await mkdir(target, { recursive: true })
  await new Promise<void>((ok, ko) => zip.extractAllToAsync(target, true, false, (err) => (err ? ko(err) : ok())))
}

/** Envoie des fichiers du PC dans le dossier ouvert (fenêtre de choix) ; renvoie le nombre de fichiers copiés */
export async function uploadFiles(win: BrowserWindow | null, id: string, rel: string): Promise<number> {
  const dir = inside(id, rel)
  const options = {
    title: tm('server.files.uploadTitle'),
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[]
  }
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (res.canceled) return 0
  for (const file of res.filePaths) await copyFile(file, join(dir, basename(file)))
  return res.filePaths.length
}

/** Enregistre une copie d'un fichier du serveur sur le PC (fenêtre « Enregistrer sous ») */
export async function downloadFile(win: BrowserWindow | null, id: string, rel: string): Promise<boolean> {
  const file = inside(id, rel)
  const options = { title: tm('server.files.downloadTitle'), defaultPath: basename(file) }
  const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (res.canceled || !res.filePath) return false
  await copyFile(file, res.filePath)
  return true
}

/** Raccourcis : fichiers de réglages présents dans ce serveur */
export function quickFiles(id: string): string[] {
  const candidates = [
    'server.properties',
    'bukkit.yml',
    'spigot.yml',
    join('config', 'paper-global.yml'),
    join('config', 'paper-world-defaults.yml'),
    'ops.json',
    'whitelist.json'
  ]
  const base = serverDirOf(id)
  return candidates.filter((f) => existsSync(join(base, f))).map((f) => relative(base, join(base, f)).replace(/\\/g, '/'))
}
