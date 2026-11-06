import { app, Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import iconIco from '../../resources/icon.ico?asset'
import iconPng from '../../resources/icon.png?asset'
import { getStatus, stopGame } from './game/controller'
import { getServer } from './server/store'
import { serverStatuses, stopAllServers, stopServer } from './server/runner'
import { getSettings } from './settings'
import { tm } from './i18n'

/**
 * Icône d'Aloria près de l'horloge (zone de notification), comme Steam ou Discord : un clic ramène la fenêtre, même cachée
 * pendant une partie ou avec un serveur allumé ; clic droit : fermer une partie, arrêter un serveur, tout arrêter, quitter.
 * Le menu est refait à chaque ouverture (Windows) ou toutes les quelques secondes (Linux, où il doit être donné d'avance).
 */
let tray: Tray | null = null

function menu(show: () => void): Menu {
  const games = getStatus().running
  const servers = serverStatuses().filter((s) => s.state === 'starting' || s.state === 'running')
  const items: MenuItemConstructorOptions[] = [{ label: tm('tray.open'), click: show }]
  if (games.length > 0) {
    items.push({ type: 'separator' }, { label: tm('tray.games'), enabled: false })
    for (const g of games)
      items.push({ label: tm('tray.stopGame', { name: plain(g.profile) }), enabled: !g.stopping, click: () => stopGame(g.profileId) })
  }
  if (servers.length > 0) {
    items.push({ type: 'separator' }, { label: tm('tray.servers'), enabled: false })
    for (const s of servers) items.push({ label: tm('tray.stopServer', { name: plain(nameOf(s.id)) }), click: () => void stopServer(s.id) })
  }
  if (games.length + servers.length > 1) {
    items.push(
      { type: 'separator' },
      {
        label: tm('tray.stopAll'),
        click: () => {
          for (const g of games) stopGame(g.profileId)
          void stopAllServers()
        }
      }
    )
  }
  // Quitter arrête d'abord proprement les serveurs allumés (before-quit de index.ts)
  items.push({ type: 'separator' }, { label: tm('tray.quit'), click: () => app.quit() })
  return Menu.buildFromTemplate(items)
}

/** Sous Windows, « & » souligne la lettre suivante dans un menu (« Wither & TnT » perdait son « & ») : doublé, il s'affiche */
const plain = (name: string) => (process.platform === 'win32' ? name.replace(/&/g, '&&') : name)

function nameOf(id: string): string {
  try {
    return getServer(id).name
  } catch {
    return id
  }
}

/** Infobulle : ce qui tourne encore (un serveur oublié se voit d'un coup d'œil) */
function tooltip(): string {
  const servers = serverStatuses().filter((s) => s.state !== 'stopped').length
  const games = getStatus().running.length
  const parts = [games > 0 ? tm('tray.tipGames', { n: games }) : null, servers > 0 ? tm('tray.tipServers', { n: servers }) : null].filter(
    Boolean
  )
  return parts.length > 0 ? `Aloria · ${parts.join(' · ')}` : 'Aloria'
}

export function initTray(getWindow: () => BrowserWindow | undefined): void {
  if (tray) return
  // Windows choisit la bonne taille dans le .ico ; ailleurs, une petite image (le PNG fait 512 px)
  const image =
    process.platform === 'win32'
      ? nativeImage.createFromPath(iconIco)
      : nativeImage.createFromPath(iconPng).resize({ width: 24, height: 24 })
  tray = new Tray(image)
  tray.setToolTip('Aloria')
  const show = () => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  tray.on('click', show)
  tray.on('mouse-enter', () => tray?.setToolTip(tooltip()))
  if (process.platform === 'win32') {
    tray.on('right-click', () => {
      tray?.setToolTip(tooltip())
      tray?.popUpContextMenu(menu(show))
    })
  } else {
    // Linux : pas d'évènement de clic droit, le menu est donné d'avance et rafraîchi quand ce qui tourne change
    let last = ''
    const refresh = () => {
      const key = JSON.stringify([getStatus().running, serverStatuses().map((s) => [s.id, s.state]), getSettings().language])
      if (key === last) return
      last = key
      tray?.setContextMenu(menu(show))
      tray?.setToolTip(tooltip())
    }
    refresh()
    setInterval(refresh, 3000)
  }
}
