import { createSign } from 'node:crypto'
import { getValidSession } from './auth/accounts'
import type { CosmeticSlot, CosmeticsState } from '../shared/types'

/**
 * Cosmétiques d'Aloria (capes, chapeaux…) : Worker Cloudflare du dossier worker/.
 * Connexion sans envoyer le jeton du joueur : certificat de joueur de Mojang (clé signée par Mojang pour ce compte, celle du
 * chat) et un message signé avec sa clé privée, vérifiés par le Worker. Le temps de jeu qui débloque les cosmétiques est compté par le Worker (battements pendant les parties).
 */
export const COSMETICS_API = 'https://aloria-cosmetics.aloria-client.workers.dev'

/** Sessions du Worker par compte (24 h), renouvelées une heure avant la fin */
const sessions = new Map<string, { token: string; expiresAt: number }>()

async function session(uuid: string): Promise<string> {
  const cached = sessions.get(uuid)
  if (cached && cached.expiresAt - Date.now() > 3_600_000) return cached.token
  const account = await getValidSession(uuid)
  const certRes = await fetch('https://api.minecraftservices.com/player/certificates', {
    method: 'POST',
    headers: { authorization: `Bearer ${account.accessToken}` }
  })
  if (!certRes.ok) throw new Error(`certificat Mojang ${certRes.status}`)
  const cert = (await certRes.json()) as { keyPair: { privateKey: string; publicKey: string }; publicKeySignatureV2: string; expiresAt: string }
  const message = `aloria-cosmetics:${account.uuid}:${Date.now()}`
  // Clé PKCS#8 malgré l'en-tête « RSA PRIVATE KEY » de Mojang
  const privateKey = cert.keyPair.privateKey.replace(/RSA PRIVATE KEY/g, 'PRIVATE KEY')
  const signature = createSign('SHA256').update(message).sign(privateKey, 'base64')
  const res = await fetch(`${COSMETICS_API}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      uuid: account.uuid,
      name: account.name,
      publicKey: cert.keyPair.publicKey,
      expiresAt: Date.parse(cert.expiresAt),
      signatureV2: cert.publicKeySignatureV2,
      message,
      signature
    })
  })
  if (!res.ok) throw new Error(`cosmétiques ${res.status}`)
  const { token } = (await res.json()) as { token: string }
  sessions.set(uuid, { token, expiresAt: Date.now() + 24 * 3_600_000 })
  return token
}

/** Requête au Worker au nom de ce compte (cosmétiques, adresses de serveur) */
export async function call<T>(uuid: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const send = async () =>
    fetch(`${COSMETICS_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await session(uuid)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  let res = await send()
  // Session refusée (secret changé, expirée plus tôt que prévu) : une nouvelle, une fois
  if (res.status === 401) {
    sessions.delete(uuid)
    res = await send()
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `cosmétiques ${res.status}`)
  return (await res.json()) as T
}

export const cosmeticsState = (uuid: string) => call<CosmeticsState>(uuid, 'GET', '/me')
export const claimCosmetic = (uuid: string, id: string) => call<CosmeticsState>(uuid, 'POST', '/claim', { id })
export const equipCosmetic = (uuid: string, slot: CosmeticSlot, id: string | null) => call<CosmeticsState>(uuid, 'POST', '/equip', { slot, id })

/** Battement pendant une partie (chaque minute) : le Worker ajoute le temps de jeu ; sans réseau, la minute est perdue */
export function cosmeticsHeartbeat(uuid: string): void {
  call(uuid, 'POST', '/heartbeat').catch((err) => console.warn('[cosmétiques] battement', err instanceof Error ? err.message : err))
}
