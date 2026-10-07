import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Mise à jour « légère » : quand la version d'Electron ne change pas, seuls le code du launcher (app.asar) et les
 * jars du mod changent. On les télécharge et on les remplace soi-même au redémarrage, sans lancer l'installeur :
 * Windows (contrôle intelligent des applications) bloque les installeurs non signés, pas ces fichiers.
 * Fichiers préparés par scripts/light-update.mjs dans chaque release.
 */

const RELEASES = 'https://github.com/Alykell/Aloria/releases'

interface LightFile {
  asset: string
  path: string
  size: number
  sha512: string
}

interface LightManifest {
  version: string
  electron: string
  files: LightFile[]
}

const stagingRoot = () => join(app.getPath('userData'), 'light-update')

/** 0.1.10 > 0.1.9 */
function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Cherche une mise à jour légère et la télécharge. Renvoie null s'il n'y en a pas, ou si elle ne convient pas
 * (Electron différent, ancienne release sans fichiers légers) : l'installeur complet prend alors le relais.
 */
export async function downloadLightUpdate(onProgress: (version: string, percent: number) => void): Promise<string | null> {
  let manifest: LightManifest
  try {
    manifest = JSON.parse((await download(`${RELEASES}/latest/download/aloria-light.json`)).toString('utf8')) as LightManifest
  } catch {
    return null
  }
  if (!isNewer(manifest.version, app.getVersion()) || manifest.electron !== process.versions.electron) return null

  const dir = join(stagingRoot(), manifest.version)
  // Déjà téléchargée lors d'un démarrage précédent
  if (existsSync(join(dir, 'manifest.json'))) return manifest.version

  await rm(stagingRoot(), { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const total = manifest.files.reduce((sum, f) => sum + f.size, 0)
  let done = 0
  for (const file of manifest.files) {
    const data = await download(`${RELEASES}/download/v${manifest.version}/${file.asset}`)
    if (createHash('sha512').update(data).digest('base64') !== file.sha512) throw new Error(`Fichier abîmé : ${file.asset}`)
    await writeFile(join(dir, file.asset), data)
    done += file.size
    onProgress(manifest.version, (done / total) * 100)
  }
  // Écrit en dernier : sa présence signifie que tout est téléchargé et vérifié
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  return manifest.version
}

/**
 * Script lancé par Aloria.exe en mode Node (ELECTRON_RUN_AS_NODE) : un programme déjà autorisé par Windows.
 * Il attend la fermeture du launcher, copie les fichiers à leur place, retire les anciens jars, puis relance si demandé.
 */
const APPLY_SCRIPT = String.raw`
process.noAsar = true
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const [, , pid, resources, staging, relaunch, exe] = process.argv
const logFile = path.join(staging, '..', 'apply.log')
const log = (m) => fs.appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = (p) => { try { process.kill(Number(p), 0); return true } catch (e) { return e.code === 'EPERM' } }

;(async () => {
  for (let i = 0; i < 600 && alive(pid); i++) await sleep(100)
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'manifest.json'), 'utf8'))
  for (const f of manifest.files) {
    const dst = path.join(resources, f.path)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    // Le fichier peut rester verrouillé un instant après la fermeture
    for (let t = 0; ; t++) {
      try { fs.copyFileSync(path.join(staging, f.asset), dst); break } catch (e) { if (t > 50) throw e; await sleep(200) }
    }
  }
  const kept = new Set(manifest.files.map((f) => path.basename(f.path)))
  const mods = path.join(resources, 'mods')
  for (const jar of fs.readdirSync(mods)) if (jar.endsWith('.jar') && !kept.has(jar)) fs.rmSync(path.join(mods, jar), { force: true })
  fs.rmSync(staging, { recursive: true, force: true })
  log('mise à jour ' + manifest.version + ' installée')
  if (relaunch === '1') {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    spawn(exe, [], { detached: true, stdio: 'ignore', env }).unref()
  }
})().catch((e) => log('échec : ' + (e && e.stack)))
`

let applying = false

/**
 * Lance la mise en place de la mise à jour légère téléchargée ; elle se fait dès que le launcher est fermé.
 * Synchrone : appelée aussi pendant la fermeture, quand il n'est plus temps d'attendre.
 */
export function applyLightUpdate(version: string, relaunch: boolean): void {
  if (applying) return
  applying = true
  const script = join(stagingRoot(), 'apply.js')
  writeFileSync(script, APPLY_SCRIPT)
  const child = spawn(
    process.execPath,
    [script, String(process.pid), process.resourcesPath, join(stagingRoot(), version), relaunch ? '1' : '0', process.execPath],
    { detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  )
  child.unref()
}
