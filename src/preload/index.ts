import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ContentType,
  GameExit,
  InstalledContent,
  SearchHit,
  SearchQuery,
  GameStatus,
  LoaderVersion,
  Profile,
  ProfileInput,
  PublicAccount,
  Result,
  Settings,
  VersionEntry
} from '../shared/types'

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
  profiles: {
    list: (): Promise<{ selectedId: string; profiles: Profile[] }> => ipcRenderer.invoke('profiles:list'),
    create: (input: ProfileInput): Promise<Profile> => ipcRenderer.invoke('profiles:create', input),
    update: (id: string, patch: Partial<ProfileInput>): Promise<Profile> => ipcRenderer.invoke('profiles:update', id, patch),
    select: (id: string): Promise<void> => ipcRenderer.invoke('profiles:select', id),
    remove: (id: string, deleteFiles: boolean): Promise<Result<void>> => ipcRenderer.invoke('profiles:delete', id, deleteFiles),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke('profiles:openFolder', id)
  },
  library: {
    search: (q: SearchQuery): Promise<Result<{ hits: SearchHit[]; total: number; gameVersion: string }>> =>
      ipcRenderer.invoke('library:search', q),
    installed: (profileId: string): Promise<Result<InstalledContent[]>> => ipcRenderer.invoke('library:installed', profileId),
    install: (profileId: string, projectId: string, type: ContentType): Promise<Result<void>> =>
      ipcRenderer.invoke('library:install', profileId, projectId, type),
    toggle: (profileId: string, type: ContentType, fileName: string, enabled: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke('library:toggle', profileId, type, fileName, enabled),
    remove: (profileId: string, type: ContentType, fileName: string): Promise<Result<void>> =>
      ipcRenderer.invoke('library:remove', profileId, type, fileName),
    openFolder: (profileId: string, type: ContentType): Promise<void> => ipcRenderer.invoke('library:openFolder', profileId, type)
  },
  game: {
    versions: (snapshots: boolean): Promise<Result<VersionEntry[]>> => ipcRenderer.invoke('game:versions', snapshots),
    status: (): Promise<GameStatus> => ipcRenderer.invoke('game:status'),
    play: (profileId: string): Promise<Result<null>> => ipcRenderer.invoke('game:play', profileId),
    fabricLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('fabric:loaders', gameVersion),
    onStatus: (cb: (s: GameStatus) => void) => subscribe('game:status', cb),
    onExit: (cb: (e: GameExit) => void) => subscribe('game:exit', cb)
  }
}

export type AloriaApi = typeof api

contextBridge.exposeInMainWorld('aloria', api)
