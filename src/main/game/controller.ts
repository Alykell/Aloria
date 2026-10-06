import { app, BrowserWindow, type WebContents } from 'electron'
import { readFile } from 'node:fs/promises'
import { setDiscordIdle, setDiscordPlaying, setDiscordServer } from '../discord'
import { watchGameLog } from './logWatcher'
import { addPending, removePending } from '../shared/pending'
import { getValidSession, listAccounts } from '../auth/accounts'
import { gameDirOf, getProfile, markPlayed } from '../profiles'
import { getSettings } from '../settings'
import { syncAloriaHud } from './aloriaHud'
import { installFabric } from './fabric'
import { installVersion } from './install'
import { launchGame } from './launch'
import { getManifest, loadVersion, resolveVersionId } from './versions'
import { applyShared, collectShared } from '../shared/sync'
import type { GameExit, GameStatus, VersionEntry } from '../../shared/types'

let status: GameStatus = { state: 'idle' }
let target: WebContents | null = null

let lastLogged = ''

function setStatus(next: GameStatus): void {
  status = next
  if (process.env.ALORIA_DEBUG) {
    // Journal console pour les tests (une ligne par étape, et tous les 10 % en téléchargement)
    const key = next.state === 'downloading' ? `dl ${Math.floor((next.doneBytes / (next.totalBytes || 1)) * 10)}` : JSON.stringify(next)
    if (key !== lastLogged) console.log('[game]', JSON.stringify(next))
    lastLogged = key
  }
  if (target && !target.isDestroyed()) target.send('game:status', status)
}

export const getStatus = () => status

export const isGameRunning = () => status.state === 'running'

const splitArgs = (value: string | undefined) => (value ?? '').split(' ').filter(Boolean)

export async function listVersions(includeSnapshots: boolean): Promise<VersionEntry[]> {
  const manifest = await getManifest()
  return manifest.versions
    .filter((v) => v.type === 'release' || (includeSnapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type as VersionEntry['type'] }))
}

/**
 * Installe puis lance un profil.
 * Il faut un compte Microsoft qui possède Minecraft. Seule exception : les tests automatiques en
 * développement (ALORIA_TEST_DEMO=1) lancent la démo officielle, sans compte.
 */
export async function play(sender: WebContents, profileId: string): Promise<void> {
  if (status.state !== 'idle') throw new Error('Le jeu est déjà en cours de lancement.')
  target = sender

  try {
    const settings = getSettings()
    const profile = getProfile(profileId)
    const { active } = listAccounts()
    const testDemo = !app.isPackaged && process.env.ALORIA_TEST_DEMO === '1'
    if (!active && !testDemo) throw new Error('Connecte-toi avec ton compte Microsoft pour jouer.')

    setStatus({ state: 'preparing', label: 'Préparation de la version…' })
    const player = active
      ? await getValidSession(active)
      : { name: 'Player', uuid: '00000000000000000000000000000000', accessToken: '0', xuid: '0' }

    const gameVersion = await resolveVersionId(profile.versionId)
    let versionId = gameVersion
    if (profile.loader === 'fabric') {
      setStatus({ state: 'preparing', label: 'Installation de Fabric…' })
      versionId = await installFabric(gameVersion, profile.loaderVersion)
    }
    const version = await loadVersion(versionId)
    const gameDir = gameDirOf(profile.id)
    markPlayed(profile.id)

    if (profile.loader === 'fabric') {
      setStatus({ state: 'preparing', label: 'Préparation d’Aloria HUD…' })
      const warning = await syncAloriaHud(profile, gameVersion, gameDir)
      if (warning) console.warn('[aloria-hud]', warning)
    }

    const installed = await installVersion(version, gameDir, (step) => {
      if (step.step === 'check') setStatus({ state: 'preparing', label: 'Vérification des fichiers…' })
      else if (step.step === 'extract') setStatus({ state: 'preparing', label: 'Finalisation…' })
      else setStatus({ state: 'downloading', doneFiles: step.doneFiles, totalFiles: step.totalFiles, doneBytes: step.doneBytes, totalBytes: step.totalBytes })
    })

    // Liste de serveurs commune et jeu de réglages du profil (convertis pour les anciennes versions)
    setStatus({ state: 'preparing', label: 'Application de tes réglages…' })
    const sync = await applyShared(profile, gameVersion, gameDir, installed.classpath[installed.classpath.length - 1])

    setStatus({ state: 'launching' })
    const { child, logFile } = await launchGame({
      installed,
      gameDir,
      ramMb: profile.ramMb ?? settings.ramMb,
      player,
      demo: !active,
      launcherVersion: app.getVersion(),
      // Tests en développement, ex. ALORIA_EXTRA_GAME_ARGS="--quickPlaySingleplayer Demo_World"
      extraJvmArgs: app.isPackaged ? [] : splitArgs(process.env.ALORIA_EXTRA_JVM_ARGS),
      extraGameArgs: app.isPackaged ? [] : splitArgs(process.env.ALORIA_EXTRA_GAME_ARGS)
    })

    let stopWatching = () => {}
    const versionLabel = profile.loader === 'fabric' ? `Fabric ${gameVersion}` : `Minecraft ${gameVersion}`
    child.once('spawn', () => {
      setStatus({ state: 'running', profile: profile.name })
      // Réglages à récupérer à la fermeture du jeu, même si le launcher est fermé entre-temps
      if (child.pid) addPending({ pid: child.pid, gameVersion, gameDir, session: sync })
      setDiscordPlaying(profile.name, versionLabel)
      stopWatching = watchGameLog(logFile, setDiscordServer)

      const win = BrowserWindow.fromWebContents(sender)
      if (settings.afterLaunch === 'minimize') win?.minimize()
      // « Se fermer » : la fenêtre disparaît mais le launcher reste en arrière-plan pour le statut
      // Discord et la récupération des réglages, puis quitte quand le jeu se ferme
      if (settings.afterLaunch === 'close') setTimeout(() => win?.hide(), 2000)
    })
    child.once('error', (err) => {
      setStatus({ state: 'idle' })
      sendExit({ code: null, crashLog: `Impossible de démarrer Java : ${err.message}` })
    })
    child.once('exit', async (code) => {
      setStatus({ state: 'idle' })
      setDiscordIdle()
      stopWatching()
      await collectShared(sync, gameVersion, gameDir).catch((err) => console.warn('[réglages partagés]', err))
      if (child.pid) removePending(child.pid)
      const win = BrowserWindow.fromWebContents(sender)
      if (win && !win.isVisible()) {
        app.quit()
        return
      }
      if (win?.isMinimized()) win.restore()
      sendExit({ code, crashLog: code === 0 ? null : await logTail(logFile) })
    })
  } catch (err) {
    setStatus({ state: 'idle' })
    throw err
  }
}

/** Dernières lignes du journal du jeu, affichées en cas de crash */
async function logTail(logFile: string): Promise<string> {
  try {
    return (await readFile(logFile, 'utf8')).split(/\r?\n/).filter(Boolean).slice(-60).join('\n')
  } catch {
    return ''
  }
}

function sendExit(exit: GameExit): void {
  if (process.env.ALORIA_DEBUG) console.log('[game] exit', JSON.stringify(exit))
  if (target && !target.isDestroyed()) target.send('game:exit', exit)
}
