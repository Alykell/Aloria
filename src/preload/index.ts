import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  ContentType,
  JoinTarget,
  LocalWorld,
  SavedServer,
  ServerEdit,
  ImportResult,
  ExportOptions,
  ModpackPreview,
  ModpackProgress,
  ModpackSource,
  ModCheck,
  WorldBackups,
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
  DatapackCreation,
  GameData,
  PlayerSkin,
  SavedSkin,
  ServerInfo,
  ServerInput,
  ServerLogLine,
  ServerContent,
  ServerBackup,
  ServerContentHit,
  ServerContentDependency,
  ServerFile,
  PlayitUsage,
  ServerPlayerAction,
  ServerPlayers,
  ServerStatus,
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
    /** Sans fichier : fenêtre de choix (null si annulée). Un .mrpack n'est pas importé : son chemin revient pour l'aperçu */
    importZip: (file: File | string | null): Promise<Result<Profile | { modpack: string } | null>> =>
      ipcRenderer.invoke('profiles:import', file instanceof File ? webUtils.getPathForFile(file) : file),
    showFile: (path: string): Promise<void> => ipcRenderer.invoke('profiles:showFile', path)
  },
  worlds: {
    backups: (profileId: string): Promise<Result<WorldBackups[]>> => ipcRenderer.invoke('worlds:backups', profileId),
    /** Nom du fichier créé */
    backup: (profileId: string, world: string): Promise<Result<string | null>> => ipcRenderer.invoke('worlds:backup', profileId, world),
    restore: (profileId: string, world: string, file: string): Promise<Result<void>> => ipcRenderer.invoke('worlds:restore', profileId, world, file),
    deleteBackup: (profileId: string, world: string, file: string): Promise<Result<void>> =>
      ipcRenderer.invoke('worlds:deleteBackup', profileId, world, file),
    openBackups: (profileId: string, world: string): Promise<void> => ipcRenderer.invoke('worlds:openBackups', profileId, world)
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
    /** profileId : profil mis à jour (les mods CurseForge à télécharger à la main y sont peut-être déjà) */
    preview: (source: ModpackSource, profileId?: string): Promise<Result<ModpackPreview>> =>
      ipcRenderer.invoke('modpacks:preview', source, profileId),
    install: (source: ModpackSource): Promise<Result<Profile>> => ipcRenderer.invoke('modpacks:install', source),
    /** Crée un serveur (page Serveurs) avec la version, le chargeur, les mods côté serveur et les configs du modpack */
    installServer: (source: ModpackSource): Promise<Result<ServerInfo>> => ipcRenderer.invoke('modpacks:installServer', source),
    /** Nouvelle version du modpack d'un profil (null : à jour, ou modpack venu d'un fichier) */
    checkUpdate: (profileId: string): Promise<Result<ModpackVersion | null>> => ipcRenderer.invoke('modpacks:checkUpdate', profileId),
    /** Fichier .mrpack choisi par le joueur, null si annulé */
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('modpacks:pickFile'),
    update: (profileId: string, source: ModpackSource): Promise<Result<Profile>> => ipcRenderer.invoke('modpacks:update', profileId, source),
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
  datapacks: {
    gameData: (gameVersion: string): Promise<Result<GameData>> => ipcRenderer.invoke('datapacks:gameData', gameVersion),
    list: (): Promise<Result<DatapackCreation[]>> => ipcRenderer.invoke('datapacks:list'),
    create: (name: string, gameVersion: string): Promise<Result<DatapackCreation>> => ipcRenderer.invoke('datapacks:create', name, gameVersion),
    save: (dp: DatapackCreation): Promise<Result<DatapackCreation>> => ipcRenderer.invoke('datapacks:save', dp),
    remove: (id: string): Promise<Result<void>> => ipcRenderer.invoke('datapacks:delete', id),
    install: (id: string, profileId: string, install: boolean): Promise<Result<{ dp: DatapackCreation; skipped: string[] }>> =>
      ipcRenderer.invoke('datapacks:install', id, profileId, install),
    exportZip: (dp: DatapackCreation): Promise<Result<{ path: string; skipped: string[] } | null>> => ipcRenderer.invoke('datapacks:export', dp)
  },
  servers: {
    list: (): Promise<{ servers: ServerInfo[]; statuses: ServerStatus[]; freePort: number; lanAddress: string | null }> => ipcRenderer.invoke('servers:list'),
    create: (input: ServerInput): Promise<Result<ServerInfo>> => ipcRenderer.invoke('servers:create', input),
    update: (id: string, patch: Partial<ServerInfo>): Promise<Result<ServerInfo>> => ipcRenderer.invoke('servers:update', id, patch),
    remove: (id: string): Promise<Result<void>> => ipcRenderer.invoke('servers:delete', id),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke('servers:openFolder', id),
    start: (id: string): Promise<Result<void>> => ipcRenderer.invoke('servers:start', id),
    stop: (id: string): Promise<Result<void>> => ipcRenderer.invoke('servers:stop', id),
    kill: (id: string): Promise<void> => ipcRenderer.invoke('servers:kill', id),
    restart: (id: string): Promise<Result<void>> => ipcRenderer.invoke('servers:restart', id),
    command: (id: string, command: string): Promise<void> => ipcRenderer.invoke('servers:command', id, command),
    log: (id: string): Promise<string[]> => ipcRenderer.invoke('servers:log', id),
    /** Réessaie d'obtenir l'adresse playit.gg d'un serveur allumé (après avoir relié le compte) */
    tunnel: (id: string): Promise<void> => ipcRenderer.invoke('servers:tunnel', id),
    playitLinked: (): Promise<boolean> => ipcRenderer.invoke('playit:linked'),
    /** Ouvre la page de playit.gg et attend que le joueur accepte */
    playitLink: (): Promise<Result<void>> => ipcRenderer.invoke('playit:link'),
    playitUnlink: (): Promise<void> => ipcRenderer.invoke('playit:unlink'),
    playitUsage: (): Promise<Result<PlayitUsage>> => ipcRenderer.invoke('playit:usage'),
    /** Profil prêt à rejoindre le serveur (même version, chargeur et mods) ; remet ses mods à jour s'il existe */
    createProfile: (id: string, name?: string): Promise<Result<Profile>> => ipcRenderer.invoke('servers:createProfile', id, name),
    /** Zip pour les amis (nom, version, mods), importable dans la page Profils ; chemin ou null si annulé */
    exportPack: (id: string): Promise<Result<string | null>> => ipcRenderer.invoke('servers:exportPack', id),
    backups: (id: string): Promise<Result<ServerBackup[]>> => ipcRenderer.invoke('servers:backups', id),
    backup: (id: string): Promise<Result<string | null>> => ipcRenderer.invoke('servers:backup', id),
    restoreBackup: (id: string, file: string): Promise<Result<void>> => ipcRenderer.invoke('servers:restoreBackup', id, file),
    deleteBackup: (id: string, file: string): Promise<Result<void>> => ipcRenderer.invoke('servers:deleteBackup', id, file),
    openBackups: (id: string): Promise<void> => ipcRenderer.invoke('servers:openBackups', id),
    properties: (id: string): Promise<Result<Record<string, string>>> => ipcRenderer.invoke('servers:properties', id),
    setProperties: (id: string, patch: Record<string, string>): Promise<Result<void>> => ipcRenderer.invoke('servers:setProperties', id, patch),
    players: (id: string): Promise<Result<ServerPlayers>> => ipcRenderer.invoke('servers:players', id),
    player: (id: string, action: ServerPlayerAction, name: string): Promise<Result<void>> =>
      ipcRenderer.invoke('servers:player', id, action, name),
    whitelist: (id: string, on: boolean): Promise<Result<void>> => ipcRenderer.invoke('servers:whitelist', id, on),
    contentSearch: (id: string, query: string, source?: 'all' | 'modrinth' | 'curseforge'): Promise<Result<ServerContentHit[]>> =>
      ipcRenderer.invoke('servers:contentSearch', id, query, source),
    contentToggle: (id: string, fileName: string, enabled: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke('servers:contentToggle', id, fileName, enabled),
    content: (id: string): Promise<Result<ServerContent[]>> => ipcRenderer.invoke('servers:content', id),
    contentInstall: (id: string, projectId: string, withDeps = true): Promise<Result<void>> =>
      ipcRenderer.invoke('servers:contentInstall', id, projectId, withDeps),
    contentDeps: (id: string, projectId: string): Promise<Result<ServerContentDependency[]>> => ipcRenderer.invoke('servers:contentDeps', id, projectId),
    files: (id: string, rel: string): Promise<Result<ServerFile[]>> => ipcRenderer.invoke('servers:files', id, rel),
    quickFiles: (id: string): Promise<string[]> => ipcRenderer.invoke('servers:quickFiles', id),
    readFile: (id: string, rel: string): Promise<Result<string>> => ipcRenderer.invoke('servers:readFile', id, rel),
    writeFile: (id: string, rel: string, text: string): Promise<Result<void>> => ipcRenderer.invoke('servers:writeFile', id, rel, text),
    createEntry: (id: string, rel: string, name: string, folder: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke('servers:createEntry', id, rel, name, folder),
    renameEntry: (id: string, rel: string, name: string): Promise<Result<void>> => ipcRenderer.invoke('servers:renameEntry', id, rel, name),
    deleteEntries: (id: string, rels: string[]): Promise<Result<void>> => ipcRenderer.invoke('servers:deleteEntries', id, rels),
    zipEntries: (id: string, rels: string[], name: string): Promise<Result<void>> => ipcRenderer.invoke('servers:zipEntries', id, rels, name),
    unzipEntry: (id: string, rel: string): Promise<Result<void>> => ipcRenderer.invoke('servers:unzipEntry', id, rel),
    uploadFiles: (id: string, rel: string): Promise<Result<number>> => ipcRenderer.invoke('servers:uploadFiles', id, rel),
    downloadFile: (id: string, rel: string): Promise<Result<boolean>> => ipcRenderer.invoke('servers:downloadFile', id, rel),
    contentRemove: (id: string, fileName: string): Promise<Result<void>> => ipcRenderer.invoke('servers:contentRemove', id, fileName),
    onStatus: (cb: (s: ServerStatus) => void) => subscribe('servers:status', cb),
    onLog: (cb: (l: ServerLogLine) => void) => subscribe('servers:log', cb)
  },
  quick: {
    worlds: (profileId: string): Promise<Result<LocalWorld[]>> => ipcRenderer.invoke('quick:worlds', profileId),
    servers: (profileId: string): Promise<Result<SavedServer[]>> => ipcRenderer.invoke('quick:servers', profileId),
    /** `index` null : nouveau serveur ; `previous` : adresse lue avant la modification */
    saveServer: (profileId: string, index: number | null, previous: string | null, edit: ServerEdit): Promise<Result<void>> =>
      ipcRenderer.invoke('quick:saveServer', profileId, index, previous, edit),
    deleteServer: (profileId: string, index: number, previous: string): Promise<Result<void>> =>
      ipcRenderer.invoke('quick:deleteServer', profileId, index, previous)
  },
  game: {
    versions: (snapshots: boolean): Promise<Result<VersionEntry[]>> => ipcRenderer.invoke('game:versions', snapshots),
    status: (): Promise<GameStatus> => ipcRenderer.invoke('game:status'),
    /** Annule le lancement en cours */
    cancel: (): Promise<void> => ipcRenderer.invoke('game:cancel'),
    /** Ferme une partie (un second appel force l'arrêt) */
    stop: (profileId: string): Promise<void> => ipcRenderer.invoke('game:stop', profileId),
    /** `join` : serveur à rejoindre dès l'ouverture du jeu */
    play: (profileId: string, join?: JoinTarget): Promise<Result<null>> => ipcRenderer.invoke('game:play', profileId, join),
    /** Mods demandés par d'autres mais absents (null : tout est là) */
    checkMods: (profileId: string): Promise<Result<ModCheck | null>> => ipcRenderer.invoke('game:checkMods', profileId),
    fixMods: (profileId: string, check: ModCheck, disableOnly: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke('game:fixMods', profileId, check, disableOnly),
    fabricLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('fabric:loaders', gameVersion),
    forgeLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('forge:loaders', gameVersion),
    neoforgeLoaders: (gameVersion: string): Promise<Result<LoaderVersion[]>> => ipcRenderer.invoke('neoforge:loaders', gameVersion),
    onStatus: (cb: (s: GameStatus) => void) => subscribe('game:status', cb),
    onExit: (cb: (e: GameExit) => void) => subscribe('game:exit', cb)
  }
}

export type AloriaApi = typeof api

contextBridge.exposeInMainWorld('aloria', api)
