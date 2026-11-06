import { BrowserWindow, shell, type WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { paths } from '../game/paths'
import { getSettings } from '../settings'
import { setDiscordIdle, setDiscordPlaying } from '../discord'
import { isGameRunning } from '../game/controller'
import { backupAfterPlay, waitForBackup } from '../worldBackups'
import { BEDROCK_ID } from './worlds'
import type { BedrockInfo, BedrockStatus } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Minecraft Bedrock (Microsoft Store) : le jeu s'ouvre par le lien « minecraft: », puis on suit son processus
 * pour le temps de jeu, le statut Discord et les sauvegardes des mondes à la fermeture.
 */
const run = promisify(execFile)
const PROCESS = 'Minecraft.Windows.exe'
const PACKAGE = 'Microsoft.MinecraftUWP'
const storeFile = join(paths.root, 'bedrock', 'bedrock.json')

interface Store {
  playTimeMs: number
  lastPlayed: number | null
}

function readStore(): Store {
  try {
    return {
      playTimeMs: 0,
      lastPlayed: null,
      ...JSON.parse(readFileSync(storeFile, 'utf8'))
    }
  } catch {
    return { playTimeMs: 0, lastPlayed: null }
  }
}

function patchStore(patch: (s: Store) => Partial<Store>): void {
  const s = readStore()
  mkdirSync(dirname(storeFile), { recursive: true })
  writeFileSync(storeFile, JSON.stringify({ ...s, ...patch(s) }, null, 2))
}

/** Version installée (« 1.26.6005.0 » du Store → « 26.60 »), null si Bedrock n'est pas là ; gardée une fois trouvée */
let version: string | null | undefined
async function installedVersion(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  if (version) return version
  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-AppxPackage -Name ${PACKAGE}).Version`],
      {
        windowsHide: true
      }
    )
    const [major, minor, build] = stdout.trim().split('.')
    const patch = Math.floor(Number(build) / 100)
    // Depuis 2026, Bedrock se numérote comme Java (« 26.60 ») ; le Store garde l'ancien « 1. » devant
    version = !major || !minor || !build ? null : Number(minor) >= 26 ? `${minor}.${patch}` : `${major}.${minor}.${patch}`
  } catch {
    version = null
  }
  return version
}

export async function bedrockInfo(): Promise<BedrockInfo> {
  const v = await installedVersion()
  const s = readStore()
  return {
    installed: !!v,
    version: v,
    playTimeMs: s.playTimeMs,
    lastPlayed: s.lastPlayed
  }
}

async function processRunning(): Promise<boolean> {
  try {
    const { stdout } = await run('tasklist', ['/FI', `IMAGENAME eq ${PROCESS}`, '/FO', 'CSV', '/NH'], { windowsHide: true })
    return stdout.includes(PROCESS)
  } catch {
    return false
  }
}

let status: BedrockStatus = { launching: false, running: false }
let target: WebContents | null = null
let watch: NodeJS.Timeout | null = null

export const bedrockStatus = () => status
export const isBedrockRunning = () => status.running || status.launching

function setStatus(next: BedrockStatus): void {
  status = next
  if (process.env.ALORIA_DEBUG) console.log('[bedrock]', JSON.stringify(status))
  if (target && !target.isDestroyed()) target.send('bedrock:status', status)
}

/** Le jeu met quelques secondes à apparaître ; au-delà, on considère que l'ouverture a échoué (ou a été annulée) */
const START_TIMEOUT = 90_000

export async function playBedrock(sender: WebContents): Promise<void> {
  if (isBedrockRunning()) throw new Error(tm('err.alreadyRunning'))
  const v = await installedVersion()
  if (!v) throw new Error(tm('err.bedrockMissing'))
  target = sender
  setStatus({ launching: true, running: false })
  // Mondes encore en cours de sauvegarde depuis la partie précédente
  await waitForBackup(BEDROCK_ID)
  // Déjà ouvert hors du launcher : on le suit simplement
  if (!(await processRunning())) await shell.openExternal('minecraft:')
  patchStore(() => ({ lastPlayed: Date.now() }))

  const askedAt = Date.now()
  let countedUntil = 0
  let lastMinute = 0
  watch = setInterval(async () => {
    const alive = await processRunning()
    const now = Date.now()
    if (!status.running) {
      if (alive) {
        countedUntil = lastMinute = now
        setStatus({ launching: false, running: true })
        setDiscordPlaying('Minecraft Bedrock', `Bedrock ${v}`)
        if (getSettings().afterLaunch !== 'keep') BrowserWindow.fromWebContents(sender)?.minimize()
      } else if (now - askedAt > START_TIMEOUT) stop(false)
      return
    }
    // Temps de jeu enregistré chaque minute (rien de perdu si le launcher est coupé), le reste à la fermeture
    if (!alive || now - lastMinute >= 60_000) {
      patchStore((s) => ({ playTimeMs: s.playTimeMs + (now - countedUntil) }))
      countedUntil = lastMinute = now
    }
    if (!alive) stop(true)
  }, 3000)

  function stop(played: boolean): void {
    if (watch) clearInterval(watch)
    watch = null
    setStatus({ launching: false, running: false })
    if (!played) return
    if (!isGameRunning()) setDiscordIdle()
    // Mondes joués : sauvegardés en arrière-plan, comme pour un profil Java
    backupAfterPlay(BEDROCK_ID)
    const win = BrowserWindow.fromWebContents(sender)
    if (win?.isMinimized()) win.restore()
  }
}

/** Pour les mondes : le jeu doit être fermé avant d'en restaurer ou d'en supprimer un */
export const bedrockAlive = processRunning
