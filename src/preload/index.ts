import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  ContentType,
  ImportResult,
  ExportOptions,
  ModpackPreview,
  ModpackProgress,
  ModpackSource,
  ModpackVersion,
  GameExit,
  InstalledContent,
  SearchHit,
  SearchQuery,
  SettingsPreset,
  UpdateStatus,
  GameStatus,
  LoaderVersion,
  Profile,
  ProfileInput,
  CapeInfo,
  PackElement,
  PackInfo,
  PackVanilla,
  PlayerSkin,
  SavedSkin,
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
  /** Système (« win32 », « linux »…) : certains réglages n'existent que sous Linux */
  platform: process.platform,
  /** Disposition du clavier (code physique → caractère), pour convertir les touches des anciennes versions */
  keyboardLayout: (layout: Record<string, string>) => ipcRenderer.send('keyboard:layout', layout),
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),
    install: () => ipcRenderer.send('updater:install'),
    onStatus: (cb: (s: UpdateStatus) => void) => subscribe('updater:status', cb)
  },
  accounts: {
    list: (): Promise<{ active: string | null; accounts: PublicAccount[] }> => ipcRenderer.invoke('accounts:list'),
    add: (): Promise<Result<PublicAccount>> => ipcRenderer.invoke('accounts:add'),
    select: (uuid: string): Promise<void> => ipcRenderer.invoke('accounts:select', uuid),
    remove: (uuid: string): Promise<void> => ipcRenderer.invoke('accounts:remove', uuid),
    skin: (uuid: string): Promise<PlayerSkin | null> => ipcRenderer.invoke('accounts:skin', uuid)
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
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke('profiles:openFolder', id),
    /** Chemin du zip créé, null si annulé */
    exportZip: (id: string, options: ExportOptions): Promise<Result<string | null>> => ipcRenderer.invoke('profiles:export', id, options),
    /** Sans fichier : fenêtre de choix (null si annulée) */
    importZip: (file: File | string | null): Promise<Result<Profile | null>> =>
      ipcRenderer.invoke('profiles:import', file instanceof File ? webUtils.getPathForFile(file) : file),
    showFile: (path: string): Promise<void> => ipcRenderer.invoke('profiles:showFile', path)
  },
  presets: {
    list: (): Promise<SettingsPreset[]> => ipcRenderer.invoke('presets:list'),
    create: (name: string, copyFrom: string | null): Promise<SettingsPreset> => ipcRenderer.invoke('presets:create', name, copyFrom),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('presets:rename', id, name),
    remove: (id: string): Promise<Result<void>> => ipcRenderer.invoke('presets:delete', id),
    update: (id: string, patch: Record<string, string | null>): Promise<SettingsPreset> => ipcRenderer.invoke('presets:update', id, patch)
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
    openFolder: (profileId: string, type: ContentType): Promise<void> => ipcRenderer.invoke('library:openFolder', profileId, type),
    addOptiFine: (profileId: string): Promise<Result<boolean>> => ipcRenderer.invoke('library:addOptiFine', profileId),
    /** Sans fichiers : fenêtre de choix (null si annulée) */
    import: (profileId: string, files: File[] | null): Promise<Result<ImportResult | null>> =>
      ipcRenderer.invoke('library:import', profileId, files && files.map((f) => webUtils.getPathForFile(f)).filter(Boolean))
  },
  modpacks: {
    versions: (projectId: string): Promise<Result<ModpackVersion[]>> => ipcRenderer.invoke('modpacks:versions', projectId),
    preview: (source: ModpackSource): Promise<Result<ModpackPreview>> => ipcRenderer.invoke('modpacks:preview', source),
    install: (source: ModpackSource): Promise<Result<Profile>> => ipcRenderer.invoke('modpacks:install', source),
    onProgress: (cb: (p: ModpackProgress) => void) => subscribe('modpacks:progress', cb)
  },
  skins: {
    upload: (texture: string, slim: boolean, name: string): Promise<Result<PlayerSkin | null>> =>
      ipcRenderer.invoke('skins:upload', texture, slim, name),
    reset: (): Promise<Result<PlayerSkin | null>> => ipcRenderer.invoke('skins:reset'),
    capes: (): Promise<Result<CapeInfo[]>> => ipcRenderer.invoke('skins:capes'),
    setCape: (capeId: string | null): Promise<Result<PlayerSkin | null>> => ipcRenderer.invoke('skins:setCape', capeId),
    saved: (): Promise<Result<SavedSkin[]>> => ipcRenderer.invoke('skins:saved'),
    removeSaved: (id: string): Promise<Result<void>> => ipcRenderer.invoke('skins:removeSaved', id)
  },
  packs: {
    list: (): Promise<Result<PackInfo[]>> => ipcRenderer.invoke('packs:list'),
    create: (name: string): Promise<Result<PackInfo>> => ipcRenderer.invoke('packs:create', name),
    rename: (id: string, name: string): Promise<Result<void>> => ipcRenderer.invoke('packs:rename', id, name),
    remove: (id: string): Promise<Result<void>> => ipcRenderer.invoke('packs:delete', id),
    setScale: (id: string, scale: number): Promise<Result<void>> => ipcRenderer.invoke('packs:setScale', id, scale),
    saveImage: (id: string, element: PackElement, image: string | null): Promise<Result<void>> =>
      ipcRenderer.invoke('packs:saveImage', id, element, image),
    vanilla: (target: { profileId?: string; gameVersion?: string }): Promise<Result<PackVanilla>> => ipcRenderer.invoke('packs:vanilla', target),
    install: (id: string, profileId: string, files: Record<string, string>): Promise<Result<string>> =>
      ipcRenderer.invoke('packs:install', id, profileId, files)
  },
  game: {
    versions: (snapshots: boolean): Promise<Result<VersionEntry[]>> => ipcRenderer.invoke('game:versions', snapshots),
    status: (): Promise<GameStatus> => ipcRenderer.invoke('game:status'),
    play: (profileId: string): Promise<Result<null>> => ipcRenderer.invoke('game:play', profileId),
    fabricLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('fabric:loaders', gameVersion),
    forgeLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('forge:loaders', gameVersion),
    neoforgeLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('neoforge:loaders', gameVersion),
    onStatus: (cb: (s: GameStatus) => void) => subscribe('game:status', cb),
    onExit: (cb: (e: GameExit) => void) => subscribe('game:exit', cb)
  }
}

export type AloriaApi = typeof api

contextBridge.exposeInMainWorld('aloria', api)
