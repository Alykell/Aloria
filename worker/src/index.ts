/**
 * Worker des cosmétiques d'Aloria (aloria-cosmetics.aloria-client.workers.dev).
 *
 * Connexion : le launcher envoie le certificat de joueur que Mojang lui délivre (celui qui signe le chat : clé publique signée
 * par Mojang pour ce compte) et un message signé avec sa clé privée. Le Worker vérifie les deux signatures sans appeler Mojang
 * (qui refuse les requêtes venant de Cloudflare) et sans que le jeton Microsoft ne quitte le PC, puis rend une session signée (24 h).
 * Temps de jeu : compté ici (battements du launcher pendant les parties, une minute au plus par battement), pas sur le PC
 * du joueur : c'est lui qui débloque les cosmétiques.
 */

import { PLAYER_CERTIFICATE_KEYS } from './mojangKeys'
import { checkAddress, claimAddress, expireAddresses, myAddresses, pointAddress, releaseAddress, type AddressEnv } from './addresses'

export interface Env extends AddressEnv {
  DB: D1Database
  SESSION_SECRET: string
}

type Slot = 'cape' | 'hat'
type Unlock = { type: 'event'; from: string; to: string } | { type: 'playtime'; minutes: number }

interface Cosmetic {
  id: string
  slot: Slot
  name: { fr: string; en: string }
  unlock: Unlock
}

/** Cosmétiques proposés ; un nouveau s'ajoute ici (et son dessin dans Aloria HUD) */
const CATALOG: Cosmetic[] = [
  {
    id: 'pumpkin_hat',
    slot: 'hat',
    name: { fr: 'Chapeau citrouille', en: 'Pumpkin hat' },
    // Halloween 2026, heure de Paris : jusqu'au 3 novembre au soir
    unlock: { type: 'event', from: '2026-10-23T00:00:00+02:00', to: '2026-11-04T00:00:00+01:00' }
  },
  {
    id: 'aloria_cape',
    slot: 'cape',
    name: { fr: 'Cape Aloria', en: 'Aloria cape' },
    unlock: { type: 'playtime', minutes: 600 }
  }
]

const SESSION_HOURS = 24
/** Battements du launcher : toutes les minutes ; plus rapprochés, ignorés ; plus espacés, la partie est considérée finie */
const BEAT_MIN = 30
const BEAT_CREDIT = 60
const BEAT_GAP = 150

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
const fail = (status: number, error: string) => json({ error }, status)

// ---------------------------------------------------------------- sessions signées

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

async function createSession(env: Env, uuid: string, name: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ uuid, name, exp: Date.now() + SESSION_HOURS * 3_600_000 })))
  return `${payload}.${await sign(env.SESSION_SECRET, payload)}`
}

/** Joueur de la session envoyée (Authorization: Bearer …), ou null si elle est fausse ou expirée */
async function readSession(env: Env, request: Request): Promise<{ uuid: string; name: string } | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const [payload, signature] = token.split('.')
  if (!payload || !signature || (await sign(env.SESSION_SECRET, payload)) !== signature) return null
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { uuid: string; name: string; exp: number }
    return data.exp > Date.now() ? data : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- certificats de joueur Mojang

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const pemBody = (pem: string) => fromBase64(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, ''))
const rsaKey = (der: Uint8Array, hash: 'SHA-1' | 'SHA-256') =>
  crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify'])
const verify = async (key: CryptoKey, signature: string, data: Uint8Array) =>
  crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64(signature), data).catch(() => false)

interface Proof {
  uuid: string
  name: string
  /** Certificat : clé publique (PEM), fin de validité (ms), signature de Mojang (publicKeySignatureV2) */
  publicKey: string
  expiresAt: number
  signatureV2: string
  /** « aloria-cosmetics:<uuid>:<heure en ms> », signé avec la clé privée du certificat (SHA256withRSA) */
  message: string
  signature: string
}

/** Le certificat est-il signé par Mojang pour ce compte, et le message signé par son détenteur à l'instant ? */
async function checkProof(p: Proof): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(p.uuid) || !(p.expiresAt > Date.now())) return false
  const [prefix, uuid, time] = p.message.split(':')
  if (prefix !== 'aloria-cosmetics' || uuid !== p.uuid || Math.abs(Date.now() - Number(time)) > 120_000) return false
  // Données signées par Mojang : UUID (16 octets), fin de validité (long), clé publique (DER) — SHA1withRSA
  const key = pemBody(p.publicKey)
  const data = new Uint8Array(24 + key.length)
  for (let i = 0; i < 16; i++) data[i] = parseInt(p.uuid.slice(i * 2, i * 2 + 2), 16)
  new DataView(data.buffer).setBigInt64(16, BigInt(p.expiresAt))
  data.set(key, 24)
  let signedByMojang = false
  for (const mojang of PLAYER_CERTIFICATE_KEYS) {
    if (await verify(await rsaKey(fromBase64(mojang), 'SHA-1'), p.signatureV2, data)) signedByMojang = true
  }
  return signedByMojang && verify(await rsaKey(key, 'SHA-256'), p.signature, new TextEncoder().encode(p.message))
}

// ---------------------------------------------------------------- joueurs

interface PlayerRow {
  uuid: string
  name: string
  play_seconds: number
  last_beat: number | null
  cape: string | null
  hat: string | null
}

async function player(env: Env, uuid: string, name: string): Promise<PlayerRow> {
  await env.DB.prepare('INSERT INTO players (uuid, name) VALUES (?1, ?2) ON CONFLICT (uuid) DO UPDATE SET name = ?2').bind(uuid, name).run()
  return (await env.DB.prepare('SELECT * FROM players WHERE uuid = ?').bind(uuid).first<PlayerRow>())!
}

const owned = async (env: Env, uuid: string) =>
  new Set((await env.DB.prepare('SELECT cosmetic FROM owned WHERE uuid = ?').bind(uuid).all<{ cosmetic: string }>()).results.map((r) => r.cosmetic))

/** Peut-il le récupérer maintenant ? (pendant l'événement, ou assez de temps de jeu) */
function claimable(cosmetic: Cosmetic, row: PlayerRow, now = Date.now()): boolean {
  const { unlock } = cosmetic
  if (unlock.type === 'event') return now >= Date.parse(unlock.from) && now < Date.parse(unlock.to)
  return row.play_seconds >= unlock.minutes * 60
}

async function me(env: Env, row: PlayerRow) {
  const mine = await owned(env, row.uuid)
  return {
    uuid: row.uuid,
    name: row.name,
    playMinutes: Math.floor(row.play_seconds / 60),
    equipped: { cape: row.cape, hat: row.hat },
    cosmetics: CATALOG.map((c) => ({ ...c, owned: mine.has(c.id), claimable: !mine.has(c.id) && claimable(c, row) }))
  }
}

// ---------------------------------------------------------------- routes

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname}`

    // Ce que portent ces joueurs (lu par Aloria HUD pour dessiner les autres) : ?uuids=a,b,c (100 au plus)
    if (route === 'GET /players') {
      const uuids = (url.searchParams.get('uuids') ?? '').split(',').filter((u) => /^[0-9a-f]{32}$/.test(u)).slice(0, 100)
      const result: Record<string, { cape: string | null; hat: string | null }> = {}
      if (uuids.length > 0) {
        const rows = await env.DB.prepare(`SELECT uuid, cape, hat FROM players WHERE uuid IN (${uuids.map(() => '?').join(',')}) AND (cape IS NOT NULL OR hat IS NOT NULL)`)
          .bind(...uuids)
          .all<{ uuid: string; cape: string | null; hat: string | null }>()
        for (const r of rows.results) result[r.uuid] = { cape: r.cape, hat: r.hat }
      }
      return json(result, 200, { 'cache-control': 'public, max-age=60' })
    }

    if (route === 'GET /catalog') return json(CATALOG, 200, { 'cache-control': 'public, max-age=300' })

    // Connexion : certificat de joueur Mojang + message signé (voir Proof)
    if (route === 'POST /session') {
      const proof = (await request.json().catch(() => null)) as Proof | null
      if (!proof || typeof proof.name !== 'string' || !(await checkProof(proof).catch(() => false))) return fail(401, 'compte non vérifié')
      const name = proof.name.slice(0, 16)
      const row = await player(env, proof.uuid, name)
      return json({ token: await createSession(env, proof.uuid, name), ...(await me(env, row)) })
    }

    const session = await readSession(env, request)
    if (!session) return fail(401, 'session absente ou expirée')
    const row = await player(env, session.uuid, session.name)

    if (route === 'GET /me') return json(await me(env, row))

    // Battement pendant une partie (toutes les minutes)
    if (route === 'POST /heartbeat') {
      const now = Math.floor(Date.now() / 1000)
      const gap = row.last_beat === null ? Infinity : now - row.last_beat
      if (gap >= BEAT_MIN) {
        const credit = gap <= BEAT_GAP ? Math.min(gap, BEAT_CREDIT) : 0
        await env.DB.prepare('UPDATE players SET play_seconds = play_seconds + ?1, last_beat = ?2 WHERE uuid = ?3').bind(credit, now, row.uuid).run()
        row.play_seconds += credit
      }
      return json({ playMinutes: Math.floor(row.play_seconds / 60) })
    }

    // Récupérer un cosmétique : { id }
    if (route === 'POST /claim') {
      const { id } = (await request.json().catch(() => ({}))) as { id?: string }
      const cosmetic = CATALOG.find((c) => c.id === id)
      if (!cosmetic) return fail(404, 'cosmétique inconnu')
      if (!(await owned(env, row.uuid)).has(cosmetic.id)) {
        if (!claimable(cosmetic, row)) return fail(403, 'pas encore débloqué')
        await env.DB.prepare('INSERT OR IGNORE INTO owned (uuid, cosmetic, at) VALUES (?, ?, ?)').bind(row.uuid, cosmetic.id, Date.now()).run()
      }
      return json(await me(env, row))
    }

    // Équiper ou retirer : { slot, id } (id null = rien)
    if (route === 'POST /equip') {
      const { slot, id } = (await request.json().catch(() => ({}))) as { slot?: Slot; id?: string | null }
      if (slot !== 'cape' && slot !== 'hat') return fail(400, 'emplacement inconnu')
      if (id) {
        const cosmetic = CATALOG.find((c) => c.id === id)
        if (!cosmetic || cosmetic.slot !== slot) return fail(400, 'cosmétique inconnu pour cet emplacement')
        if (!(await owned(env, row.uuid)).has(id)) return fail(403, 'cosmétique non possédé')
      }
      await env.DB.prepare(`UPDATE players SET ${slot} = ? WHERE uuid = ?`).bind(id ?? null, row.uuid).run()
      row[slot] = id ?? null
      return json(await me(env, row))
    }

    // Adresses de serveur `<nom>.aloriamc.fr` (voir addresses.ts) : { name } et, pour /target, { target, port }
    if (url.pathname.startsWith('/addresses')) {
      const body = request.method === 'POST' ? ((await request.json().catch(() => ({}))) as { name?: string; target?: string; port?: number }) : {}
      const name = String(body.name ?? url.searchParams.get('name') ?? '').toLowerCase()
      if (route === 'GET /addresses') return json(await myAddresses(env, row.uuid))
      if (route === 'GET /addresses/check') return json({ name, problem: await checkAddress(env, row.uuid, name) })
      if (route === 'POST /addresses/claim') {
        const problem = await claimAddress(env, row.uuid, name)
        return problem ? json({ error: problem, problem }, 409) : json({ name })
      }
      if (route === 'POST /addresses/target') {
        const error = await pointAddress(env, row.uuid, name, String(body.target ?? '').toLowerCase(), Number(body.port))
        return error ? fail(400, error) : json({ name })
      }
      if (route === 'POST /addresses/release') {
        await releaseAddress(env, row.uuid, name)
        return json({ name })
      }
    }

    return fail(404, 'route inconnue')
  },

  // Tous les jours : noms abandonnés libérés
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await expireAddresses(env)
  }
}
