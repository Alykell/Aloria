import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import AdmZip from 'adm-zip'
import { getProjects } from '../modrinth/api'
import { createProfile, gameDirOf, getProfile, listProfiles } from '../profiles'
import { getServer, serverDirOf, updateServer } from './store'
import { serverStatuses } from './runner'
import type { Loader, Profile, ProfileInput, ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Le côté joueur d'un serveur : un profil prêt à le rejoindre (même version, même chargeur, mêmes mods), et un « pack pour
 * les amis » (zip importable dans Aloria : nom, version et mods seulement, sans réglages ni monde).
 */

/** Fichiers mis par Aloria pour e4mc : seul Fabric API sert aussi au joueur */
const MANAGED = /^aloria-e4mc-/
const FABRIC_API = /^aloria-e4mc-(fabric-api-.*\.jar)$/

const loaderOf = (server: ServerInfo): Loader => (server.type === 'paper' || server.type === 'vanilla' ? 'vanilla' : server.type)

function inputOf(server: ServerInfo): ProfileInput {
  const loader = loaderOf(server)
  return {
    name: server.name,
    icon: server.icon,
    versionId: server.gameVersion,
    loader,
    loaderVersion: loader === 'vanilla' ? null : (server.installed?.loaderVersion ?? server.loaderVersion),
    ramMb: null
  }
}

/**
 * Mods du serveur utiles au joueur : on laisse ceux que Modrinth marque « serveur seulement » (ils feraient planter le jeu)
 * et ceux d'e4mc ; les fichiers mis à la main sont gardés (rien ne dit à quoi ils servent). Nom dans le profil → chemin.
 */
async function clientMods(server: ServerInfo): Promise<Map<string, string>> {
  const mods = new Map<string, string>()
  if (loaderOf(server) === 'vanilla') return mods
  const dir = join(serverDirOf(server.id), 'mods')
  if (!existsSync(dir)) return mods
  let index: Record<string, { projectId: string }> = {}
  try {
    index = JSON.parse(await readFile(join(dir, 'aloria-content.json'), 'utf8'))
  } catch {
    // Pas de liste : aucun mod installé depuis Modrinth
  }
  const ids = [...new Set(Object.values(index).map((e) => e.projectId))]
  const serverOnly = new Set(
    ids.length
      ? (await getProjects(ids).catch(() => []))
          .filter((p) => (p as { client_side?: string }).client_side === 'unsupported')
          .map((p) => p.id)
      : []
  )
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.jar')) continue
    const api = FABRIC_API.exec(file)
    if (api) mods.set(api[1], join(dir, file))
    else if (!MANAGED.test(file) && !serverOnly.has(index[file]?.projectId)) mods.set(file, join(dir, file))
  }
  return mods
}

/** Profil lié au serveur, s'il existe encore */
export function linkedProfile(server: ServerInfo): Profile | null {
  if (!server.profileId) return null
  return listProfiles().profiles.find((p) => p.id === server.profileId) ?? null
}

/** Crée le profil du serveur (ou remet à jour ses mods s'il existe déjà) et le renvoie */
export async function createServerProfile(id: string, name?: string): Promise<Profile> {
  const server = getServer(id)
  if (!server.installed) throw new Error(tm('err.serverNotStarted'))
  const profile = linkedProfile(server) ?? createProfile({ ...inputOf(server), ...(name?.trim() ? { name: name.trim().slice(0, 32) } : {}) })
  if (server.profileId !== profile.id) updateServer(id, { profileId: profile.id })
  const mods = await clientMods(server)
  if (mods.size > 0) {
    const target = join(gameDirOf(profile.id), 'mods')
    await mkdir(target, { recursive: true })
    for (const [name, path] of mods) await copyFile(path, join(target, name))
  }
  return getProfile(profile.id)
}

/** Enregistre le pack pour les amis (fenêtre « Enregistrer sous ») ; renvoie le chemin, ou null si annulé */
export async function exportServerPack(win: BrowserWindow | null, id: string): Promise<string | null> {
  const server = getServer(id)
  if (!server.installed) throw new Error(tm('err.serverNotStarted'))
  const options = {
    title: tm('server.pack.saveTitle'),
    defaultPath: `${server.name.replace(/[<>:"/\\|?*]/g, '_')}.zip`,
    filters: [{ name: 'Zip', extensions: ['zip'] }]
  }
  const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (res.canceled || !res.filePath) return null
  await writeServerPack(id, res.filePath)
  return res.filePath
}

/** Écrit le pack pour les amis à cet endroit */
export async function writeServerPack(id: string, dest: string): Promise<void> {
  const server = getServer(id)
  const zip = new AdmZip()
  // Même format que l'export d'un profil : le bouton « Importer » de la page Profils le reconnaît
  // Adresse publique (playit : fixe ; e4mc : celle du démarrage en cours) : ajoutée à la liste Multijoueur de l'ami à l'import
  const live = serverStatuses().find((st) => st.id === id)?.publicAddress
  const address = live ?? (server.tunnel === 'playit' ? server.lastAddress : undefined)
  const pack = { format: 1, profile: inputOf(server), ...(address ? { server: { name: server.name, address } } : {}) }
  zip.addFile('aloria-profile.json', Buffer.from(JSON.stringify(pack, null, 2)))
  for (const [name, path] of await clientMods(server)) zip.addLocalFile(path, 'mods', name)
  await zip.writeZipPromise(dest)
}
