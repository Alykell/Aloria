import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }
let window: BrowserWindow | null = null

function setStatus(next: UpdateStatus): void {
  status = next
  if (window && !window.isDestroyed()) window.webContents.send('updater:status', status)
}

export const getUpdateStatus = () => status

/**
 * Vérifie les nouvelles versions publiées sur GitHub (Releases), les télécharge en arrière-plan
 * et les installe à la fermeture du launcher. Désactivé en développement.
 */
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

  autoUpdater.checkForUpdates().catch(() => setStatus({ state: 'idle' }))
  // Puis toutes les 4 heures pour ceux qui laissent le launcher ouvert
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}
