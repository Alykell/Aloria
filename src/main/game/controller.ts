import { app, BrowserWindow, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setDiscordIdle, setDiscordPlaying, setDiscordServer } from '../discord'
import { watchGameLog } from './logWatcher'
import { addPending, removePending } from '../shared/pending'
import { getValidSession, listAccounts } from '../auth/accounts'
import { gameDirOf, getProfile, markPlayed } from '../profiles'
import { getSettings } from '../settings'
import { HUD_MIN_FABRIC_LOADER, hudEnabled, hudJvmArgs, olderThan, syncAloriaHud } from './aloriaHud'
import { syncFriends } from './friends'
import { syncDatapacks, watchDatapacks } from './datapacks'
import { installFabric } from './fabric'
import { installForge } from './forge'
import { installNeoForge } from './neoforge'
import type { InstallerStep } from './processors'
import { installVersion } from './install'
import { launchGame } from './launch'
import { autoLoginEnv } from '../quickplay'
import { supportsQuickPlay } from '../../shared/loaders'
import { getManifest, loadVersion, resolveVersionId } from './versions'
import { applyShared, collectShared } from '../shared/sync'
import { anyServerRunning } from '../server/runner'
import type { GameExit, GameStatus, JoinTarget, LaunchStep, VersionEntry } from '../../shared/types'
import { tm } from '../i18n'

const LOADER_NAMES = { vanilla: 'Minecraft', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' } as const

interface Running {
  profileId: string
  profile: string
  versionLabel: string
  child: ChildProcess
  /** « Arrêter » cliqué : pas de fenêtre de plantage à la fermeture, et un second clic force l'arrêt */
  stopping: boolean
  retry?: NodeJS.Timeout
}

/** Un seul lancement à la fois (mêmes bibliothèques, même Java), mais autant de parties ouvertes que de profils */
let launch: GameStatus['launch'] = null
const running = new Map<string, Running>()
/** Partie montrée dans le statut Discord : la dernière lancée */
let discordGame: Running | null = null
let target: WebContents | null = null

let lastLogged = ''

class LaunchCancelled extends Error {}

const statusOf = (): GameStatus => ({
  launch,
  running: [...running.values()].map((r) => ({ profileId: r.profileId, profile: r.profile, stopping: r.stopping }))
})

function sendStatus(): void {
  const status = statusOf()
  if (process.env.ALORIA_DEBUG) {
    // Journal console pour les tests (une ligne par étape, et tous les 10 % en téléchargement)
    const key =
      launch?.state === 'downloading' ? `dl ${Math.floor((launch.doneBytes / (launch.totalBytes || 1)) * 10)}` : JSON.stringify(status)
    if (key !== lastLogged) console.log('[game]', JSON.stringify(status))
    lastLogged = key
  }
  if (target && !target.isDestroyed()) target.send('game:status', status)
}

/** Étape suivante du lancement ; si « Annuler » a été cliqué, le lancement s'arrête ici */
function setStep(profileId: string, profile: string, step: LaunchStep): void {
  if (launch?.cancelling) throw new LaunchCancelled()
  launch = { ...step, profileId, profile }
  sendStatus()
}

export const getStatus = statusOf

export const isGameRunning = () => running.size > 0

/** Annule le lancement en cours : les fichiers en cours de téléchargement finissent, rien d'autre ne démarre */
export function cancelLaunch(): void {
  if (!launch || launch.cancelling || launch.state === 'launching') return
  launch = { ...launch, cancelling: true }
  sendStatus()
}

/**
 * Ferme une partie. Premier clic : fermeture normale (comme la croix de la fenêtre, le monde est sauvegardé) ;
 * second clic : arrêt forcé, pour un jeu figé.
 */
export function stopGame(profileId: string): void {
  const game = running.get(profileId)
  if (!game?.child.pid) return
  const force = game.stopping
  game.stopping = true
  sendStatus()
  const pid = game.child.pid
  const close = (force: boolean) => {
    if (process.platform === 'win32') {
      // Sans /F, taskkill envoie WM_CLOSE à la fenêtre du jeu ; /T emporte aussi les processus lancés par le jeu
      spawn('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true }).on('error', () => {})
    } else game.child.kill(force ? 'SIGKILL' : 'SIGTERM')
  }
  clearInterval(game.retry)
  close(force)
  // Pendant l'écran de chargement, le jeu ignore la demande : on la renvoie jusqu'à ce qu'il se ferme
  if (!force) game.retry = setInterval(() => close(false), 3000)
}

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
/**
 * Arguments pour arriver directement sur un serveur ou dans un monde : quickPlay depuis la 1.20 ; avant, --server pour
 * un serveur, et rien pour un monde (le jeu n'a pas d'option pour ça : le bouton Solo n'est pas proposé)
 */
function joinArgs(gameVersion: string, join: JoinTarget): string[] {
  const quickPlay = supportsQuickPlay(gameVersion)
  if ('world' in join) return quickPlay ? ['--quickPlaySingleplayer', join.world] : []
  return quickPlay ? ['--quickPlayMultiplayer', `${join.host}:${join.port}`] : ['--server', join.host, '--port', String(join.port)]
}

/** `join` : serveur ou monde à ouvrir dès l'ouverture du jeu (page Serveurs, boutons Solo / Multijoueur de l'accueil) */
export async function play(sender: WebContents, profileId: string, join?: JoinTarget): Promise<void> {
  if (launch) throw new Error(tm('err.alreadyLaunching', { profile: launch.profile }))
  if (running.has(profileId)) throw new Error(tm('err.alreadyRunning'))
  target = sender
  const profile = getProfile(profileId)
  const setStatus = (step: LaunchStep) => setStep(profile.id, profile.name, step)

  try {
    const settings = getSettings()
    const { active } = listAccounts()
    const testDemo = !app.isPackaged && process.env.ALORIA_TEST_DEMO === '1'
    if (!active && !testDemo) throw new Error(tm('err.loginToPlay'))

    setStatus({ state: 'preparing', label: tm('status.version') })
    const player = active
      ? await getValidSession(active)
      : { name: 'Player', uuid: '00000000000000000000000000000000', accessToken: '0', xuid: '0' }

    const gameVersion = await resolveVersionId(profile.versionId)
    let versionId = gameVersion
    if (profile.loader === 'fabric') {
      setStatus({ state: 'preparing', label: tm('status.fabric') })
      // Aloria HUD exige un Fabric Loader récent : un profil figé sur un ancien (modpack, import) prend le dernier stable
      const pinned = profile.loaderVersion
      const tooOld = pinned && hudEnabled(profile) && olderThan(pinned, HUD_MIN_FABRIC_LOADER)
      versionId = await installFabric(gameVersion, tooOld ? null : pinned)
    } else if (profile.loader === 'forge' || profile.loader === 'neoforge') {
      // Première fois en Forge récent / NeoForge : téléchargements puis « processors » (jeu patché), une minute environ
      const name = LOADER_NAMES[profile.loader]
      const onStep = (s: InstallerStep) => {
        if (s.step === 'download') {
          setStatus({ state: 'downloading', doneFiles: s.doneFiles, totalFiles: s.totalFiles, doneBytes: s.doneBytes, totalBytes: s.totalBytes })
        } else if (s.step === 'processors') {
          setStatus({ state: 'preparing', label: tm('status.loaderProcessors', { loader: name, done: Math.min(s.done + 1, s.total), total: s.total }) })
        } else setStatus({ state: 'preparing', label: tm('status.loader', { loader: name }) })
      }
      onStep({ step: 'prepare' })
      versionId =
        profile.loader === 'forge'
          ? await installForge(gameVersion, profile.loaderVersion, onStep)
          : await installNeoForge(gameVersion, profile.loaderVersion, onStep)
    }
    const version = await loadVersion(versionId)
    const gameDir = gameDirOf(profile.id)
    markPlayed(profile.id)

    // Aussi en Forge : le jar Fabric d'Aloria HUD est retiré d'un profil passé de Fabric à Forge
    if (profile.loader !== 'vanilla') {
      setStatus({ state: 'preparing', label: tm('status.hud') })
      const warning = await syncAloriaHud(profile, gameVersion, gameDir)
      if (warning) console.warn('[aloria-hud]', warning)
      // Jouer avec des amis (e4mc) : sans internet ou sans version pour ce jeu, on joue quand même
      setStatus({ state: 'preparing', label: tm('status.friends') })
      await syncFriends(profile, gameVersion).catch((e) => console.warn('[e4mc]', e))
    }

    const installed = await installVersion(version, gameDir, (step) => {
      if (step.step === 'check') setStatus({ state: 'preparing', label: tm('status.check') })
      else if (step.step === 'extract') setStatus({ state: 'preparing', label: tm('status.extract') })
      else setStatus({ state: 'downloading', doneFiles: step.doneFiles, totalFiles: step.totalFiles, doneBytes: step.doneBytes, totalBytes: step.totalBytes })
    })

    // Liste de serveurs commune et jeu de réglages du profil (convertis pour les anciennes versions)
    setStatus({ state: 'preparing', label: tm('status.settings') })
    const sync = await applyShared(profile, gameVersion, gameDir, installed.classpath[installed.classpath.length - 1])
    // Datapacks de la Bibliothèque : dans tous les mondes du profil
    await syncDatapacks(gameDir).catch((e) => console.warn('[datapacks]', e))

    setStatus({ state: 'launching' })
    const { child, logFile } = await launchGame({
      installed,
      gameDir,
      ramMb: profile.ramMb ?? settings.ramMb,
      player,
      demo: !active,
      launcherVersion: app.getVersion(),
      // Réglages du HUD communs à tous les profils, puis arguments de test en développement
      // (ex. ALORIA_EXTRA_GAME_ARGS="--quickPlaySingleplayer Demo_World")
      extraJvmArgs: [...(await hudJvmArgs(profile)), ...(app.isPackaged ? [] : splitArgs(process.env.ALORIA_EXTRA_JVM_ARGS))],
      // Connexion automatique (/login) : mots de passe pour Aloria HUD, jamais écrits sur le disque
      // (en développement, ALORIA_TEST_AUTOLOGIN remplace la liste enregistrée : test du serveur local)
      env: hudEnabled(profile) ? { ALORIA_AUTOLOGIN: (!app.isPackaged && process.env.ALORIA_TEST_AUTOLOGIN) || autoLoginEnv() || '' } : {},
      extraGameArgs: [
        ...(join ? joinArgs(gameVersion, join) : []),
        ...(app.isPackaged ? [] : splitArgs(process.env.ALORIA_EXTRA_GAME_ARGS))
      ]
    })

    let stopWatching = () => {}
    const game: Running = {
      profileId: profile.id,
      profile: profile.name,
      versionLabel: `${LOADER_NAMES[profile.loader]} ${gameVersion}`,
      child,
      stopping: false
    }
    child.once('spawn', () => {
      launch = null
      running.set(profile.id, game)
      sendStatus()
      // Réglages à récupérer à la fermeture du jeu, même si le launcher est fermé entre-temps
      if (child.pid) addPending({ pid: child.pid, gameVersion, gameDir, session: sync })
      discordGame = game
      setDiscordPlaying(game.profile, game.versionLabel)
      const stopLog = watchGameLog(logFile, (server) => discordGame === game && setDiscordServer(server))
      const stopDatapacks = watchDatapacks(gameDir)
      stopWatching = () => {
        stopLog()
        stopDatapacks()
      }

      const win = BrowserWindow.fromWebContents(sender)
      if (settings.afterLaunch === 'minimize') win?.minimize()
      // « Se fermer » : la fenêtre disparaît mais le launcher reste en arrière-plan pour le statut
      // Discord et la récupération des réglages, puis quitte quand le jeu se ferme
      if (settings.afterLaunch === 'close') setTimeout(() => win?.hide(), 2000)
    })
    child.once('error', (err) => {
      if (launch?.profileId === profile.id) launch = null
      running.delete(profile.id)
      sendStatus()
      sendExit({ profileId: profile.id, code: null, crashLog: tm('err.javaStart', { message: err.message }) })
    })
    child.once('exit', async (code) => {
      clearInterval(game.retry)
      running.delete(profile.id)
      sendStatus()
      stopWatching()
      // Statut Discord : la partie précédente encore ouverte, sinon rien
      if (discordGame === game) {
        discordGame = [...running.values()].pop() ?? null
        if (discordGame) setDiscordPlaying(discordGame.profile, discordGame.versionLabel)
        else setDiscordIdle()
      }
      await collectShared(sync, gameVersion, gameDir).catch((err) => console.warn('[réglages partagés]', err))
      if (child.pid) removePending(child.pid)
      const win = BrowserWindow.fromWebContents(sender)
      // Fenêtre cachée (« Se fermer » après le lancement) : le launcher quitte avec la dernière partie
      if (win && !win.isVisible() && !win.isMinimized()) {
        if (running.size === 0 && !launch && !anyServerRunning()) app.quit()
        return
      }
      if (win?.isMinimized() && running.size === 0) win.restore()
      // Fermée par « Arrêter » : pas de fenêtre de plantage
      if (game.stopping) return
      sendExit({ profileId: profile.id, code, crashLog: code === 0 ? null : await logTail(logFile) })
    })
  } catch (err) {
    launch = null
    sendStatus()
    if (err instanceof LaunchCancelled) return
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
