import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serverDirOf } from './store'
import type { ServerPlayerAction, ServerPlayers } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Réglages (server.properties) et joueurs (liste blanche, opérateurs, bannis) d'un serveur. Serveur allumé : les
 * joueurs passent par ses commandes (il réécrit lui-même ses fichiers) ; éteint, on modifie les fichiers directement.
 */

// ---------------------------------------------------------------- server.properties

export async function readProperties(id: string): Promise<Record<string, string>> {
  const file = join(serverDirOf(id), 'server.properties')
  if (!existsSync(file)) return {}
  const props: Record<string, string> = {}
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return props
}

/** Change des lignes de server.properties en gardant les autres (et leurs commentaires) telles quelles */
export async function writeProperties(id: string, patch: Record<string, string>): Promise<void> {
  const file = join(serverDirOf(id), 'server.properties')
  let text = existsSync(file) ? await readFile(file, 'utf8') : ''
  for (const [key, raw] of Object.entries(patch)) {
    const value = raw.replace(/[\r\n]/g, ' ')
    const re = new RegExp(`^${key.replace(/[.-]/g, '\\$&')}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`
  }
  await writeFile(file, text)
}

// ---------------------------------------------------------------- joueurs

interface Entry {
  uuid: string
  name: string
  [key: string]: unknown
}

async function readList(id: string, file: string): Promise<Entry[]> {
  try {
    return JSON.parse(await readFile(join(serverDirOf(id), file), 'utf8')) as Entry[]
  } catch {
    return []
  }
}

const writeList = (id: string, file: string, list: Entry[]) => writeFile(join(serverDirOf(id), file), JSON.stringify(list, null, 2))

export async function listPlayers(id: string): Promise<ServerPlayers> {
  const props = await readProperties(id)
  const names = (list: Entry[]) => list.map((e) => e.name).sort((a, b) => a.localeCompare(b))
  return {
    whitelistOn: props['white-list'] === 'true',
    whitelist: names(await readList(id, 'whitelist.json')),
    ops: names(await readList(id, 'ops.json')),
    banned: names(await readList(id, 'banned-players.json'))
  }
}

/** UUID d'un joueur : celui de son compte Mojang, ou en mode crack celui que le serveur calcule à partir du pseudo */
async function uuidOf(name: string, online: boolean): Promise<string> {
  if (!online) {
    const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest()
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    const hex = hash.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)
  if (res.status === 404 || res.status === 204) throw new Error(tm('err.serverPlayerUnknown', { name }))
  if (!res.ok) throw new Error(tm('err.fetch', { url: 'api.mojang.com', status: res.status }))
  const { id: raw, name: real } = (await res.json()) as { id: string; name: string }
  if (real.toLowerCase() !== name.toLowerCase()) throw new Error(tm('err.serverPlayerUnknown', { name }))
  return raw.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
}

/** Commande équivalente quand le serveur est allumé */
export function playerCommand(action: ServerPlayerAction, name: string): string {
  return {
    'whitelist-add': `whitelist add ${name}`,
    'whitelist-remove': `whitelist remove ${name}`,
    op: `op ${name}`,
    deop: `deop ${name}`,
    ban: `ban ${name}`,
    pardon: `pardon ${name}`,
    kick: `kick ${name}`
  }[action]
}

/** Serveur éteint : modifie directement whitelist.json, ops.json ou banned-players.json */
export async function editPlayersOffline(id: string, action: ServerPlayerAction, name: string): Promise<void> {
  const files: Record<ServerPlayerAction, string | null> = {
    'whitelist-add': 'whitelist.json',
    'whitelist-remove': 'whitelist.json',
    op: 'ops.json',
    deop: 'ops.json',
    ban: 'banned-players.json',
    pardon: 'banned-players.json',
    kick: null
  }
  const file = files[action]
  if (!file) return
  const list = await readList(id, file)
  const same = (e: Entry) => e.name.toLowerCase() === name.toLowerCase()
  if (action === 'whitelist-remove' || action === 'deop' || action === 'pardon') {
    await writeList(
      id,
      file,
      list.filter((e) => !same(e))
    )
    return
  }
  if (list.some(same)) return
  const online = (await readProperties(id))['online-mode'] !== 'false'
  const uuid = await uuidOf(name, online)
  const extra: Record<string, unknown> =
    action === 'op'
      ? { level: 4, bypassesPlayerLimit: false }
      : action === 'ban'
        ? {
            created: new Date()
              .toISOString()
              .replace('T', ' ')
              .replace(/\.\d+Z$/, ' +0000'),
            source: 'Aloria',
            expires: 'forever',
            reason: 'Banned by an operator.'
          }
        : {}
  await writeList(id, file, [...list, { uuid, name, ...extra }])
}
