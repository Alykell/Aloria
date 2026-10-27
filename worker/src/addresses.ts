/**
 * Adresses de serveur au choix : `<nom>.aloriamc.fr` (comme `nom.aternos.me`). Un enregistrement SRV
 * `_minecraft._tcp.<nom>` renvoie le jeu vers le tunnel playit du serveur, qui tourne sur le PC du joueur.
 * Le launcher réserve le nom (compte Minecraft vérifié : 4 noms au plus, comme les tunnels playit gratuits), puis envoie
 * l'adresse du tunnel à chaque démarrage.
 * Le jeton DNS de Cloudflare reste ici (secret DNS_TOKEN, limité à la zone aloriamc.fr).
 */

export interface AddressEnv {
  DB: D1Database
  DNS_TOKEN: string
  ZONE_ID: string
}

export const DOMAIN = 'aloriamc.fr'
const MAX_PER_PLAYER = 4
/** Sans démarrage du serveur pendant ce temps, le nom est libéré */
const EXPIRE_DAYS = 180

/**
 * Le SRV ne peut viser que les relais de playit. Pas e4mc : après un SRV, le jeu envoie le nom de la cible avec son point
 * final (« x.e4mc.link. »), et le relais d'e4mc, qui reconnaît chaque serveur à son nom, ne le trouve pas (vérifié le
 * 2026-10-27 ; playit donne un port à chaque tunnel, le nom ne compte pas)
 */
const TARGETS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(ply\.gg|joinmc\.link)$/

const RESERVED = new Set([
  'www', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'ns', 'ns1', 'ns2', 'dns', 'api', 'cdn', 'static', 'admin', 'root', 'staff',
  'mod', 'moderateur', 'moderator', 'support', 'help', 'aide', 'status', 'statut', 'aloria', 'aloriamc', 'aloriaclient', 'launcher',
  'official', 'officiel', 'play', 'jouer', 'mc', 'minecraft', 'mojang', 'microsoft', 'server', 'serveur', 'servers', 'serveurs',
  'shop', 'store', 'boutique', 'discord', 'test', 'srvtest', 'hub', 'lobby'
])
/** Mots refusés n'importe où dans le nom */
const BANNED = ['fuck', 'shit', 'bitch', 'nigg', 'nazi', 'hitler', 'porn', 'sexe', 'pute', 'salope', 'connard', 'encule', 'nique', 'batard', 'pedo']

export type AddressProblem = 'invalid' | 'reserved' | 'taken' | 'limit'

export function nameProblem(name: string): AddressProblem | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(name) || name.includes('--')) return 'invalid'
  if (RESERVED.has(name) || BANNED.some((w) => name.includes(w))) return 'reserved'
  return null
}

interface AddressRow {
  name: string
  uuid: string
  target: string | null
  port: number | null
  record_id: string | null
  updated_at: number
}

const row = (env: AddressEnv, name: string) => env.DB.prepare('SELECT * FROM addresses WHERE name = ?').bind(name).first<AddressRow>()

export const myAddresses = async (env: AddressEnv, uuid: string) =>
  (await env.DB.prepare('SELECT name, target, port FROM addresses WHERE uuid = ? ORDER BY name').bind(uuid).all<{ name: string }>()).results

async function dns<T>(env: AddressEnv, path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/dns_records${path}`, {
    method,
    headers: { authorization: `Bearer ${env.DNS_TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data = (await res.json()) as { success: boolean; errors: unknown; result: T }
  // Déjà supprimé : rien à faire
  if (!data.success && !(method === 'DELETE' && res.status === 404)) throw new Error(`DNS ${method} ${JSON.stringify(data.errors)}`)
  return data.result
}

async function deleteRecord(env: AddressEnv, r: AddressRow): Promise<void> {
  if (r.record_id) await dns(env, `/${r.record_id}`, 'DELETE')
}

/** Libre pour ce joueur ? (le sien compte comme libre) */
export async function checkAddress(env: AddressEnv, uuid: string, name: string): Promise<AddressProblem | null> {
  const problem = nameProblem(name)
  if (problem) return problem
  const existing = await row(env, name)
  return existing && existing.uuid !== uuid ? 'taken' : null
}

export async function claimAddress(env: AddressEnv, uuid: string, name: string): Promise<AddressProblem | null> {
  const problem = await checkAddress(env, uuid, name)
  if (problem) return problem
  if (await row(env, name)) return null
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM addresses WHERE uuid = ?').bind(uuid).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_PER_PLAYER) return 'limit'
  // Deux réservations en même temps : la clé primaire n'en garde qu'une
  const now = Date.now()
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO addresses (name, uuid, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .bind(name, uuid, now, now)
    .run()
  return inserted.meta.changes === 1 ? null : 'taken'
}

/** Adresse du tunnel (machine + port) : crée ou remplace le SRV */
export async function pointAddress(env: AddressEnv, uuid: string, name: string, target: string, port: number): Promise<string | null> {
  const r = await row(env, name)
  if (!r || r.uuid !== uuid) return 'non réservée'
  if (!TARGETS.test(target) || !Number.isInteger(port) || port < 1 || port > 65535) return 'adresse de tunnel refusée'
  const record = {
    type: 'SRV',
    name: `_minecraft._tcp.${name}.${DOMAIN}`,
    ttl: 60,
    data: { priority: 0, weight: 5, port, target }
  }
  let recordId = r.record_id
  if (r.target !== target || r.port !== port || !recordId) {
    if (recordId) await dns(env, `/${recordId}`, 'PUT', record)
    else recordId = (await dns<{ id: string }>(env, '', 'POST', record)).id
  }
  await env.DB.prepare('UPDATE addresses SET target = ?, port = ?, record_id = ?, updated_at = ? WHERE name = ?')
    .bind(target, port, recordId, Date.now(), name)
    .run()
  return null
}

export async function releaseAddress(env: AddressEnv, uuid: string, name: string): Promise<void> {
  const r = await row(env, name)
  if (!r || r.uuid !== uuid) return
  await deleteRecord(env, r)
  await env.DB.prepare('DELETE FROM addresses WHERE name = ?').bind(name).run()
}

/** Tâche quotidienne : noms dont le serveur n'a pas démarré depuis EXPIRE_DAYS jours */
export async function expireAddresses(env: AddressEnv): Promise<void> {
  const old = await env.DB.prepare('SELECT * FROM addresses WHERE updated_at < ?')
    .bind(Date.now() - EXPIRE_DAYS * 86_400_000)
    .all<AddressRow>()
  for (const r of old.results) {
    await deleteRecord(env, r)
    await env.DB.prepare('DELETE FROM addresses WHERE name = ?').bind(r.name).run()
  }
}
