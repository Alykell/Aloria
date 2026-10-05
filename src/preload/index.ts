import { contextBridge, ipcRenderer } from 'electron'
import type { PublicAccount, Result } from '../shared/types'

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
  }
}

export type AloriaApi = typeof api

contextBridge.exposeInMainWorld('aloria', api)
