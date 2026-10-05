import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { addAccount, listAccounts, removeAccount, selectAccount } from './auth/accounts'
import { toAuthError } from './auth/errors'
import { getStatus, listVersions, play } from './game/controller'
import { fabricLoaders } from './game/fabric'
import { installContent, listInstalled, openContentFolder, removeContent, searchContent, setContentEnabled } from './modrinth/content'
import { createProfile, deleteProfile, listProfiles, openProfileFolder, selectProfile, updateProfile } from './profiles'
import { getSettings, systemRamMb, updateSettings } from './settings'
import { getUpdateStatus, initUpdater, installUpdate } from './updater'
import type {
  ContentType,
  LoaderVersion,
  Profile,
  ProfileInput,
  PublicAccount,
  Result,
  SearchQuery,
  Settings,
  VersionEntry
} from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#e8f6fb',
    show: false,
    title: 'Aloria',
    // Une fois installé, l'icône est intégrée à l'exécutable
    icon: app.isPackaged ? undefined : join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Les liens externes s'ouvrent dans le navigateur, jamais dans le launcher
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('updater:status', () => getUpdateStatus())
ipcMain.on('updater:install', () => installUpdate())

ipcMain.handle('accounts:list', () => listAccounts())
ipcMain.handle('accounts:add', async (e): Promise<Result<PublicAccount>> => {
  try {
    return { ok: true, value: await addAccount(BrowserWindow.fromWebContents(e.sender)) }
  } catch (err) {
    const { code, message } = toAuthError(err)
    return { ok: false, code, error: message }
  }
})
ipcMain.handle('accounts:select', (_e, uuid: string) => selectAccount(uuid))
ipcMain.handle('accounts:remove', (_e, uuid: string) => removeAccount(uuid))

ipcMain.handle('settings:get', () => ({ settings: getSettings(), systemRamMb: systemRamMb() }))
ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => updateSettings(patch))
ipcMain.handle('game:versions', async (_e, snapshots: boolean): Promise<Result<VersionEntry[]>> => {
  try {
    return { ok: true, value: await listVersions(snapshots) }
  } catch (err) {
    return { ok: false, code: 'network', error: err instanceof Error ? err.message : String(err) }
  }
})
ipcMain.handle('game:status', () => getStatus())
ipcMain.handle('game:play', async (e, profileId: string): Promise<Result<null>> => {
  try {
    await play(e.sender, profileId)
    return { ok: true, value: null }
  } catch (err) {
    const { code, message } = toAuthError(err)
    return { ok: false, code, error: message }
  }
})

const wrap = async <T>(fn: () => T | Promise<T>): Promise<Result<T>> => {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    // Fichier verrouillé par Windows : le plus souvent, le jeu est encore ouvert
    const locked = ['EBUSY', 'EPERM'].includes((err as NodeJS.ErrnoException)?.code ?? '')
    const message = locked ? 'Ferme le jeu avant de modifier ce profil.' : err instanceof Error ? err.message : String(err)
    return { ok: false, code: 'error', error: message }
  }
}

ipcMain.handle('profiles:list', () => listProfiles())
ipcMain.handle('profiles:create', (_e, input: ProfileInput): Profile => createProfile(input))
ipcMain.handle('profiles:update', (_e, id: string, patch: Partial<ProfileInput>): Profile => updateProfile(id, patch))
ipcMain.handle('profiles:select', (_e, id: string) => selectProfile(id))
ipcMain.handle('profiles:delete', (_e, id: string, deleteFiles: boolean) => wrap(() => deleteProfile(id, deleteFiles)))
ipcMain.handle('profiles:openFolder', (_e, id: string) => openProfileFolder(id))
ipcMain.handle('fabric:loaders', (_e, gameVersion: string): Promise<Result<LoaderVersion[]>> => wrap(() => fabricLoaders(gameVersion)))

ipcMain.handle('library:search', (_e, q: SearchQuery) => wrap(() => searchContent(q)))
ipcMain.handle('library:installed', (_e, profileId: string) => wrap(() => listInstalled(profileId)))
ipcMain.handle('library:install', (_e, profileId: string, projectId: string, type: ContentType) =>
  wrap(() => installContent(profileId, projectId, type))
)
ipcMain.handle('library:toggle', (_e, profileId: string, type: ContentType, fileName: string, enabled: boolean) =>
  wrap(() => setContentEnabled(profileId, type, fileName, enabled))
)
ipcMain.handle('library:remove', (_e, profileId: string, type: ContentType, fileName: string) =>
  wrap(() => removeContent(profileId, type, fileName))
)
ipcMain.handle('library:openFolder', async (_e, profileId: string, type: ContentType) => {
  await shell.openPath(await openContentFolder(profileId, type))
})

// Une seule fenêtre Aloria : relancer le raccourci ramène celle déjà ouverte au premier plan
if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  const win = createWindow()
  initUpdater(win)
  // Test de bout en bout en développement : lance le jeu dès l'ouverture
  if (!app.isPackaged && process.env.ALORIA_AUTOPLAY) {
    win.webContents.once('did-finish-load', async () => {
      const profileId = listProfiles().selectedId
      try {
        // ALORIA_TEST_INSTALL="mod:sodium,shader:complementary-reimagined" : installe avant de lancer
        for (const item of (process.env.ALORIA_TEST_INSTALL ?? '').split(',').filter(Boolean)) {
          const [type, slug] = item.split(':') as [ContentType, string]
          await installContent(profileId, slug, type)
          console.log('[game] installé', item)
        }
        console.log('[game] contenu', JSON.stringify(await listInstalled(profileId)))
        await play(win.webContents, profileId)
      } catch (err) {
        console.log('[game] erreur', err)
      }
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
