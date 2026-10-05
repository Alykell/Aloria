import { app, type WebContents } from 'electron'
import { join } from 'node:path'
import { getValidSession, listAccounts } from '../auth/accounts'
import { getSettings } from '../settings'
import { installVersion } from './install'
import { launchGame } from './launch'
import { paths } from './paths'
import { getManifest, loadVersion, resolveVersionId } from './versions'
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

export async function listVersions(includeSnapshots: boolean): Promise<VersionEntry[]> {
  const manifest = await getManifest()
  return manifest.versions
    .filter((v) => v.type === 'release' || (includeSnapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type as VersionEntry['type'] }))
}

/**
 * Installe puis lance la version choisie dans les paramètres.
 * Sans compte, uniquement en développement : lancement en mode démo officiel pour tester.
 */
export async function play(sender: WebContents): Promise<void> {
  if (status.state !== 'idle') throw new Error('Le jeu est déjà en cours de lancement.')
  target = sender

  try {
    const settings = getSettings()
    const { active } = listAccounts()
    if (!active && app.isPackaged) throw new Error('Connecte-toi avec ton compte Microsoft pour jouer.')

    setStatus({ state: 'preparing', label: 'Préparation de la version…' })
    const player = active
      ? await getValidSession(active)
      : { name: 'Player', uuid: '00000000000000000000000000000000', accessToken: '0', xuid: '0' }

    const versionId = await resolveVersionId(settings.versionId)
    const version = await loadVersion(versionId)
    const gameDir = join(paths.instances, 'default')

    const installed = await installVersion(version, gameDir, (step) => {
      if (step.step === 'check') setStatus({ state: 'preparing', label: 'Vérification des fichiers…' })
      else if (step.step === 'extract') setStatus({ state: 'preparing', label: 'Finalisation…' })
      else setStatus({ state: 'downloading', doneFiles: step.doneFiles, totalFiles: step.totalFiles, doneBytes: step.doneBytes, totalBytes: step.totalBytes })
    })

    setStatus({ state: 'launching' })
    const child = await launchGame({
      installed,
      gameDir,
      ramMb: settings.ramMb,
      player,
      demo: !active,
      launcherVersion: app.getVersion()
    })

    // On garde la fin de la sortie du jeu pour l'afficher en cas de crash
    const tail: string[] = []
    const collect = (chunk: Buffer) => {
      tail.push(...chunk.toString().split(/\r?\n/).filter(Boolean))
      if (tail.length > 60) tail.splice(0, tail.length - 60)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)

    child.once('spawn', () => setStatus({ state: 'running', version: versionId }))
    child.once('error', (err) => {
      setStatus({ state: 'idle' })
      sendExit({ code: null, crashLog: `Impossible de démarrer Java : ${err.message}` })
    })
    child.once('exit', (code) => {
      setStatus({ state: 'idle' })
      sendExit({ code, crashLog: code === 0 ? null : tail.join('\n') })
    })
  } catch (err) {
    setStatus({ state: 'idle' })
    throw err
  }
}

function sendExit(exit: GameExit): void {
  if (process.env.ALORIA_DEBUG) console.log('[game] exit', JSON.stringify(exit))
  if (target && !target.isDestroyed()) target.send('game:exit', exit)
}
