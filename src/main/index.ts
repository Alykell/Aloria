import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { addAccount, listAccounts, removeAccount, selectAccount } from './auth/accounts'
import { toAuthError } from './auth/errors'
import type { PublicAccount, Result } from '../shared/types'

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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
