import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { addAccount, listAccounts, removeAccount, selectAccount } from './auth/accounts'
import { toAuthError } from './auth/errors'
import { getSkin, listCapes, listSavedSkins, removeSavedSkin, resetSkin, setCape, uploadSkin } from './auth/skin'
import { createPack, deletePack, installPack, listPacks, packVanilla, renamePack, savePackImage, setPackScale } from './packs'
import { getStatus, isGameRunning, listVersions, play } from './game/controller'
import { fabricLoaders } from './game/fabric'
import { forgeLoaders } from './game/forge'
import { addOptiFine, installContent, listInstalled, openContentFolder, removeContent, searchContent, setContentEnabled } from './modrinth/content'
import { createPreset, deletePreset, getPreset, listPresets, MAIN_PRESET, renamePreset, updatePresetOptions } from './shared/presets'
import { gameLangOf, translate, type Lang, type MessageKey } from '../shared/i18n'
import { createProfile, deleteProfile, listProfiles, openProfileFolder, selectProfile, updateProfile } from './profiles'
import { getSettings, systemRamMb, updateSettings } from './settings'
import { getUpdateStatus, initUpdater, installUpdate } from './updater'
import { initDiscord, refreshDiscord } from './discord'
import { processPending } from './shared/pending'
import { saveKeyboardLayout } from './shared/options'
import type {
  PackElement,
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

  // Fermer la fenêtre pendant une partie la cache seulement : le statut Discord et la récupération
  // des réglages continuent, et le launcher quitte quand le jeu se ferme
  win.on('close', (event) => {
    // Sauf si le launcher quitte vraiment (ex. « Redémarrer pour installer » une mise à jour)
    if (quitting || !isGameRunning()) return
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
  // Captures de développement : ALORIA_CAPTURE_ACCOUNT="pseudo:uuid" affiche un compte d'exemple (skin 3D de l'accueil)
  const demo = !app.isPackaged && process.env.ALORIA_CAPTURE ? process.env.ALORIA_CAPTURE_ACCOUNT?.split(':') : undefined
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

// Créations : packs de ressources faits dans Aloria
ipcMain.handle('packs:list', () => wrap(() => listPacks()))
ipcMain.handle('packs:create', (_e, name: string) => wrap(() => createPack(name)))
ipcMain.handle('packs:rename', (_e, id: string, name: string) => wrap(() => renamePack(id, name)))
ipcMain.handle('packs:delete', (_e, id: string) => wrap(() => deletePack(id)))
ipcMain.handle('packs:setScale', (_e, id: string, scale: number) => wrap(() => setPackScale(id, scale)))
ipcMain.handle('packs:saveImage', (_e, id: string, element: PackElement, image: string | null) => wrap(() => savePackImage(id, element, image)))
ipcMain.handle('packs:vanilla', (_e, target: { profileId?: string; gameVersion?: string }) => wrap(() => packVanilla(target)))
ipcMain.handle('packs:install', (_e, id: string, profileId: string, files: Record<string, string>) => wrap(() => installPack(id, profileId, files)))

// Tests en développement : dossier de données séparé, pour ne pas croiser le launcher installé
if (!app.isPackaged && process.env.ALORIA_USER_DATA) app.setPath('userData', process.env.ALORIA_USER_DATA)

/** Vrai dès que le launcher quitte (app.quit) : la fenêtre doit alors se fermer, même pendant une partie */
let quitting = false
app.on('before-quit', () => {
  quitting = true
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
  initDiscord()
  // Réglages des parties terminées pendant que le launcher était fermé
  processPending()
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
