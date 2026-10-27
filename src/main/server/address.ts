import { Resolver } from 'node:dns/promises'
import { call } from '../cosmetics'
import { listAccounts } from '../auth/accounts'
import { getServer, updateServer } from './store'
import type { AddressProblem, ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Adresse au choix `<nom>.aloriamc.fr` (comme sur Aternos) : le Worker d'Aloria réserve le nom pour le compte Minecraft
 * actif, puis, à chaque démarrage, fait pointer son enregistrement SRV vers le tunnel playit du serveur (pas e4mc : son
 * relais ne reconnaît pas le nom envoyé par le jeu après un SRV, voir worker/src/addresses.ts).
 * Le serveur tourne toujours sur ce PC : le nom ne fait que renvoyer vers le tunnel.
 */
export const ADDRESS_DOMAIN = 'aloriamc.fr'

const PROBLEMS: AddressProblem[] = ['invalid', 'reserved', 'taken', 'limit']

function activeAccount(): string {
  const uuid = listAccounts().active
  if (!uuid) throw new Error(tm('err.loginForAddress'))
  return uuid
}

/** Problème du nom pour le compte actif (null = libre, ou déjà à lui) */
export async function checkAddress(name: string): Promise<AddressProblem | null> {
  const res = await call<{ problem: AddressProblem | null }>(activeAccount(), 'GET', `/addresses/check?name=${encodeURIComponent(name)}`)
  return res.problem
}

/**
 * Réserve `name` pour ce serveur (null = retirer l'adresse) ; l'ancien nom est libéré. Renvoie le problème si le nom est
 * refusé. Le SRV est créé au prochain démarrage (ou tout de suite si le tunnel est déjà là : `publicAddress`).
 */
export async function setCustomAddress(id: string, name: string | null): Promise<AddressProblem | null> {
  const server = getServer(id)
  const previous = server.customAddress
  if (name) {
    const owner = activeAccount()
    if (previous?.name === name && previous.owner === owner) return null
    try {
      await call(owner, 'POST', '/addresses/claim', { name })
    } catch (err) {
      const code = err instanceof Error ? (err.message as AddressProblem) : null
      if (code && PROBLEMS.includes(code)) return code
      throw err
    }
    updateServer(id, { customAddress: { name, owner } })
  } else {
    updateServer(id, { customAddress: undefined })
  }
  if (previous && previous.name !== name) await releaseCustomAddress(previous).catch(() => undefined)
  return null
}

export async function releaseCustomAddress(address: NonNullable<ServerInfo['customAddress']>): Promise<void> {
  await call(address.owner, 'POST', '/addresses/release', { name: address.name })
}

/**
 * Relais du tunnel à viser : son propre SRV (playit, une fois le tunnel connu de tous) ; sinon son nom, avec le port de
 * l'adresse de secours (playit : IP:port) ou 25565 (e4mc)
 */
async function tunnelTarget(publicAddress: string, fallback?: string): Promise<{ target: string; port: number }> {
  const resolver = new Resolver({ timeout: 3000, tries: 2 })
  resolver.setServers(['1.1.1.1', '8.8.8.8'])
  const [srv] = await resolver.resolveSrv(`_minecraft._tcp.${publicAddress}`).catch(() => [])
  if (srv) return { target: srv.name, port: srv.port }
  const port = Number(fallback?.split(':').pop())
  return { target: publicAddress, port: Number.isInteger(port) && port > 0 ? port : 25565 }
}

/** Fait pointer `<nom>.aloriamc.fr` vers le tunnel de ce démarrage ; renvoie l'adresse complète */
export async function pointCustomAddress(id: string, publicAddress: string, fallback?: string): Promise<string | null> {
  const address = getServer(id).customAddress
  if (!address) return null
  const { target, port } = await tunnelTarget(publicAddress, fallback)
  await call(address.owner, 'POST', '/addresses/target', { name: address.name, target, port })
  return `${address.name}.${ADDRESS_DOMAIN}`
}
