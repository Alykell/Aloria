import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { addAccount, listAccounts, removeAccount, selectAccount } from './auth/accounts'
import { toAuthError } from './auth/errors'
import { claimCosmetic, cosmeticsState, equipCosmetic } from './cosmetics'
import { getSkin, listCapes, listSavedSkins, removeSavedSkin, resetSkin, setCape, uploadSkin } from './auth/skin'
import { createDatapack, deleteDatapack, exportDatapack, installDatapack, listDatapacks, saveDatapack, zipName } from './datapackCreations'
import { gameData } from './gameData'
import { createPack, deletePack, installPack, listPacks, packVanilla, renamePack, savePackImage, setPackScale } from './packs'
import { cancelLaunch, getStatus, isGameRunning, listVersions, play, stopGame } from './game/controller'
import { checkMods, fixMods } from './game/modCheck'
import { backupWorld, deleteWorldBackup, listWorldBackups, openWorldBackups, restoreWorld } from './worldBackups'
import { fabricLoaders } from './game/fabric'
import { forgeLoaders } from './game/forge'
import { neoforgeLoaders } from './game/neoforge'
import { addOptiFine, importFiles, installContent, listInstalled, openContentFolder, removeContent, searchContent, setContentEnabled } from './modrinth/content'
import { exportProfile, importInstance, isCurseforgePack } from './instances'
import AdmZip from 'adm-zip'
import { installModpack, installModpackServer, modpackUpdate, modpackVersions, previewModpack, updateModpack } from './modrinth/modpack'
import { createPreset, deletePreset, getPreset, listPresets, MAIN_PRESET, renamePreset, updatePresetOptions } from './shared/presets'
import { gameLangOf, translate, type Lang, type MessageKey } from '../shared/i18n'
import { readGameConsole } from './game/gameConsole'
import { createProfile, deleteProfile, gameDirOf, getProfile, listProfiles, migrateProfileDirs, openProfileFolder, selectProfile, updateProfile } from './profiles'
import { resolveVersionId } from './game/versions'
import { paths } from './game/paths'
import { getSettings, systemRamMb, updateSettings } from './settings'
import { getUpdateStatus, initUpdater, installUpdate } from './updater'
import { initDiscord, refreshDiscord } from './discord'
import { processPending } from './shared/pending'
import { saveKeyboardLayout } from './shared/options'
import { e4mcSupported } from '../shared/aloriaHud'
import { createServer, deleteServer, freePort, getServer, lanAddress, listServers, openServerFolder, serverDirOf, updateServer } from './server/store'
import { deleteTunnel, linkPlayit, playitLinked, playitUsage, unlinkPlayit } from './server/playit'
import { checkAddress, releaseCustomAddress, setCustomAddress } from './server/address'
import * as quickplay from './quickplay'
import { createServerProfile, exportServerPack, writeServerPack } from './server/profile'
import { deleteBackup, listBackups, openBackupFolder, restoreBackup } from './server/backups'
import { editPlayersOffline, listPlayers, playerCommand, readProperties, writeProperties } from './server/manage'
import { installServerContent, listServerContent, missingDependencies, removeServerContent, searchServerContent, setServerContentEnabled } from './server/content'
import { createEntry, deleteEntries, downloadFile, listFiles, quickFiles, readTextFile, renameEntry, unzipEntry, uploadFiles, writeTextFile, zipEntries } from './server/files'
import { backupServer, connectTunnel, anyServerRunning, isServerAlive, killServer, linkCustomAddress, restartServer, sendCommand, serverLog, serverStatuses, setServerTarget, startServer, stopAllServers, stopServer } from './server/runner'
import type {
  CosmeticSlot,
  ExportOptions,
  JoinTarget,
  ServerEdit,
  ModpackSource,
  DatapackCreation,
  PackElement,
  ContentType,
  LoaderVersion,
  Profile,
  ProfileInput,
  PublicAccount,
  Result,
  SearchQuery,
  ServerInfo,
  ServerInput,
  ServerPlayerAction,
  Settings,
  VersionEntry,
  ModCheck
} from '../shared/types'
import { tm } from './i18n'

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

  // L'interface grandit avec la fenêtre au-delà de 1280×800 (taille logique, échelle du système déjà comprise) :
  // sur un grand écran à 100 % (fréquent sous Linux), une fenêtre agrandie ne garde plus des boutons minuscules
  const fitZoom = () => {
    const [w, h] = win.getContentSize()
    const zoom = Math.min(1.5, Math.max(1, Math.min(w / 1280, h / 800)))
    win.webContents.setZoomFactor(Math.round(zoom * 20) / 20)
  }
  win.on('resize', fitZoom)
  win.webContents.on('did-finish-load', fitZoom)

  // Fermer la fenêtre pendant une partie (ou avec un serveur allumé) la cache seulement : le statut Discord et la récupération
  // des réglages continuent, et le launcher quitte quand le jeu se ferme
  win.on('close', (event) => {
    // Sauf si le launcher quitte vraiment (ex. « Redémarrer pour installer » une mise à jour)
    if (quitting || (!isGameRunning() && !anyServerRunning())) return
    event.preventDefault()
    win.hide()
  })

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
ipcMain.on('keyboard:layout', (_e, layout: Record<string, string>) => saveKeyboardLayout(layout))

ipcMain.handle('accounts:list', () => {
  // Développement : ALORIA_CAPTURE_ACCOUNT="pseudo:uuid" affiche un compte d'exemple (skin 3D de l'accueil, boutons de jeu ;
  // avec ALORIA_TEST_DEMO=1, Jouer lance la démo)
  const demo = !app.isPackaged ? process.env.ALORIA_CAPTURE_ACCOUNT?.split(':') : undefined
  if (demo?.length === 2) return { active: demo[1], accounts: [{ name: demo[0], uuid: demo[1] }] }
  return listAccounts()
})
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
ipcMain.handle('accounts:skin', (_e, uuid: string) => getSkin(uuid).catch(() => null))

ipcMain.handle('settings:get', () => ({ settings: getSettings(), systemRamMb: systemRamMb() }))
ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
  const next = updateSettings(patch)
  // Premier choix de la langue : le jeu la reprend, sauf si « Mes réglages » a déjà la sienne
  if (patch.language && !getPreset(MAIN_PRESET)?.options.lang) updatePresetOptions(MAIN_PRESET, { lang: gameLangOf(patch.language) })
  if (Object.keys(patch).some((k) => k.startsWith('discord') || k === 'language')) refreshDiscord()
  return next
})
ipcMain.handle('game:versions', async (_e, snapshots: boolean): Promise<Result<VersionEntry[]>> => {
  try {
    return { ok: true, value: await listVersions(snapshots) }
  } catch (err) {
    return { ok: false, code: 'network', error: err instanceof Error ? err.message : String(err) }
  }
})
ipcMain.handle('game:status', () => getStatus())
ipcMain.handle('game:cancel', () => cancelLaunch())
ipcMain.handle('game:stop', (_e, profileId: string) => stopGame(profileId))
// Mods qui en demandent d'autres absents du profil : vérifiés avant le lancement, réparés si le joueur le veut
ipcMain.handle('game:checkMods', (_e, profileId: string) => wrap(() => checkMods(profileId)))
ipcMain.handle('game:fixMods', (_e, profileId: string, check: ModCheck, disableOnly: boolean) => wrap(() => fixMods(profileId, check, disableOnly)))
// Sauvegardes des mondes solo d'un profil (restaurer : jeu du profil fermé)
const profileRunning = (profileId: string) => getStatus().running.some((r) => r.profileId === profileId)
ipcMain.handle('worlds:backups', (_e, profileId: string) => wrap(() => listWorldBackups(profileId)))
ipcMain.handle('worlds:backup', (_e, profileId: string, world: string) => wrap(() => backupWorld(profileId, world, 'manual')))
ipcMain.handle('worlds:restore', (_e, profileId: string, world: string, file: string) =>
  wrap(async () => {
    if (profileRunning(profileId)) throw new Error(tm('err.worldRestoreRunning'))
    await restoreWorld(profileId, world, file)
  })
)
ipcMain.handle('worlds:deleteBackup', (_e, profileId: string, world: string, file: string) => wrap(() => deleteWorldBackup(profileId, world, file)))
ipcMain.handle('worlds:openBackups', (_e, profileId: string, world: string) => openWorldBackups(profileId, world))
// Console d'un profil : sortie du jeu (logs/aloria-launch.log), lue par morceaux à partir de `offset`
ipcMain.handle('game:console', (_e, profileId: string, offset: number) => wrap(() => readGameConsole(profileId, offset)))
ipcMain.handle('game:play', async (e, profileId: string, join?: JoinTarget): Promise<Result<null>> => {
  try {
    await play(e.sender, profileId, join)
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
// Export d'un profil en zip (fenêtre d'enregistrement ; null si annulé) et import d'un zip de profil (choisi ici, ou glissé)
ipcMain.handle('profiles:export', (e, id: string, options: ExportOptions) =>
  wrap(async () => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const name = listProfiles().profiles.find((p) => p.id === id)?.name ?? 'profil'
    const dialogOptions = {
      title: tm('dialog.exportProfile'),
      defaultPath: join(app.getPath('downloads'), `${name.replace(/[\\/:*?"<>|]/g, '_')}.zip`),
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
    if (res.canceled || !res.filePath) return null
    await exportProfile(id, res.filePath, options)
    return res.filePath
  })
)
ipcMain.handle('profiles:import', (e, path: string | null) =>
  wrap(async () => {
    if (!path) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = {
        title: tm('dialog.importProfile'),
        defaultPath: app.getPath('downloads'),
        filters: [{ name: tm('dialog.importProfileFilter'), extensions: ['zip', 'mrpack'] }],
        properties: ['openFile' as const]
      }
      const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (res.canceled || res.filePaths.length === 0) return null
      path = res.filePaths[0]
    }
    return importProfileFile(path)
  })
)
/** Modpack Modrinth ou CurseForge : le renderer l'affiche (aperçu) avant de l'installer dans un nouveau profil ; sinon profil exporté */
async function importProfileFile(path: string): Promise<Profile | { modpack: string }> {
  if (path.toLowerCase().endsWith('.mrpack')) return { modpack: path }
  try {
    if (isCurseforgePack(new AdmZip(path))) return { modpack: path }
  } catch {
    // Zip illisible : importInstance le dira
  }
  return importInstance(path)
}
ipcMain.handle('profiles:showFile', (_e, path: string) => shell.showItemInFolder(path))
ipcMain.handle('fabric:loaders', (_e, gameVersion: string): Promise<Result<LoaderVersion[]>> => wrap(() => fabricLoaders(gameVersion)))
ipcMain.handle('neoforge:loaders', (_e, gameVersion: string): Promise<Result<LoaderVersion[]>> => wrap(() => neoforgeLoaders(gameVersion)))
ipcMain.handle('forge:loaders', (_e, gameVersion: string): Promise<Result<LoaderVersion[]>> => wrap(() => forgeLoaders(gameVersion)))

ipcMain.handle('presets:list', () => listPresets())
ipcMain.handle('presets:create', (_e, name: string, copyFrom: string | null) => createPreset(name, copyFrom))
ipcMain.handle('presets:rename', (_e, id: string, name: string) => renamePreset(id, name))
ipcMain.handle('presets:delete', (_e, id: string) => wrap(() => deletePreset(id)))
ipcMain.handle('presets:update', (_e, id: string, patch: Record<string, string | null>) => updatePresetOptions(id, patch))

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
// OptiFine téléchargé par le joueur : il choisit le fichier, on le range dans le profil (false si annulé)
ipcMain.handle('library:addOptiFine', (e, profileId: string) =>
  wrap(async () => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = {
      title: tm('dialog.optifine'),
      defaultPath: app.getPath('downloads'),
      filters: [{ name: 'OptiFine', extensions: ['jar'] }],
      properties: ['openFile' as const]
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled || res.filePaths.length === 0) return false
    await addOptiFine(profileId, res.filePaths[0])
    return true
  })
)
// Mods, resource packs et shaders ajoutés par le joueur : glissés dans la fenêtre (chemins donnés), sinon choisis ici
ipcMain.handle('library:import', (e, profileId: string, paths: string[] | null) =>
  wrap(async () => {
    if (!paths) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options = {
        title: tm('dialog.import'),
        defaultPath: app.getPath('downloads'),
        filters: [{ name: tm('dialog.importFilter'), extensions: ['jar', 'zip', 'mrpack'] }],
        properties: ['openFile' as const, 'multiSelections' as const]
      }
      const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (res.canceled || res.filePaths.length === 0) return null
      paths = res.filePaths
    }
    return importFiles(profileId, paths)
  })
)
// Modpacks (.mrpack) : versions, aperçu (liste des mods) puis installation dans un nouveau profil
ipcMain.handle('modpacks:versions', (_e, projectId: string) => wrap(() => modpackVersions(projectId)))
ipcMain.handle('modpacks:preview', (_e, source: ModpackSource, profileId?: string) => wrap(() => previewModpack(source, profileId)))
ipcMain.handle('modpacks:install', (e, source: ModpackSource) =>
  wrap(() => installModpack(source, (p) => !e.sender.isDestroyed() && e.sender.send('modpacks:progress', p)))
)
// Modpack installé comme serveur (page Serveurs) plutôt que comme profil
ipcMain.handle('modpacks:installServer', (e, source: ModpackSource) =>
  wrap(() => installModpackServer(source, (p) => !e.sender.isDestroyed() && e.sender.send('modpacks:progress', p)))
)
// Mise à jour du modpack d'un profil : nouvelle version Modrinth, ou fichier .mrpack choisi par le joueur
ipcMain.handle('modpacks:checkUpdate', (_e, profileId: string) => wrap(() => modpackUpdate(profileId)))
ipcMain.handle('modpacks:pickFile', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const options = {
    title: tm('dialog.pickModpack'),
    defaultPath: app.getPath('downloads'),
    filters: [{ name: tm('dialog.pickModpackFilter'), extensions: ['mrpack', 'zip'] }],
    properties: ['openFile' as const]
  }
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return res.canceled ? null : (res.filePaths[0] ?? null)
})
ipcMain.handle('modpacks:update', (e, profileId: string, source: ModpackSource) =>
  wrap(async () => {
    if (getStatus().running.some((r) => r.profileId === profileId)) throw new Error(tm('err.modpackRunning'))
    return updateModpack(profileId, source, (p) => !e.sender.isDestroyed() && e.sender.send('modpacks:progress', p))
  })
)
ipcMain.handle('library:openFolder', async (_e, profileId: string, type: ContentType) => {
  await shell.openPath(await openContentFolder(profileId, type))
})

// Skin du compte actif : envoi, retour au skin par défaut, cape, bibliothèque de skins enregistrés
const activeUuid = () => {
  const uuid = listAccounts().active
  if (!uuid) throw new Error(tm('err.loginForSkin'))
  return uuid
}
ipcMain.handle('skins:upload', (_e, texture: string, slim: boolean, name: string) => wrap(() => uploadSkin(activeUuid(), texture, slim, name)))
ipcMain.handle('skins:reset', () => wrap(() => resetSkin(activeUuid())))
ipcMain.handle('skins:capes', () => wrap(() => listCapes(activeUuid())))
ipcMain.handle('skins:setCape', (_e, capeId: string | null) => wrap(() => setCape(activeUuid(), capeId)))
ipcMain.handle('skins:saved', () => wrap(() => listSavedSkins()))
ipcMain.handle('skins:removeSaved', (_e, id: string) => wrap(() => removeSavedSkin(id)))
const cosmeticsUuid = () => {
  const uuid = listAccounts().active
  if (!uuid) throw new Error(tm('err.loginForCosmetics'))
  return uuid
}
ipcMain.handle('cosmetics:state', () => wrap(() => cosmeticsState(cosmeticsUuid())))
ipcMain.handle('cosmetics:claim', (_e, id: string) => wrap(() => claimCosmetic(cosmeticsUuid(), id)))
ipcMain.handle('cosmetics:equip', (_e, slot: CosmeticSlot, id: string | null) => wrap(() => equipCosmetic(cosmeticsUuid(), slot, id)))

// Créations : packs de ressources faits dans Aloria
ipcMain.handle('packs:list', () => wrap(() => listPacks()))
ipcMain.handle('packs:create', (_e, name: string) => wrap(() => createPack(name)))
ipcMain.handle('packs:rename', (_e, id: string, name: string) => wrap(() => renamePack(id, name)))
ipcMain.handle('packs:delete', (_e, id: string) => wrap(() => deletePack(id)))
ipcMain.handle('packs:setScale', (_e, id: string, scale: number) => wrap(() => setPackScale(id, scale)))
ipcMain.handle('packs:saveImage', (_e, id: string, element: PackElement, image: string | null) => wrap(() => savePackImage(id, element, image)))
ipcMain.handle('packs:vanilla', (_e, target: { profileId?: string; gameVersion?: string }) => wrap(() => packVanilla(target)))
// Créations : datapacks (recettes) faits dans Aloria, et les items / recettes d'une version pour l'éditeur
ipcMain.handle('datapacks:gameData', (_e, gameVersion: string) => wrap(() => gameData(gameVersion)))
ipcMain.handle('datapacks:list', () => wrap(() => listDatapacks()))
ipcMain.handle('datapacks:create', (_e, name: string, gameVersion: string) => wrap(() => createDatapack(name, gameVersion)))
ipcMain.handle('datapacks:save', (_e, dp: DatapackCreation) => wrap(() => saveDatapack(dp)))
ipcMain.handle('datapacks:delete', (_e, id: string) => wrap(() => deleteDatapack(id)))
ipcMain.handle('datapacks:install', (_e, id: string, profileId: string, install: boolean) => wrap(() => installDatapack(id, profileId, install)))
ipcMain.handle('datapacks:export', (e, dp: DatapackCreation) =>
  wrap(async () => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const dialogOptions = {
      title: tm('dialog.exportDatapack'),
      defaultPath: join(app.getPath('downloads'), zipName(dp)),
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
    if (res.canceled || !res.filePath) return null
    return { path: res.filePath, skipped: await exportDatapack(dp.id, res.filePath) }
  })
)
ipcMain.handle('servers:list', () => ({ servers: listServers(), statuses: serverStatuses(), freePort: freePort(), lanAddress: lanAddress() }))
ipcMain.handle('servers:create', (_e, input: ServerInput) => wrap(() => createServer(input)))
ipcMain.handle('servers:update', (_e, id: string, patch: Partial<ServerInfo>) => wrap(() => updateServer(id, patch)))
ipcMain.handle('servers:delete', (_e, id: string) =>
  wrap(async () => {
    await stopServer(id)
    await deleteTunnel(getServer(id))
    const address = getServer(id).customAddress
    if (address) await releaseCustomAddress(address).catch(() => undefined)
    await deleteServer(id)
  })
)
ipcMain.handle('servers:checkAddress', (_e, name: string) => wrap(() => checkAddress(name)))
ipcMain.handle('servers:setAddress', (_e, id: string, name: string | null) =>
  wrap(async () => {
    const problem = await setCustomAddress(id, name)
    // Serveur déjà en ligne : le nouveau nom pointe tout de suite vers son tunnel
    if (!problem) linkCustomAddress(id)
    return problem
  })
)
ipcMain.handle('servers:openFolder', (_e, id: string) => openServerFolder(id))
ipcMain.handle('servers:start', (_e, id: string) => wrap(() => startServer(id)))
ipcMain.handle('servers:stop', (_e, id: string) => wrap(() => stopServer(id)))
ipcMain.handle('servers:kill', (_e, id: string) => killServer(id))
ipcMain.handle('servers:restart', (_e, id: string) => wrap(() => restartServer(id)))
ipcMain.handle('servers:command', (_e, id: string, command: string) => sendCommand(id, command))
ipcMain.handle('servers:log', (_e, id: string) => serverLog(id))
ipcMain.handle('servers:tunnel', (_e, id: string) => connectTunnel(id))
ipcMain.handle('servers:backups', (_e, id: string) => wrap(() => listBackups(id)))
ipcMain.handle('servers:backup', (_e, id: string) => wrap(() => backupServer(id, 'manual')))
ipcMain.handle('servers:restoreBackup', (_e, id: string, file: string) =>
  wrap(async () => {
    if (isServerAlive(id)) throw new Error(tm('err.serverRestoreRunning'))
    await restoreBackup(id, file)
  })
)
ipcMain.handle('servers:deleteBackup', (_e, id: string, file: string) => wrap(() => deleteBackup(id, file)))
ipcMain.handle('servers:openBackups', (_e, id: string) => openBackupFolder(id))
ipcMain.handle('servers:properties', (_e, id: string) => wrap(() => readProperties(id)))
ipcMain.handle('servers:setProperties', (_e, id: string, patch: Record<string, string>) => wrap(() => writeProperties(id, patch)))
ipcMain.handle('servers:players', (_e, id: string) => wrap(() => listPlayers(id)))
ipcMain.handle('servers:player', (_e, id: string, action: ServerPlayerAction, name: string) =>
  wrap(async () => {
    const clean = name.trim()
    if (!/^\w{1,16}$/.test(clean)) throw new Error(tm('err.serverPlayerName'))
    if (isServerAlive(id)) {
      // Le serveur réécrit lui-même ses fichiers : on lui laisse un instant avant de les relire
      sendCommand(id, playerCommand(action, clean))
      await new Promise((r) => setTimeout(r, 800))
    } else await editPlayersOffline(id, action, clean)
  })
)
ipcMain.handle('servers:whitelist', (_e, id: string, on: boolean) =>
  wrap(async () => {
    if (isServerAlive(id)) {
      sendCommand(id, `whitelist ${on ? 'on' : 'off'}`)
      await new Promise((r) => setTimeout(r, 800))
    } else await writeProperties(id, { 'white-list': String(on) })
  })
)
ipcMain.handle('servers:contentSearch', (_e, id: string, query: string, source?: 'all' | 'modrinth' | 'curseforge') =>
  wrap(() => searchServerContent(id, query, source))
)
ipcMain.handle('servers:contentToggle', (_e, id: string, fileName: string, enabled: boolean) => wrap(() => setServerContentEnabled(id, fileName, enabled)))
ipcMain.handle('servers:content', (_e, id: string) => wrap(() => listServerContent(id)))
ipcMain.handle('servers:contentInstall', (_e, id: string, projectId: string, withDeps: boolean) =>
  wrap(() => installServerContent(id, projectId, withDeps))
)
ipcMain.handle('servers:contentDeps', (_e, id: string, projectId: string) => wrap(() => missingDependencies(id, projectId)))
ipcMain.handle('servers:files', (_e, id: string, rel: string) => wrap(() => listFiles(id, rel)))
ipcMain.handle('servers:quickFiles', (_e, id: string) => quickFiles(id))
ipcMain.handle('servers:readFile', (_e, id: string, rel: string) => wrap(() => readTextFile(id, rel)))
ipcMain.handle('servers:writeFile', (_e, id: string, rel: string, text: string) => wrap(() => writeTextFile(id, rel, text)))
ipcMain.handle('servers:createEntry', (_e, id: string, rel: string, name: string, folder: boolean) => wrap(() => createEntry(id, rel, name, folder)))
ipcMain.handle('servers:renameEntry', (_e, id: string, rel: string, name: string) => wrap(() => renameEntry(id, rel, name)))
ipcMain.handle('servers:deleteEntries', (_e, id: string, rels: string[]) => wrap(() => deleteEntries(id, rels)))
ipcMain.handle('servers:zipEntries', (_e, id: string, rels: string[], name: string) => wrap(() => zipEntries(id, rels, name)))
ipcMain.handle('servers:unzipEntry', (_e, id: string, rel: string) => wrap(() => unzipEntry(id, rel)))
ipcMain.handle('servers:uploadFiles', (e, id: string, rel: string) => wrap(() => uploadFiles(BrowserWindow.fromWebContents(e.sender), id, rel)))
ipcMain.handle('servers:downloadFile', (e, id: string, rel: string) => wrap(() => downloadFile(BrowserWindow.fromWebContents(e.sender), id, rel)))
ipcMain.handle('servers:contentRemove', (_e, id: string, fileName: string) => wrap(() => removeServerContent(id, fileName)))
// ALORIA_CAPTURE_PLAYIT_UNLINKED=1 (captures) : l'interface fait comme si playit.gg n'était pas relié (fenêtre de liaison)
const captureUnlinked = !app.isPackaged && !!process.env.ALORIA_CAPTURE_PLAYIT_UNLINKED
ipcMain.handle('playit:linked', () => !captureUnlinked && playitLinked())
ipcMain.handle('playit:usage', () =>
  wrap(async () => (captureUnlinked ? { ...(await playitUsage()), linked: false } : playitUsage()))
)

// Boutons Solo / Multijoueur de l'accueil
ipcMain.handle('quick:worlds', (_e, profileId: string) => wrap(() => quickplay.listWorlds(profileId)))
ipcMain.handle('quick:servers', (_e, profileId: string) => wrap(() => quickplay.listServers(profileId)))
ipcMain.handle('quick:saveServer', (_e, profileId: string, index: number | null, previous: string | null, edit: ServerEdit) =>
  wrap(() => quickplay.saveServer(profileId, index, previous, edit))
)
ipcMain.handle('quick:deleteServer', (_e, profileId: string, index: number, previous: string) =>
  wrap(() => quickplay.deleteServer(profileId, index, previous))
)
ipcMain.handle('servers:createProfile', (_e, id: string, name?: string) => wrap(() => createServerProfile(id, name)))
ipcMain.handle('servers:exportPack', (e, id: string) => wrap(() => exportServerPack(BrowserWindow.fromWebContents(e.sender), id)))
ipcMain.handle('playit:link', () => wrap(() => linkPlayit()))
ipcMain.handle('playit:unlink', () => unlinkPlayit())
ipcMain.handle('packs:install', (_e, id: string, profileId: string, files: Record<string, string>) => wrap(() => installPack(id, profileId, files)))

// Tests en développement : dossier de données séparé, pour ne pas croiser le launcher installé
if (!app.isPackaged && process.env.ALORIA_USER_DATA) app.setPath('userData', process.env.ALORIA_USER_DATA)

/** Vrai dès que le launcher quitte (app.quit) : la fenêtre doit alors se fermer, même pendant une partie */
let quitting = false
app.on('before-quit', (event) => {
  quitting = true
  // Serveurs allumés : on les arrête proprement (le monde est sauvegardé) avant de quitter
  if (anyServerRunning()) {
    event.preventDefault()
    stopAllServers().finally(() => app.quit())
  }
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
  setServerTarget(win.webContents)
  initUpdater(win)
  initDiscord()
  // Réglages des parties terminées pendant que le launcher était fermé, puis dossiers des profils à leur nom
  processPending().finally(() => migrateProfileDirs())
  // Développement : ALORIA_CAPTURE=<dossier> prend des captures des pages, en jour et en nuit, puis quitte
  if (!app.isPackaged && process.env.ALORIA_CAPTURE) captureScreens(win, process.env.ALORIA_CAPTURE)
  // Test de bout en bout en développement : lance le jeu dès l'ouverture
  if (!app.isPackaged && process.env.ALORIA_AUTOPLAY) {
    win.webContents.once('did-finish-load', async () => {
      // ALORIA_AUTOPLAY_PROFILE : profil dédié aux tests, pour ne pas toucher aux réglages des vrais profils
      const profileId = process.env.ALORIA_AUTOPLAY_PROFILE ?? listProfiles().selectedId
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
  // Test des cosmétiques avec le compte actif : ALORIA_TEST_COSMETICS=1 se connecte au Worker et affiche l'état (journal [cosmetics-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_COSMETICS) {
    win.webContents.once('did-finish-load', async () => {
      try {
        console.log('[cosmetics-test]', JSON.stringify(await cosmeticsState(cosmeticsUuid())))
      } catch (err) {
        console.log('[cosmetics-test] erreur', err instanceof Error ? err.message : err)
      }
      app.quit()
    })
  }
  // Test de l'import de profils (avec ALORIA_ROOT=<.aloria de test>) : ALORIA_TEST_IMPORT=<dossier> importe chaque fichier
  // comme le bouton « Importer » (modpacks : aperçu puis installation), affiche le profil créé puis le supprime (journal [import-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_IMPORT && process.env.ALORIA_ROOT) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[import-test]', ...args)
      const { readdir } = await import('node:fs/promises')
      const dir = process.env.ALORIA_TEST_IMPORT!
      for (const name of await readdir(dir)) {
        try {
          const first = await importProfileFile(join(dir, name))
          let profile: Profile
          if (!('id' in first)) {
            const preview = await previewModpack({ kind: 'file', path: first.modpack })
            log(name, ': aperçu', preview.name, preview.gameVersion, preview.loader, preview.unsupported ?? '', preview.files.length, 'fichiers')
            profile = await installModpack({ kind: 'file', path: first.modpack }, () => {})
          } else profile = first
          const files = await readdir(gameDirOf(profile.id), { recursive: true })
          log(name, ': OK', JSON.stringify({ name: profile.name, version: profile.versionId, loader: profile.loader, loaderVersion: profile.loaderVersion }), files.length, 'fichiers')
          await deleteProfile(profile.id, true)
        } catch (err) {
          log(name, ': ERREUR', err instanceof Error ? err.message : err)
        }
      }
      app.quit()
    })
  }
  // Test des dossiers de profils (avec ALORIA_ROOT=<.aloria de test>) : ALORIA_TEST_DIRS=1 affiche les dossiers après le
  // renommage du démarrage, puis renomme un profil (caractères interdits, nom déjà pris) — journal [dirs-test]
  if (!app.isPackaged && process.env.ALORIA_TEST_DIRS && process.env.ALORIA_ROOT) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[dirs-test]', ...args)
      const { readdirSync, existsSync: exists } = await import('node:fs')
      await new Promise((r) => setTimeout(r, 1500))
      const show = (when: string) => {
        log(when, listProfiles().profiles.map((p) => `${p.name} → ${p.dir ?? '(id) ' + p.id}`).join(' | '))
        log(when, 'dossiers :', readdirSync(join(paths.root, 'instances')).join(' | '))
      }
      show('après démarrage')
      const [first, second] = listProfiles().profiles.filter((p) => !p.id.startsWith('selftest'))
      updateProfile(first.id, { name: 'Test: Renommé?' })
      updateProfile(second.id, { name: 'test renommé' })
      show('après renommage')
      log('fichier gardé :', exists(join(gameDirOf(first.id), 'marker.txt')) ? 'oui' : 'NON')
      app.quit()
    })
  }
  // Test du ménage des créations : ALORIA_TEST_CLEANUP=<profil> installe un datapack et un pack de textures dans ce profil
  // (et ses mondes), les renomme puis les supprime : plus aucun fichier ne doit rester (journal [cleanup-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_CLEANUP) {
    win.webContents.once('did-finish-load', async () => {
      const profileId = process.env.ALORIA_TEST_CLEANUP!
      const log = (...args: unknown[]) => console.log('[cleanup-test]', ...args)
      const { readdir, readFile } = await import('node:fs/promises')
      const { syncDatapacks } = await import('./game/datapacks')
      const gameDir = gameDirOf(profileId)
      // Fichiers « Aloria - Ménage… » restants : profil, mondes, liste des packs actifs
      const leftovers = async () => {
        const found: string[] = []
        const scan = async (dir: string) => found.push(...(await readdir(dir).catch(() => [] as string[])).filter((f) => f.includes('Ménage')).map((f) => join(dir, f)))
        await scan(join(gameDir, 'datapacks'))
        await scan(join(gameDir, 'resourcepacks'))
        for (const w of await readdir(join(gameDir, 'saves')).catch(() => [] as string[])) await scan(join(gameDir, 'saves', w, 'datapacks'))
        const options = await readFile(join(gameDir, 'options.txt'), 'utf8').catch(() => '')
        if (options.includes('Ménage')) found.push('options.txt')
        return found
      }
      try {
        const dp = await createDatapack('Ménage A', (await resolveVersionId(getProfile(profileId).versionId)))
        await installDatapack(dp.id, profileId, true)
        await syncDatapacks(gameDir)
        log('datapack installé :', (await leftovers()).length, 'fichier(s)')
        await saveDatapack({ ...(await listDatapacks()).find((d) => d.id === dp.id)!, name: 'Ménage B' })
        log('datapack renommé :', (await leftovers()).map((f) => f.split(/[\\/]/).slice(-3).join('/')).join(' | '))
        await deleteDatapack(dp.id)
        log('datapack supprimé → restes :', (await leftovers()).length)

        const pack = await createPack('Ménage A')
        await installPack(pack.id, profileId, {})
        log('pack installé :', (await leftovers()).length, 'fichier(s)')
        await renamePack(pack.id, 'Ménage B')
        log('pack renommé :', (await leftovers()).map((f) => f.split(/[\\/]/).slice(-2).join('/')).join(' | '))
        await deletePack(pack.id)
        const rest = await leftovers()
        log('pack supprimé → restes :', rest.length, rest.join(' | '))
        log(rest.length === 0 ? 'OK' : 'ÉCHEC')
      } catch (err) {
        log('erreur', err)
      }
      app.quit()
    })
  }
  // Test de la mise à jour des modpacks (avec ALORIA_ROOT=<.aloria de test>) : ALORIA_TEST_MODPACK=<projet Modrinth> installe
  // l'avant-dernière version, désactive un mod, modifie une config, ajoute un mod à la main et oublie aloria-modpack.json (profil
  // d'avant), puis met à jour : le mod reste désactivé, la config et le mod ajouté restent, aucun doublon (journal [modpack-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_MODPACK && process.env.ALORIA_ROOT) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[modpack-test]', ...args)
      const { readdir, readFile, rename, rm, writeFile } = await import('node:fs/promises')
      const { existsSync: exists } = await import('node:fs')
      const { modpackVersions } = await import('./modrinth/modpack')
      const projectId = process.env.ALORIA_TEST_MODPACK!
      try {
        const versions = (await modpackVersions(projectId)).filter((v) => v.supported && v.stable)
        const [latest, previous] = versions
        log('versions :', previous.versionNumber, '→', latest.versionNumber)
        const profile = await installModpack({ kind: 'modrinth', projectId, versionId: previous.id }, () => {})
        const gameDir = gameDirOf(profile.id)
        const mods = join(gameDir, 'mods')
        const index = JSON.parse(await readFile(join(gameDir, 'aloria-content.json'), 'utf8')) as Record<string, { projectId?: string }>
        const disabled = Object.keys(index).find((f) => f.endsWith('.jar'))!
        await rename(join(mods, disabled), join(mods, disabled + '.disabled'))
        await writeFile(join(mods, 'ajout-a-la-main.jar'), 'test')
        const configs = await readdir(join(gameDir, 'config')).catch(() => [] as string[])
        const config = configs.find((f) => f.endsWith('.json') || f.endsWith('.toml') || f.endsWith('.properties'))
        if (config) await writeFile(join(gameDir, 'config', config), 'modifié par le joueur')
        await rm(join(gameDir, 'aloria-modpack.json'))
        log('installé :', (await readdir(mods)).length, 'fichiers dans mods ; désactivé :', disabled, '; config modifiée :', config ?? '(aucune)')

        const found = await modpackUpdate(profile.id)
        log('nouvelle version trouvée :', found?.versionNumber ?? 'AUCUNE')
        const updated = await updateModpack(profile.id, { kind: 'modrinth', projectId, versionId: latest.id }, () => {})
        const after = await readdir(mods)
        const newIndex = JSON.parse(await readFile(join(gameDir, 'aloria-content.json'), 'utf8')) as Record<string, { projectId?: string }>
        const disabledProject = index[disabled].projectId
        const disabledNow = after.filter((f) => f.endsWith('.disabled') && newIndex[f.replace(/\.disabled$/, '')]?.projectId === disabledProject)
        const byProject = new Map<string, number>()
        for (const f of after) {
          const id = newIndex[f.replace(/\.disabled$/, '')]?.projectId
          if (id) byProject.set(id, (byProject.get(id) ?? 0) + 1)
        }
        const doubles = [...byProject].filter(([, n]) => n > 1)
        const configKept = !config || (await readFile(join(gameDir, 'config', config), 'utf8')) === 'modifié par le joueur'
        const checks = {
          profil: updated.modpack?.versionId === latest.id && updated.versionId === latest.gameVersions[0],
          desactiveGarde: disabledNow.length === 1 || !after.some((f) => newIndex[f.replace(/\.disabled$/, '')]?.projectId === disabledProject),
          ajoutGarde: after.includes('ajout-a-la-main.jar'),
          configGardee: configKept,
          sansDoublon: doubles.length === 0,
          manifeste: exists(join(gameDir, 'aloria-modpack.json')),
          aJour: (await modpackUpdate(profile.id)) === null
        }
        log('après :', after.length, 'fichiers ; Minecraft', updated.versionId, '; désactivé :', disabledNow.join(', ') || '(mod retiré par le modpack)')
        log(JSON.stringify(checks))
        log(Object.values(checks).every(Boolean) ? 'OK' : 'ÉCHEC')
        await deleteProfile(profile.id, true)
      } catch (err) {
        log('erreur', err)
      }
      app.quit()
    })
  }
  // Test de la vérification des mods (avec ALORIA_ROOT=<.aloria de test>) : ALORIA_TEST_MODCHECK="fabric:1.21.1,neoforge:1.21.1"
  // installe REI (qui demande Architectury et Cloth Config), supprime une dépendance et en désactive une autre, puis vérifie,
  // répare et revérifie : plus rien ne doit manquer (journal [modcheck-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_MODCHECK && process.env.ALORIA_ROOT) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[modcheck-test]', ...args)
      const { rm, rename } = await import('node:fs/promises')
      const { listInstalled } = await import('./modrinth/content')
      for (const spec of process.env.ALORIA_TEST_MODCHECK!.split(',').filter(Boolean)) {
        const [loader, versionId] = spec.split(':') as [Profile['loader'], string]
        // « modpack:<projet> » : un modpack complet qui marche, la vérification ne doit rien trouver
        if (loader === ('modpack' as string)) {
          try {
            const { modpackVersions } = await import('./modrinth/modpack')
            const version = (await modpackVersions(versionId)).find((v) => v.supported)!
            const profile = await installModpack({ kind: 'modrinth', projectId: versionId, versionId: version.id }, () => {})
            const started = Date.now()
            const check = await checkMods(profile.id)
            log(spec, `${profile.loader} ${profile.versionId}, vérification (${Date.now() - started} ms) :`, check ? JSON.stringify(check.missing.map((m) => [m.id, m.requiredBy.map((r) => r.title)])) : 'rien ne manque')
            log(spec, check ? 'ÉCHEC' : 'OK')
            await deleteProfile(profile.id, true)
          } catch (err) {
            log(spec, 'erreur', err)
          }
          continue
        }
        try {
          const profile = createProfile({ name: `Test mods ${loader}`, icon: '🧪', versionId, loader, loaderVersion: null, ramMb: null })
          await installContent(profile.id, 'rei', 'mod')
          const mods = join(gameDirOf(profile.id), 'mods')
          const deps = (await listInstalled(profile.id)).filter((m) => m.auto)
          log(spec, 'installé :', (await listInstalled(profile.id)).map((m) => m.title).join(', '))
          if (deps[0]) await rm(join(mods, deps[0].fileName))
          if (deps[1]) await rename(join(mods, deps[1].fileName), join(mods, deps[1].fileName + '.disabled'))
          let started = Date.now()
          const check = await checkMods(profile.id)
          log(spec, `vérification (${Date.now() - started} ms) :`, JSON.stringify(check?.missing.map((m) => ({ id: m.id, par: m.requiredBy.map((r) => r.title), fix: m.fix.kind === 'none' ? 'aucune' : `${m.fix.kind} ${m.fix.title}` }))))
          if (check) await fixMods(profile.id, check, false)
          started = Date.now()
          const after = await checkMods(profile.id)
          log(spec, `après réparation (${Date.now() - started} ms) :`, after ? JSON.stringify(after.missing.map((m) => m.id)) : 'rien ne manque')
          log(spec, check && check.missing.every((m) => m.fix.kind !== 'none') && !after ? 'OK' : 'ÉCHEC')
          await deleteProfile(profile.id, true)
        } catch (err) {
          log(spec, 'erreur', err)
        }
      }
      app.quit()
    })
  }
  // Test des sauvegardes de mondes (avec ALORIA_ROOT=<.aloria de test>) : ALORIA_TEST_WORLDS=1 crée un monde, le « joue » plusieurs
  // fois (sauvegardes automatiques, 5 gardées), le restaure, le supprime puis le récupère (journal [worlds-test])
  if (!app.isPackaged && process.env.ALORIA_TEST_WORLDS && process.env.ALORIA_ROOT) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[worlds-test]', ...args)
      const { mkdir, readFile, rm, utimes, writeFile } = await import('node:fs/promises')
      const { gzipSync } = await import('node:zlib')
      const { writeNbt } = await import('./shared/nbt')
      const wb = await import('./worldBackups')
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      try {
        const profile = createProfile({ name: 'Test mondes', icon: '🧪', versionId: '1.21.1', loader: 'vanilla', loaderVersion: null, ramMb: null })
        const world = join(gameDirOf(profile.id), 'saves', 'Monde')
        await mkdir(join(world, 'region'), { recursive: true })
        const data = new Map([['LevelName', { type: 8 as const, value: 'Mon monde' }]])
        await writeFile(join(world, 'level.dat'), gzipSync(writeNbt(new Map([['Data', { type: 10 as const, value: data }]]))))
        const play = async (content: string) => {
          await writeFile(join(world, 'region', 'r.0.0.mca'), content)
          const now = new Date()
          await utimes(join(world, 'level.dat'), now, now)
          await wb.backupAfterPlay(profile.id)
          await sleep(1100)
        }
        const count = async () => (await wb.listWorldBackups(profile.id))[0]?.backups.length ?? 0
        await play('A')
        await wb.backupAfterPlay(profile.id)
        const afterSame = await count()
        for (const c of ['B', 'C', 'D', 'E', 'F', 'G']) await play(c)
        const list = await wb.listWorldBackups(profile.id)
        log('après 7 parties :', list[0].name, list[0].backups.length, 'sauvegardes', list[0].backups.map((b) => b.kind).join(','))
        const oldest = list[0].backups[list[0].backups.length - 1]
        await wb.restoreWorld(profile.id, 'Monde', oldest.file)
        const restored = await readFile(join(world, 'region', 'r.0.0.mca'), 'utf8')
        const kinds = (await wb.listWorldBackups(profile.id))[0].backups.map((b) => b.kind)
        await rm(world, { recursive: true })
        const gone = await wb.listWorldBackups(profile.id)
        await wb.restoreWorld(profile.id, 'Monde', gone[0].backups[0].file)
        const back = await readFile(join(world, 'region', 'r.0.0.mca'), 'utf8').catch(() => '(absent)')
        const checks = {
          pasDeDoublon: afterSame === 1,
          rotation: list[0].backups.length === 5,
          restauration: restored === 'C',
          sauvegardeAvantRestauration: kinds.includes('restore'),
          mondeSupprimeListe: gone.length === 1 && !gone[0].exists,
          mondeRecupere: back === 'G'
        }
        log(JSON.stringify(checks), 'contenu restauré :', restored, '/', back)
        log(Object.values(checks).every(Boolean) ? 'OK' : 'ÉCHEC')
        await deleteProfile(profile.id, true)
      } catch (err) {
        log('erreur', err)
      }
      app.quit()
    })
  }
  // Test des recettes en développement : ALORIA_TEST_RECIPES="1.16.5,26.3" lit les items de chaque version et écrit un datapack
  // d'essai (journal [recipes-test]) ; ALORIA_TEST_RECIPES_PROFILE=<id> l'installe dans ce profil (à vérifier en jeu)
  if (!app.isPackaged && process.env.ALORIA_TEST_RECIPES) {
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[recipes-test]', ...args)
      for (const gameVersion of process.env.ALORIA_TEST_RECIPES!.split(',').filter(Boolean)) {
        try {
          const started = Date.now()
          const data = await gameData(gameVersion)
          const kinds: Record<string, number> = {}
          for (const item of data.items) kinds[item.icon.kind] = (kinds[item.icon.kind] ?? 0) + 1
          log(gameVersion, `${data.items.length} items ${JSON.stringify(kinds)}, ${Object.keys(data.textures).length} textures,`,
            `${Object.keys(data.tags).length} tags, ${data.recipes.length} recettes, postes ${data.kinds.join('/')}, ${Date.now() - started} ms`)
          log(gameVersion, 'exemples', data.items.slice(0, 3).map((i) => i.name).join(', '), '·', data.items.filter((i) => i.name === i.id.slice(10)).length, 'sans nom')
          log(gameVersion, 'sans icône', data.items.filter((i) => i.icon.kind === 'none').map((i) => i.id.slice(10)).join(', '))
          // Icône vide : modèle sans aucune face texturée
          const empty = data.items.filter((i) => i.icon.kind === 'model' && i.icon.elements.every((el) => Object.keys(el.faces).length === 0))
          log(gameVersion, 'icône vide', empty.map((i) => i.id.slice(10)).join(', '))
          const query = process.env.ALORIA_TEST_RECIPES_ITEMS
          if (query) for (const i of data.items.filter((it) => it.name.toLowerCase().includes(query))) log(gameVersion, 'item', i.id, i.name, JSON.stringify(i.icon).slice(0, 300))
          const dp = await createDatapack('Test recettes', gameVersion)
          const furnace = data.recipes.find((r) => r.id === 'minecraft:furnace')!
          dp.recipes = [
            { ...furnace, grid: furnace.grid!.map((c, i) => (i === 4 ? ['minecraft:coal'] : c)) },
            { id: 'aloria:diamond', kind: 'shaped', grid: [['#minecraft:planks'], null, null, null, ['minecraft:dirt', 'minecraft:stone'], null, null, null, null], result: 'minecraft:diamond', count: 3 },
            { id: 'aloria:emerald', kind: 'shapeless', ingredients: [['minecraft:dirt'], ['#minecraft:wool', 'minecraft:sand']], result: 'minecraft:emerald', count: 1 },
            { id: 'aloria:gold_ingot', kind: 'smelting', input: ['minecraft:cobblestone'], result: 'minecraft:gold_ingot', count: 1, experience: 1, cookingTime: 100 },
            { id: 'aloria:obsidian', kind: 'stonecutting', input: ['minecraft:stone'], result: 'minecraft:obsidian', count: 2 },
            { id: 'aloria:cherry', kind: 'campfire', input: ['minecraft:cherry_log'], result: 'minecraft:charcoal', count: 1 }
          ]
          // Variantes (1.20.5+) : potion et livre enchanté en résultat
          const ids = new Set(data.items.map((i) => i.id))
          if (ids.has('minecraft:potion@strong_healing')) dp.recipes.push({ id: 'aloria:potion_strong_healing', kind: 'shapeless', ingredients: [['minecraft:glistering_melon_slice'], ['minecraft:glass_bottle']], result: 'minecraft:potion@strong_healing', count: 1 })
          if (ids.has('minecraft:enchanted_book@sharpness:5')) dp.recipes.push({ id: 'aloria:enchanted_book_sharpness_5', kind: 'smelting', input: ['minecraft:book'], result: 'minecraft:enchanted_book@sharpness:5', count: 1, experience: 1, cookingTime: 100 })
          log(gameVersion, 'variantes', data.items.filter((i) => i.id.includes('@')).length, data.items.filter((i) => i.id.includes('@')).slice(0, 4).map((i) => i.name).join(' · '))
          dp.removed = ['minecraft:piston', 'minecraft:stick']
          await saveDatapack(dp)
          const file = join(app.getPath('temp'), `aloria-recipes-${gameVersion}.zip`)
          log(gameVersion, 'ignorées', JSON.stringify(await exportDatapack(dp.id, file)))
          const AdmZip = (await import('adm-zip')).default
          for (const entry of new AdmZip(file).getEntries()) log(gameVersion, entry.entryName, entry.getData().toString('utf8').replace(/\s+/g, ' '))
          if (process.env.ALORIA_TEST_RECIPES_PROFILE) log(gameVersion, 'profil', JSON.stringify(await installDatapack(dp.id, process.env.ALORIA_TEST_RECIPES_PROFILE, true)))
          else await deleteDatapack(dp.id)
        } catch (err) {
          log(gameVersion, 'erreur', err)
        }
      }
      if (!process.env.ALORIA_TEST_RECIPES_KEEP) app.quit()
    })
  }
  // Test des serveurs en développement : ALORIA_TEST_SERVER="fabric:26.3,paper:1.21.11" crée chaque serveur, le démarre,
  // attend qu'il soit en ligne (et son adresse e4mc), l'arrête, le supprime, puis quitte
  // Test des adresses au choix : attend que <nom>.aloriamc.fr soit relié au tunnel, puis visible des DNS publics
  const waitCustomAddress = async (id: string): Promise<string | undefined> => {
    const end = Date.now() + 180_000
    let st = serverStatuses().find((s) => s.id === id)
    while (Date.now() < end && !st?.customAddress && !st?.customAddressError) {
      await new Promise((r) => setTimeout(r, 1000))
      st = serverStatuses().find((s) => s.id === id)
    }
    console.log(`[address-test] relié → ${st?.customAddress ?? `ÉCHEC ${st?.customAddressError}`}`)
    if (!st?.customAddress) return undefined
    const { Resolver } = await import('node:dns/promises')
    const resolver = new Resolver({ timeout: 3000, tries: 1 })
    resolver.setServers(['1.1.1.1'])
    while (Date.now() < end && !(await resolver.resolveSrv(`_minecraft._tcp.${st.customAddress}`).catch(() => [])).length) {
      await new Promise((r) => setTimeout(r, 3000))
    }
    const [srv] = await resolver.resolveSrv(`_minecraft._tcp.${st.customAddress}`).catch(() => [])
    console.log(`[address-test] SRV → ${srv ? `${srv.name}:${srv.port}` : 'absent'}`)
    return st.customAddress
  }
  if (!app.isPackaged && process.env.ALORIA_TEST_SERVER) {
    win.webContents.once('did-finish-load', async () => {
      for (const item of process.env.ALORIA_TEST_SERVER!.split(',').filter(Boolean)) {
        const [type, gameVersion] = item.split(':') as [ServerInput['type'], string]
        const server = await createServer({
          name: `Test ${item}`,
          icon: '🧪',
          type,
          gameVersion,
          loaderVersion: null,
          ramMb: 2048,
          port: freePort(),
          // ALORIA_TEST_SERVER_TUNNEL=playit : tunnel playit (compte relié) au lieu d'e4mc
          tunnel: process.env.ALORIA_TEST_SERVER_TUNNEL === 'playit' ? 'playit' : e4mcSupported(type, gameVersion) ? 'e4mc' : 'none'
        })
        // Rejoindre depuis le profil de démo (sans compte) : le serveur ne doit pas vérifier les comptes
        if (process.env.ALORIA_TEST_SERVER_JOIN) await writeProperties(server.id, { 'online-mode': 'false', 'white-list': 'false' })
        // ALORIA_TEST_SERVER_ADDRESS=<nom> : adresse <nom>.aloriamc.fr réservée par le Worker (compte actif), libérée à la fin
        if (process.env.ALORIA_TEST_SERVER_ADDRESS) {
          const problem = await setCustomAddress(server.id, process.env.ALORIA_TEST_SERVER_ADDRESS).catch((err) => String(err))
          console.log(`[address-test] réservation de ${process.env.ALORIA_TEST_SERVER_ADDRESS} → ${problem ?? 'OK'}`)
          for (const bad of ['ab', 'admin', 'Nom Avec Espaces']) console.log(`[address-test] « ${bad} » → ${await checkAddress(bad).catch(String)}`)
        }
        const started = Date.now()
        try {
          // ALORIA_TEST_SERVER_EARLYSTOP=1 : arrêt demandé en plein démarrage (monde en création), puis redémarrage
          if (process.env.ALORIA_TEST_SERVER_EARLYSTOP) {
            await startServer(server.id)
            await new Promise((r) => setTimeout(r, 3000))
            await stopServer(server.id)
            console.log(`[server-test] ${item} : arrêt pendant le démarrage → ${serverLog(server.id).some((l) => /\]: Done \(/.test(l)) ? 'attendu la fin du démarrage' : 'PAS attendu'}`)
          }
          await startServer(server.id)
          let status = serverStatuses().find((s) => s.id === server.id)
          while (Date.now() - started < 600_000) {
            status = serverStatuses().find((s) => s.id === server.id)
            const ready = status?.state === 'running' && (server.tunnel === 'none' || status.publicAddress)
            if (ready || status?.state === 'stopped') break
            await new Promise((r) => setTimeout(r, 1000))
          }
          console.log(`[server-test] ${item} : ${status?.state} en ${Math.round((Date.now() - started) / 1000)} s, adresse ${status?.publicAddress ?? '-'}`)
          if (status?.state !== 'running') console.log(`[server-test] ${item} : ÉCHEC\n${serverLog(server.id).slice(-15).join('\n')}`)
          // ALORIA_TEST_SERVER_BACKUP=1 : sauvegarde pendant que le serveur tourne
          if (process.env.ALORIA_TEST_SERVER_BACKUP && status?.state === 'running') {
            const file = await backupServer(server.id, 'manual')
            console.log(`[server-test] ${item} : sauvegarde ${file}`, JSON.stringify(await listBackups(server.id)))
          }
          // ALORIA_TEST_SERVER_JOIN=<profil> : lance ce profil, qui doit arriver sur le serveur (mode crack pour la démo)
          const joinProfile = process.env.ALORIA_TEST_SERVER_JOIN
          if (joinProfile && status?.state === 'running') {
            sendCommand(server.id, 'whitelist off')
            // ALORIA_TEST_SERVER_AUTOLOGIN=1 : mot de passe pour ce serveur ; le serveur demande le /login dès l'arrivée
            const autoLogin = !!process.env.ALORIA_TEST_SERVER_AUTOLOGIN
            if (autoLogin) process.env.ALORIA_TEST_AUTOLOGIN = JSON.stringify({ [`localhost:${server.port}`]: 'aloria-test' })
            // Adresse au choix : on rejoint par <nom>.aloriamc.fr, sur le port 25565 (le seul pour lequel le jeu cherche un SRV)
            const custom = process.env.ALORIA_TEST_SERVER_ADDRESS ? await waitCustomAddress(server.id) : undefined
            await play(win.webContents, joinProfile, custom ? { host: custom, port: 25565 } : { host: 'localhost', port: server.port })
            const end = Date.now() + 240_000
            while (Date.now() < end && !serverLog(server.id).some((l) => /joined the game/.test(l))) await new Promise((r) => setTimeout(r, 500))
            const joined = serverLog(server.id).find((l) => /joined the game|lost connection|Disconnecting/.test(l))
            console.log(`[server-test] ${item} : rejoindre → ${joined ?? 'personne'}`)
            if (autoLogin && joined && /joined/.test(joined)) {
              sendCommand(server.id, 'tellraw @a "Connecte-toi avec /login <mot de passe>"')
              await new Promise((r) => setTimeout(r, 8000))
              const { readFile } = await import('node:fs/promises')
              const log = await readFile(join(gameDirOf(joinProfile), 'logs', 'latest.log'), 'utf8').catch(() => '')
              const sent = (log.match(/Connexion automatique envoyée/g) ?? []).length
              console.log(`[server-test] ${item} : connexion automatique → ${sent === 1 ? 'OK (1 envoi)' : `ÉCHEC (${sent} envois)`}, mot de passe affiché par le jeu : ${/\[CHAT\].*aloria-test(?!<--)/.test(log) ? 'OUI (ÉCHEC)' : 'non'} (le serveur de test, sans /login, le renvoie dans son erreur)`)
              delete process.env.ALORIA_TEST_AUTOLOGIN
            }
          }
          // ALORIA_TEST_SERVER_PROFILE=1 : profil du serveur (avec ses mods) et pack pour les amis réimporté, puis effacés
          if (process.env.ALORIA_TEST_SERVER_PROFILE && status?.state === 'running') {
            if (type === 'fabric') await installServerContent(server.id, 'lithium', true)
            const profile = await createServerProfile(server.id)
            const { readdir: list } = await import('node:fs/promises')
            const readdir = (dir: string) => list(dir).catch(() => [] as string[])
            console.log(`[server-test] ${item} : profil ${profile.name} ${profile.loader} ${profile.versionId}, mods ${(await readdir(join(gameDirOf(profile.id), 'mods'))).join(', ')}`)
            const pack = join(app.getPath('temp'), 'aloria-test-pack.zip')
            await writeServerPack(server.id, pack)
            const friend = await importInstance(pack)
            console.log(`[server-test] ${item} : pack importé → ${friend.name} ${friend.loader} ${friend.versionId}, mods ${(await readdir(join(gameDirOf(friend.id), 'mods'))).join(', ')}`)
            await deleteProfile(friend.id, true)
            await deleteProfile(profile.id, true)
          }
          // ALORIA_TEST_SERVER_COMMAND="e4mc" : commande envoyée une fois en ligne (la vérification de permission d'e4mc
          // plantait en 26.x à la connexion d'un joueur)
          const command = process.env.ALORIA_TEST_SERVER_COMMAND
          if (command && status?.state === 'running') {
            sendCommand(server.id, command)
            await new Promise((r) => setTimeout(r, 4000))
            const errors = serverLog(server.id).filter((l) => /NoSuchMethodError|Exception/.test(l))
            console.log(`[server-test] ${item} : commande ${command} → ${errors.length === 0 ? 'OK' : 'ÉCHEC'}\n${serverLog(server.id).slice(-6).join('\n')}`)
          }
        } catch (err) {
          console.log(`[server-test] ${item} : ÉCHEC`, err)
        }
        await stopServer(server.id)
        // ALORIA_TEST_SERVER_BREAK=1 : monde abîmé (réglages de génération retirés) : le serveur doit être coupé avec un message
        if (process.env.ALORIA_TEST_SERVER_BREAK) {
          const { rm } = await import('node:fs/promises')
          await rm(join(serverDirOf(server.id), 'world', 'dimensions', 'minecraft', 'overworld', 'data', 'minecraft', 'world_gen_settings.dat'), { force: true })
          const t0 = Date.now()
          await startServer(server.id)
          let st = serverStatuses().find((x) => x.id === server.id)
          while (Date.now() - t0 < 180_000 && st?.state !== 'stopped') {
            await new Promise((r) => setTimeout(r, 1000))
            st = serverStatuses().find((x) => x.id === server.id)
          }
          console.log(`[server-test] ${item} : monde abîmé → ${st?.state} en ${Math.round((Date.now() - t0) / 1000)} s, erreur : ${st?.error}`)
        }
        // Restauration de la sauvegarde faite plus haut, serveur éteint
        if (process.env.ALORIA_TEST_SERVER_BACKUP) {
          const [last] = await listBackups(server.id)
          if (last) {
            await restoreBackup(server.id, last.file)
            const after = await listBackups(server.id)
            const { existsSync } = await import('node:fs')
            console.log(`[server-test] ${item} : restauration → monde ${existsSync(join(serverDirOf(server.id), 'world', 'level.dat')) ? 'présent' : 'ABSENT'}, sauvegardes ${after.map((b) => b.kind).join(', ')}`)
          }
        }
        if (!process.env.ALORIA_TEST_SERVER_KEEP) {
          if (server.tunnel === 'playit') await deleteTunnel(server).catch(() => undefined)
          const address = getServer(server.id).customAddress
          if (address) await releaseCustomAddress(address).catch((err) => console.log('[address-test]', err))
          await deleteServer(server.id)
        }
      }
      app.quit()
    })
  }
  // Test d'un serveur créé depuis un modpack : ALORIA_TEST_SERVER_MODPACK=<projet> (Modrinth, ou « cf:<id> ») prend sa dernière
  // version, crée le serveur, le démarre et attend qu'il soit en ligne (journal [server-modpack-test]). Les mods à télécharger
  // à la main sont cherchés dans ALORIA_TEST_DOWNLOADS (à la place de Téléchargements) ; sans eux, leur liste est affichée
  if (!app.isPackaged && process.env.ALORIA_TEST_SERVER_MODPACK) {
    if (process.env.ALORIA_TEST_DOWNLOADS) app.setPath('downloads', process.env.ALORIA_TEST_DOWNLOADS)
    win.webContents.once('did-finish-load', async () => {
      const log = (...args: unknown[]) => console.log('[server-modpack-test]', ...args)
      const projectId = process.env.ALORIA_TEST_SERVER_MODPACK!
      try {
        const [latest] = (await modpackVersions(projectId)).filter((v) => v.supported)
        const source: ModpackSource = { kind: 'modrinth', projectId, versionId: latest.id }
        const preview = await previewModpack(source)
        log(preview.name, latest.versionNumber, preview.gameVersion, preview.loader, preview.loaderVersion, preview.files.length, 'fichiers')
        const missing = preview.manual.filter((m) => !m.found)
        if (missing.length > 0) {
          log('à télécharger à la main :', JSON.stringify(missing.map((m) => ({ fileName: m.fileName, url: m.url }))))
          return app.quit()
        }
        const server = await installModpackServer(source, () => {})
        const { readdir } = await import('node:fs/promises')
        log('serveur créé :', (await readdir(join(serverDirOf(server.id), 'mods'))).filter((f) => f.endsWith('.jar')).length, 'mods')
        const started = Date.now()
        await startServer(server.id)
        let status = serverStatuses().find((s) => s.id === server.id)
        while (Date.now() - started < 900_000 && status?.state !== 'running' && status?.state !== 'stopped') {
          await new Promise((r) => setTimeout(r, 1000))
          status = serverStatuses().find((s) => s.id === server.id)
        }
        log(`${status?.state} en ${Math.round((Date.now() - started) / 1000)} s`, status?.error ?? '')
        if (status?.state !== 'running') log(`ÉCHEC\n${serverLog(server.id).slice(-40).join('\n')}`)
        await stopServer(server.id)
        if (!process.env.ALORIA_TEST_SERVER_KEEP) await deleteServer(server.id)
        else log('serveur gardé :', serverDirOf(server.id))
      } catch (err) {
        log('erreur', err)
      }
      app.quit()
    })
  }
  // Captures du créateur de recettes : ALORIA_CAPTURE_RECIPES=<dossier> crée un datapack (version ALORIA_CAPTURE_RECIPES_VERSION,
  // 26.3 sinon), y ajoute une recette du jeu et une nouvelle, photographie le tout puis le supprime
  if (!app.isPackaged && process.env.ALORIA_CAPTURE_RECIPES) {
    const dir = process.env.ALORIA_CAPTURE_RECIPES
    win.webContents.setBackgroundThrottling(false)
    win.webContents.once('did-finish-load', async () => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(dir, { recursive: true })
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const L = (key: MessageKey) => translate(getSettings().language ?? 'fr', key)
      const js = (code: string) => win.webContents.executeJavaScript(code)
      const click = (label: string) => js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(label)}))?.click()`)
      const type = (selector: string, value: string) =>
        js(`(() => { const i = document.querySelector(${JSON.stringify(selector)});
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
          i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      const snap = async (name: string) => {
        win.webContents.invalidate()
        await wait(300)
        await writeFile(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG())
      }
      const item = (id: string) => js(`[...document.querySelectorAll('.item-cell')].find((b) => b.title.endsWith(${JSON.stringify(id)}))?.click()`)
      await wait(2500)
      await click(L('nav.creations'))
      await wait(600)
      await click(L('creations.tool.recipes'))
      await wait(400)
      await snap('1-hub')
      await click(L('creations.createDatapack'))
      await wait(400)
      await type('.dialog input', 'Capture recettes')
      const version = process.env.ALORIA_CAPTURE_RECIPES_VERSION ?? '26.3'
      await js(`document.querySelector('.dialog .select')?.click()`)
      await wait(300)
      await js(`[...document.querySelectorAll('.select-list li, .select__option, [role=option]')].find((o) => o.textContent.trim() === 'Minecraft ${version}')?.click()`)
      await wait(300)
      await js(`document.querySelector('.dialog .primary')?.click()`)
      await wait(9000)
      await snap('2-vide')
      await click(L('rc.editGame'))
      await wait(500)
      await type('.vanilla-picker input', L('rc.station.smelting'))
      await wait(500)
      await snap('3-recettes-du-jeu')
      await js(`document.querySelector('.vanilla-picker__list .recipe-row')?.click()`)
      await wait(800)
      await snap('4-four')
      await click(`+ ${L('rc.new')}`)
      await wait(500)
      for (const id of ['minecraft:diamond', 'minecraft:stick', 'minecraft:oak_stairs', 'minecraft:grass_block', 'minecraft:oak_leaves', 'minecraft:torch', 'minecraft:chest', 'minecraft:stone_slab', 'minecraft:oak_fence']) {
        await item(id)
        await wait(80)
      }
      await js(`document.querySelector('.mc-slot.big')?.click()`)
      await wait(100)
      await item('minecraft:emerald')
      await wait(600)
      await snap('5-nouvelle')
      await click(L('rc.shortcuts'))
      await wait(400)
      await snap('6-raccourcis')
      await js(`document.querySelector('.popover-backdrop')?.click()`)
      await click(L('rc.gameRecipes'))
      await wait(500)
      await type('.vanilla-picker input', 'piston')
      await wait(400)
      await click(L('rc.removeGame'))
      await wait(400)
      await snap('7-supprimer')
      // Icônes particulières : têtes de mobs (dessinées à part par le jeu) et noyau lourd
      await js(`document.querySelector('.popover-backdrop, .overlay')?.click()`)
      await wait(300)
      for (const [name, query] of [['8-tetes', 'tête'], ['9-noyau', 'noyau'], ['10-cranes', 'crâne'], ['11-potions', 'potion'], ['12-livres', 'affilage']]) {
        await type('.search-bar input', query)
        await wait(700)
        await snap(name)
      }
      const res = await listDatapacks()
      for (const dp of res.filter((d) => d.name === 'Capture recettes')) await deleteDatapack(dp.id)
      app.quit()
    })
  }
  // ALORIA_CAPTURE_CONFIRM=<image.png> : capture de la fenêtre de confirmation du launcher (askConfirm), puis fermeture
  if (!app.isPackaged && process.env.ALORIA_CAPTURE_CONFIRM) {
    win.webContents.once('did-finish-load', async () => {
      const { writeFile } = await import('node:fs/promises')
      await new Promise((r) => setTimeout(r, 2500))
      const lang = getSettings().language ?? 'fr'
      const message = translate(lang, 'quick.deleteConfirm', { name: 'Minecraft Server' })
      win.webContents.executeJavaScript(`window.aloriaAskConfirm(${JSON.stringify(message)}, { confirmLabel: ${JSON.stringify(translate(lang, 'common.delete'))} })`)
      await new Promise((r) => setTimeout(r, 800))
      await writeFile(process.env.ALORIA_CAPTURE_CONFIRM!, (await win.webContents.capturePage()).toPNG())
      app.quit()
    })
  }
  // Captures de la page Serveurs en développement : ALORIA_CAPTURE_SERVERS=<dossier> crée un serveur Fabric de test,
  // le démarre et photographie la liste, la fiche (console, adresse) et la fenêtre de création, puis le supprime
  if (!app.isPackaged && process.env.ALORIA_CAPTURE_SERVERS) {
    const dir = process.env.ALORIA_CAPTURE_SERVERS
    // Fenêtre pas au premier plan pendant le test : sans ça, elle se redessine au ralenti et les captures ont du retard
    win.webContents.setBackgroundThrottling(false)
    win.webContents.once('did-finish-load', async () => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      await mkdir(dir, { recursive: true })
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const lang = getSettings().language ?? 'fr'
      const click = (label: string) =>
        win.webContents.executeJavaScript(
          `[...document.querySelectorAll('button, .profile-card')].find((b) => b.textContent.includes(${JSON.stringify(label)}))?.click()`
        )
      const snap = async (name: string) => {
        win.webContents.invalidate()
        await wait(300)
        await writeFile(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG())
      }
      // ALORIA_CAPTURE_SERVERS_TYPE="paper:1.21.11:playit" : autre type de serveur (Fabric 26.3 avec e4mc sinon)
      const [type, gameVersion, tunnel] = (process.env.ALORIA_CAPTURE_SERVERS_TYPE ?? 'fabric:26.3:e4mc').split(':') as [
        ServerInput['type'],
        string,
        ServerInput['tunnel']
      ]
      const server = await createServer({
        name: 'Survie entre potes',
        icon: '🏰',
        type,
        gameVersion,
        loaderVersion: null,
        ramMb: 3072,
        port: freePort(),
        tunnel
      })
      await wait(2500)
      await click(translate(lang, 'nav.servers'))
      await wait(800)
      await snap('1-liste')
      await click('Survie entre potes')
      await wait(500)
      // Joueurs et contenu préparés serveur éteint (fichiers modifiés directement)
      await editPlayersOffline(server.id, 'whitelist-add', 'Alykell83').catch((e) => console.log('[capture] liste blanche', e))
      if (type !== 'vanilla') {
        const hits = await searchServerContent(server.id, type === 'paper' ? 'luckperms' : 'lithium')
        console.log('[capture] recherche', hits.slice(0, 3).map((h) => h.title))
        if (hits[0]) await installServerContent(server.id, hits[0].projectId).catch((e) => console.log('[capture] installation', e))
        console.log('[capture] installé', (await listServerContent(server.id)).map((c) => c.title))
      }
      startServer(server.id).catch(() => {})
      for (let i = 0; i < 300; i++) {
        const st = serverStatuses().find((s) => s.id === server.id)
        if (st?.publicAddress || (st?.state === 'running' && st.tunnelError) || (st?.state === 'running' && tunnel === 'none')) break
        await wait(1000)
      }
      // Laisse le temps aux mesures (mémoire, processeur, TPS)
      await wait(9000)
      await snap('2-fiche')
      // ALORIA_CAPTURE_SERVERS_ADDRESS=<nom> : adresse au choix tapée (vérifiée), puis réservée et reliée (compte actif ;
      // libérée à la fin)
      const addressName = process.env.ALORIA_CAPTURE_SERVERS_ADDRESS
      if (addressName && tunnel !== 'none') {
        await click(translate(lang, 'server.custom.choose').replace(' .{domain}', ''))
        await wait(500)
        await win.webContents.executeJavaScript(
          `(() => { const i = document.querySelector('.custom-address__input input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(addressName)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
        )
        await wait(3000)
        await snap('2j-adresse-choix')
        await click(translate(lang, 'server.custom.save'))
        for (let i = 0; i < 60 && !serverStatuses().find((s) => s.id === server.id)?.customAddress; i++) await wait(1000)
        await wait(800)
        await snap('2k-adresse-reliee')
      }
      if (process.env.ALORIA_CAPTURE_PLAYIT_UNLINKED && tunnel === 'playit') {
        await click(translate(lang, 'server.playit.linkButton'))
        await wait(600)
        await snap('2l-playit-liaison')
        await click(translate(lang, 'server.playitSetup.later'))
        await wait(300)
      }
      // « Rejoindre » sur un serveur moddé sans profil : fenêtre du nom du profil
      if (type !== 'paper' && type !== 'vanilla') {
        await click(`🎮 ${translate(lang, 'server.join.button')}`)
        await wait(800)
        await snap('2a-nom-profil')
        await click(translate(lang, 'common.cancel'))
        await wait(300)
      }
      for (const [key, name] of [['server.tab.players', '2b-joueurs'], ['server.tab.settings', '2c-reglages'], [type === 'paper' ? 'server.tab.plugins' : 'server.tab.mods', '2d-contenu'], ['server.tab.backups', '2e-sauvegardes'], ['server.tab.files', '2f-fichiers']] as const) {
        if (name === '2e-sauvegardes') await backupServer(server.id, 'manual')
        await click(translate(lang, key))
        await wait(2500)
        await snap(name)
      }
      // Éditeur : server.properties depuis l'accès rapide
      await click('server.properties')
      await wait(1500)
      await snap('2g-editeur')
      await click(translate(lang, 'common.close'))
      await wait(500)
      await click(type === 'paper' ? 'paper-global.yml' : 'server.properties')
      await wait(1500)
      await snap('2h-editeur-yml')
      await click(translate(lang, 'common.close'))
      await wait(300)
      if (type === 'paper') {
        console.log('[capture] dépendances de WorldGuard', JSON.stringify(await missingDependencies(server.id, 'worldguard').catch((e) => String(e))))
        await click(translate(lang, 'server.tab.plugins'))
        await wait(800)
        await win.webContents.executeJavaScript(
          `(() => { const i = document.querySelector('.manage-search'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'luckperms'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
        )
        await wait(2500)
        await snap('2i-installe')
      }
      console.log('[capture] joueurs', JSON.stringify(await listPlayers(server.id)))
      await click(translate(lang, 'server.tab.console'))
      await wait(300)
      await click(`← ${translate(lang, 'server.back')}`)
      await wait(500)
      await snap('3-liste-en-ligne')
      await click(translate(lang, 'server.new'))
      await wait(1500)
      await snap('4-creation')
      await win.webContents.executeJavaScript(`document.querySelector('.dialog.editor').scrollTop = 99999`)
      await wait(400)
      await snap('5-creation-bas')
      await stopServer(server.id)
      if (tunnel === 'playit') await deleteTunnel(getServer(server.id)).catch(() => undefined)
      const custom = getServer(server.id).customAddress
      if (custom) await releaseCustomAddress(custom).catch((e) => console.log('[capture] adresse', e))
      await deleteServer(server.id)
      app.quit()
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

async function captureScreens(win: BrowserWindow, dir: string): Promise<void> {
  // Langue des captures (ALORIA_CAPTURE_LANG=en) ; sans choix, le français, pour que l'écran du premier lancement ne bloque pas.
  // La langue d'avant est remise à la fin (les réglages sont ceux du vrai launcher)
  const previousLang = getSettings().language
  const previousTheme = getSettings().theme
  const lang: Lang = process.env.ALORIA_CAPTURE_LANG === 'en' ? 'en' : (previousLang ?? 'fr')
  if (previousLang !== lang) updateSettings({ language: lang })
  const L = (key: MessageKey) => translate(lang, key)
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const click = (label: string) =>
    win.webContents.executeJavaScript(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(label)}))?.click()`
    )
  // Image à jour de la fenêtre : on force un nouveau rendu avant (sinon, après la vue 3D de l'accueil, la capture
  // pouvait rester figée sur l'accueil)
  const snap = async () => {
    win.webContents.invalidate()
    await wait(250)
    return win.webContents.capturePage()
  }
  await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
  await wait(2500)
  for (const [theme, label] of [['jour', L('settings.themeDay')], ['nuit', L('settings.themeNight')]]) {
    await click(L('nav.settings'))
    await wait(400)
    await click(label)
    await wait(1200)
    for (const [page, key] of [['Réglages du jeu', 'nav.gamesettings'], ['Paramètres', 'nav.settings'], ['Accueil', 'nav.home']] as const) {
      await click(L(key))
      await wait(800)
      const image = await snap()
      await writeFile(join(dir, `${theme}-${page}.png`), image.toPNG())
      if (page === 'Réglages du jeu') {
        await win.webContents.executeJavaScript('document.querySelector(".content").scrollTop = 99999')
        await wait(400)
        await writeFile(join(dir, `${theme}-${page}-bas.png`), (await snap()).toPNG())
        await win.webContents.executeJavaScript('document.querySelector(".content").scrollTop = 0')
      }
    }
  }
  // Fenêtre « Mon skin » (avec un compte d'exemple, ALORIA_CAPTURE_ACCOUNT)
  if (process.env.ALORIA_CAPTURE_ACCOUNT) {
    await click(L('nav.home'))
    await wait(800)
    await click(L('home.changeSkin'))
    await wait(2500)
    await writeFile(join(dir, 'nuit-skin.png'), (await snap()).toPNG())
    await win.webContents.executeJavaScript(`document.querySelector('.overlay')?.click()`)
    await wait(300)
    // Boutons Solo / Multijoueur, et réglages du premier serveur (rien n'est enregistré : fenêtre refermée sans sauver)
    await writeFile(join(dir, 'nuit-accueil-compte.png'), (await snap()).toPNG())
    await click(L('quick.solo'))
    await wait(1200)
    await writeFile(join(dir, 'nuit-solo.png'), (await snap()).toPNG())
    await win.webContents.executeJavaScript(`document.querySelector('.overlay')?.click()`)
    await wait(300)
    await click(L('quick.multi'))
    await wait(1500)
    await writeFile(join(dir, 'nuit-multi.png'), (await snap()).toPNG())
    await win.webContents.executeJavaScript(`(() => { const gear = document.querySelector('.quick-item__gear'); if (gear) gear.click(); else [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(L('quick.addServer'))}))?.click() })()`)
    await wait(500)
    await win.webContents.executeJavaScript(`(() => { const c = document.querySelector('.dialog.editor input[type=checkbox]'); if (c && !c.checked) c.click() })()`)
    await wait(500)
    await writeFile(join(dir, 'nuit-serveur-reglages.png'), (await snap()).toPNG())
    await click(L('common.cancel'))
    await wait(300)
    await win.webContents.executeJavaScript(`document.querySelector('.overlay')?.click()`)
    await wait(300)
  }
  // Création d'un profil en 1.8.9 (Forge proposé en premier), puis bibliothèque d'un profil Forge (OptiFine)
  // Menus Aloria (composant Select) : ouvre le menu nommé puis choisit l'option dont le texte correspond
  const select = async (name: string, text: string) => {
    await win.webContents.executeJavaScript(`document.querySelector('[data-select=${JSON.stringify(name)}]')?.click()`)
    await wait(300)
    await win.webContents.executeJavaScript(
      `(() => { const items = [...document.querySelectorAll('.select__list li')]
        ;(items.find((li) => li.textContent.trim() === ${JSON.stringify(text)}) ?? items.find((li) => li.textContent.includes(${JSON.stringify(text)})))?.click() })()`
    )
  }
  await click(L('nav.profiles'))
  await wait(600)
  await click(L('profiles.new'))
  await wait(800)
  await select('game-version', '1.8.9')
  await wait(2500)
  await writeFile(join(dir, 'nuit-profil-1.8.9.png'), (await snap()).toPNG())
  // 1.21.1 : NeoForge proposé, avec la liste de ses versions
  await select('game-version', '1.21.1')
  await wait(800)
  await click('NeoForge')
  await wait(2500)
  await writeFile(join(dir, 'nuit-profil-neoforge.png'), (await snap()).toPNG())
  await win.webContents.executeJavaScript(`document.querySelector('.overlay')?.click()`)
  await wait(400)
  await click(L('nav.library'))
  await wait(800)
  await select('library-profile', 'Auto-test 1.8.9 Forge')
  await wait(600)
  await click(L('library.tabMods'))
  await wait(2500)
  await writeFile(join(dir, 'nuit-bibliotheque-forge.png'), (await snap()).toPNG())
  // Menu déroulant ouvert (aspect de la liste)
  await win.webContents.executeJavaScript(`document.querySelector('[data-select="library-profile"]')?.click()`)
  await wait(500)
  await writeFile(join(dir, 'nuit-menu-ouvert.png'), (await snap()).toPNG())
  await win.webContents.executeJavaScript(`document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  // Modpacks : recherche, puis aperçu du premier (liste des mods), fermé sans rien installer
  await click(L('library.tabModpacks'))
  await wait(3000)
  await writeFile(join(dir, 'nuit-modpacks.png'), (await snap()).toPNG())
  await click(L('library.view'))
  await wait(8000)
  await writeFile(join(dir, 'nuit-modpack-apercu.png'), (await snap()).toPNG())
  await click(L('common.cancel'))
  await wait(400)
  // Modpack qui demande des mods CurseForge à télécharger à la main : expliqué et non installable
  await win.webContents.executeJavaScript(`(() => { const i = document.querySelector('.search-bar input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Better MC FORGE BMC4');
    i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await wait(3000)
  await click(L('library.view'))
  await wait(8000)
  await writeFile(join(dir, 'nuit-modpack-bloque.png'), (await snap()).toPNG())
  await click(L('common.cancel'))
  await wait(400)
  // Parties du launcher à masquer (Paramètres)
  await click(L('nav.settings'))
  await wait(600)
  await win.webContents.executeJavaScript(`document.querySelector('.module')?.scrollIntoView({ block: 'center' })`)
  await wait(400)
  await writeFile(join(dir, 'nuit-parametres-modules.png'), (await snap()).toPNG())
  await win.webContents.executeJavaScript('document.querySelector(".content").scrollTop = 0')
  // Profils (carte « Importer un profil ») et export d'un profil, fermé sans rien enregistrer
  await click(L('nav.profiles'))
  await wait(600)
  await writeFile(join(dir, 'nuit-profils.png'), (await snap()).toPNG())
  await win.webContents.executeJavaScript(`document.querySelector('.profile-card__actions .secondary')?.click()`)
  await wait(800)
  await click(L('editor.export'))
  await wait(400)
  await win.webContents.executeJavaScript(`document.querySelector('.export-box')?.scrollIntoView({ block: 'center' })`)
  await wait(300)
  await writeFile(join(dir, 'nuit-profil-export.png'), (await snap()).toPNG())
  await win.webContents.executeJavaScript(`document.querySelector('.overlay')?.click()`)
  await wait(400)
  // Créations (si ALORIA_CAPTURE_PACK est défini) : un pack de test installé dans les profils d'auto-test 26.3 et 1.8.9
  if (process.env.ALORIA_CAPTURE_PACK) {
    await click(L('nav.creations'))
    await wait(800)
    await click(L('creations.create'))
    await wait(400)
    await win.webContents.executeJavaScript(`(() => { const i = document.querySelector('.dialog input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(process.env.ALORIA_CAPTURE_PACK)});
      i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await wait(200)
    await win.webContents.executeJavaScript(`document.querySelector('.dialog .primary')?.click()`)
    await wait(3000)
    await click('×2')
    await wait(2500)
    await click(L('pe.shape.crossdot'))
    await wait(500)
    await click(L('pe.tab.hotbar'))
    await wait(400)
    await click(L('pe.applyTint'))
    await wait(1500)
    await click(L('pe.tab.health'))
    await wait(400)
    await click(L('pe.tint'))
    await wait(1500)
    await click(L('pe.colorize'))
    await wait(1500)
    await click(L('pe.tab.xp'))
    await wait(400)
    await click(L('pe.tint'))
    await wait(1500)
    await writeFile(join(dir, 'nuit-createur-xp.png'), (await snap()).toPNG())
    await click(L('pe.tab.hotbar'))
    await wait(300)
    await click(L('pe.mode.slot'))
    await wait(800)
    await writeFile(join(dir, 'nuit-createur-case.png'), (await snap()).toPNG())
    await click(L('pe.tab.totem'))
    await wait(800)
    await writeFile(join(dir, 'nuit-createur-totem.png'), (await snap()).toPNG())
    await click(L('pe.tab.health'))
    await wait(300)
    await click(L('pe.openPixelEditor'))
    await wait(300)
    await click(L('pe.group.armor'))
    await wait(800)
    await writeFile(join(dir, 'nuit-createur-armure.png'), (await snap()).toPNG())
    await writeFile(join(dir, 'nuit-createur.png'), (await snap()).toPNG())
    for (const profile of ['Auto-test (dev)', 'Auto-test 1.8.9 Fabric']) {
      await select('pack-target', profile)
      await wait(4000)
      await click(L('library.install'))
      await wait(3000)
    }
    await writeFile(join(dir, 'nuit-createur-installe.png'), (await snap()).toPNG())
  }
  // On remet le thème et la langue d'avant
  updateSettings({ theme: previousTheme })
  if (previousLang !== lang) updateSettings({ language: previousLang })
  app.quit()
}
