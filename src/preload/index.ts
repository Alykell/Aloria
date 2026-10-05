import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GameExit, GameStatus, PublicAccount, Result, Settings, VersionEntry } from '../shared/types'

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  accounts: {
    list: (): Promise<{ active: string | null; accounts: PublicAccount[] }> => ipcRenderer.invoke('accounts:list'),
    add: (): Promise<Result<PublicAccount>> => ipcRenderer.invoke('accounts:add'),
    select: (uuid: string): Promise<void> => ipcRenderer.invoke('accounts:select', uuid),
    remove: (uuid: string): Promise<void> => ipcRenderer.invoke('accounts:remove', uuid)
  },
  settings: {
    get: (): Promise<{ settings: Settings; systemRamMb: number }> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch)
  },
  game: {
    versions: (snapshots: boolean): Promise<Result<VersionEntry[]>> => ipcRenderer.invoke('game:versions', snapshots),
    status: (): Promise<GameStatus> => ipcRenderer.invoke('game:status'),
    play: (): Promise<Result<null>> => ipcRenderer.invoke('game:play'),
    openFolder: (): Promise<string> => ipcRenderer.invoke('game:openFolder'),
    onStatus: (cb: (s: GameStatus) => void) => subscribe('game:status', cb),
    onExit: (cb: (e: GameExit) => void) => subscribe('game:exit', cb)
  }
}

export type AloriaApi = typeof api

contextBridge.exposeInMainWorld('aloria', api)
