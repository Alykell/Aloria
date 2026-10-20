import { safeStorage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { gameDirOf, getProfile } from './profiles'
import { readNbt, writeNbt, type NbtValue } from './shared/nbt'
import { sharedDir } from './shared/presets'
import { sharedServers, sharesServers } from './shared/sync'
import type { LocalWorld, SavedServer, ServerEdit } from '../shared/types'
import { tm } from './i18n'

/*
 * Boutons « Solo » et « Multijoueur » de l'accueil : mondes et serveurs d'un profil, et connexion automatique (/login).
 * Les mots de passe sont chiffrés par Windows (safeStorage, lié à la session) dans shared/autologin.json, rangés par
 * adresse : ils valent pour tous les profils. Au lancement, ils passent au jeu par une variable d'environnement
 * (autoLoginEnv) et Aloria HUD les envoie au serveur : jamais en clair sur le disque.
 */

type Compound = Map<string, NbtValue>

const str = (c: Compound, key: string): string | undefined => {
  const v = c.get(key)
  return v?.type === 8 ? v.value : undefined
}
const num = (c: Compound, key: string): number | undefined => {
  const v = c.get(key)
  if (!v) return undefined
  if (v.type === 4) return Number(v.value)
  return v.type >= 1 && v.type <= 6 ? (v.value as number) : undefined
}

const MODES: LocalWorld['mode'][] = ['survival', 'creative', 'adventure', 'spectator']

export async function listWorlds(profileId: string): Promise<LocalWorld[]> {
  const saves = join(gameDirOf(profileId), 'saves')
  if (!existsSync(saves)) return []
  const worlds: LocalWorld[] = []
  for (const id of await readdir(saves)) {
    const levelDat = join(saves, id, 'level.dat')
    if (!existsSync(levelDat)) continue
    try {
      const root = readNbt(gunzipSync(await readFile(levelDat)))
      const data = root.get('Data')
      if (data?.type !== 10) continue
      const iconFile = join(saves, id, 'icon.png')
      worlds.push({
        id,
        name: str(data.value, 'LevelName') || id,
        lastPlayed: num(data.value, 'LastPlayed') ?? 0,
        mode: num(data.value, 'hardcore') ? 'hardcore' : (MODES[num(data.value, 'GameType') ?? 0] ?? 'survival'),
        icon: existsSync(iconFile) ? `data:image/png;base64,${(await readFile(iconFile)).toString('base64')}` : null
      })
    } catch {
      // Monde abîmé ou d'un format inconnu : on ne le propose pas
    }
  }
  return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
}

/** Liste commune si le profil la partage (celle que le jeu recevra au lancement), sinon celle du profil */
function serversFile(profileId: string): string {
  const own = join(gameDirOf(profileId), 'servers.dat')
  return sharesServers(getProfile(profileId)) && (existsSync(sharedServers) || !existsSync(own)) ? sharedServers : own
}

async function readServers(file: string): Promise<{ root: Compound; list: NbtValue[] }> {
  const root = existsSync(file) ? readNbt(await readFile(file)) : new Map<string, NbtValue>()
  const servers = root.get('servers')
  return { root, list: servers?.type === 9 ? servers.value : [] }
}

async function writeServers(file: string, root: Compound, list: NbtValue[]): Promise<void> {
  root.set('servers', { type: 9, itemType: 10, value: list })
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, writeNbt(root))
}

export async function listServers(profileId: string): Promise<SavedServer[]> {
  const { list } = await readServers(serversFile(profileId))
  const saved = readStore()
  return list.flatMap((entry, index) => {
    if (entry.type !== 10) return []
    const address = str(entry.value, 'ip') ?? ''
    const icon = str(entry.value, 'icon')
    return [{ index, name: str(entry.value, 'name') || address, address, icon: icon ? `data:image/png;base64,${icon}` : null, autoLogin: !!saved[addressKey(address)] }]
  })
}

/** Ajoute (index null) ou modifie un serveur ; `previous` : adresse lue avant, pour ne pas toucher au mauvais si la liste a changé */
export async function saveServer(profileId: string, index: number | null, previous: string | null, edit: ServerEdit): Promise<void> {
  const name = edit.name.trim()
  const address = edit.address.trim()
  if (!address) throw new Error(tm('quick.addressMissing'))
  const file = serversFile(profileId)
  const { root, list } = await readServers(file)
  if (index === null) {
    list.unshift({ type: 10, value: new Map<string, NbtValue>([['name', { type: 8, value: name || address }], ['ip', { type: 8, value: address }]]) })
  } else {
    const entry = list[index]
    if (entry?.type !== 10 || str(entry.value, 'ip') !== previous) throw new Error(tm('quick.serverChanged'))
    entry.value.set('name', { type: 8, value: name || address })
    entry.value.set('ip', { type: 8, value: address })
  }
  await writeServers(file, root, list)

  // Mot de passe : suit l'adresse si elle change ; vide = garder l'ancien
  const store = readStore()
  const oldKey = previous ? addressKey(previous) : null
  const key = addressKey(address)
  const kept = oldKey ? store[oldKey] : undefined
  if (oldKey) delete store[oldKey]
  if (edit.autoLogin) {
    if (edit.password) store[key] = encrypt(edit.password)
    else if (kept) store[key] = kept
    else throw new Error(tm('quick.passwordMissing'))
  }
  await writeStore(store)
}

export async function deleteServer(profileId: string, index: number, previous: string): Promise<void> {
  const file = serversFile(profileId)
  const { root, list } = await readServers(file)
  const entry = list[index]
  if (entry?.type !== 10 || str(entry.value, 'ip') !== previous) throw new Error(tm('quick.serverChanged'))
  list.splice(index, 1)
  await writeServers(file, root, list)
}

// --- Mots de passe ---

const storeFile = join(sharedDir, 'autologin.json')

/** « Play.Exemple.fr » et « play.exemple.fr:25565 » : même serveur (même règle que le mod) */
export function addressKey(address: string): string {
  const a = address.trim().toLowerCase()
  return /:\d+$/.test(a) ? a : `${a}:25565`
}

function readStore(): Record<string, string> {
  try {
    return existsSync(storeFile) ? (JSON.parse(readFileSync(storeFile, 'utf8')) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function writeStore(store: Record<string, string>): Promise<void> {
  await mkdir(sharedDir, { recursive: true })
  await writeFile(storeFile, JSON.stringify(store, null, 2))
}

function encrypt(password: string): string {
  // Jamais en clair : sans chiffrement de Windows disponible, on refuse
  if (!safeStorage.isEncryptionAvailable()) throw new Error(tm('quick.noEncryption'))
  return safeStorage.encryptString(password).toString('base64')
}

/** Mots de passe déchiffrés pour le jeu ({"adresse:port": "mot de passe"}), ou null s'il n'y en a pas */
export function autoLoginEnv(): string | null {
  const store = readStore()
  if (!Object.keys(store).length || !safeStorage.isEncryptionAvailable()) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(store)) {
    try {
      out[key] = safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      // Chiffré sur une autre session Windows : illisible, on l'ignore
    }
  }
  return Object.keys(out).length ? JSON.stringify(out) : null
}

/** « play.exemple.fr:25566 » → hôte et port, pour « Rejoindre » */
export function parseAddress(address: string): { host: string; port: number } {
  const m = /^(.*):(\d+)$/.exec(address.trim())
  return m ? { host: m[1], port: Number(m[2]) } : { host: address.trim(), port: 25565 }
}
