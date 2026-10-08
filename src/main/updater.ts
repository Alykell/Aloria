import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { applyLightUpdate, downloadLightUpdate } from './lightUpdate'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }
let window: BrowserWindow | null = null
/** Version de la mise à jour légère prête à être mise en place, ou null (installeur complet) */
let lightReady: string | null = null

function setStatus(next: UpdateStatus): void {
  status = next
  if (window && !window.isDestroyed()) window.webContents.send('updater:status', status)
}

export const getUpdateStatus = () => status

/**
 * Cherche une mise à jour : d'abord la mise à jour légère (code du launcher + mod, mise en place par le launcher
 * lui-même), sinon l'installeur complet d'electron-updater (quand Electron change). Téléchargement en arrière-plan,
 * installation à la fermeture du launcher ou avec le bouton « Redémarrer ». Désactivé en développement.
 */
async function checkForUpdates(): Promise<void> {
  if (status.state === 'downloading' || status.state === 'ready') return
  let result: string
  try {
    result = await downloadLightUpdate((v, percent) => setStatus({ state: 'downloading', version: v, percent }))
  } catch (err) {
    // Réseau, fichier abîmé… : on réessaiera au prochain contrôle. Surtout pas l'installeur complet à la place :
    // Windows peut le bloquer, et deux installeurs lancés à la suite se gênent (« échec de désinstallation »)
    console.warn('[mise à jour légère]', err)
    setStatus({ state: 'idle' })
    return
  }
  if (result === 'none') return setStatus({ state: 'idle' })
  if (result !== 'full') {
    lightReady = result
    setStatus({ state: 'ready', version: result })
    return
  }
  // Electron a changé : seul l'installeur complet convient
  autoUpdater.checkForUpdates().catch(() => setStatus({ state: 'idle' }))
}

export function initUpdater(win: BrowserWindow): void {
  window = win
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'idle' }))
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') setStatus({ ...status, percent: p.percent })
  })
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }))
  // Pas de connexion, GitHub indisponible… : on réessaiera au prochain démarrage
  autoUpdater.on('error', () => setStatus({ state: 'idle' }))

  // Fermeture du launcher avec une mise à jour légère prête : elle se met en place juste après
  app.on('will-quit', () => {
    if (lightReady) applyLightUpdate(lightReady, false)
  })

  checkForUpdates()
  // Puis toutes les 4 heures pour ceux qui laissent le launcher ouvert
  setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000)
}

export function installUpdate(): void {
  if (status.state !== 'ready') return
  if (lightReady) {
    applyLightUpdate(lightReady, true)
    lightReady = null
    app.quit()
  } else {
    autoUpdater.quitAndInstall()
  }
}
