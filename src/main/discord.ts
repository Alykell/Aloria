import { Client } from '@xhayper/discord-rpc'
import { DISCORD_CLIENT_ID } from './config'
import { getSettings } from './settings'

/**
 * Statut Discord (« Rich Presence ») : « Joue à Aloria Client », avec le profil, la version
 * et le serveur, selon les réglages. Discord doit être ouvert ; sinon on réessaie régulièrement.
 */
let client: Client | null = null
let ready = false
let retry: NodeJS.Timeout | null = null
const launcherSince = Date.now()

/** Partie en cours (null = dans le launcher). server : adresse, « solo », ou null (menus du jeu) */
let game: { profile: string; version: string; server: string | null; since: number } | null = null

const enabled = () => !!DISCORD_CLIENT_ID && getSettings().discordPresence

function activity(): { details: string; state?: string; startTimestamp: number } {
  if (!game) return { details: 'Dans le launcher', startTimestamp: launcherSince }
  const s = getSettings()
  let details = 'En jeu'
  if (s.discordShowServer && game.server) details = game.server === 'solo' ? 'En solo' : `Sur ${game.server}`
  const parts = [s.discordShowProfile ? game.profile : null, s.discordShowVersion ? game.version : null].filter(Boolean)
  return { details, state: parts.length ? parts.join(' · ') : undefined, startTimestamp: game.since }
}

async function push(): Promise<void> {
  if (!client || !ready) return
  try {
    if (!enabled()) {
      await client.user?.clearActivity()
      return
    }
    await client.user?.setActivity({
      ...activity(),
      largeImageKey: 'aloria',
      largeImageText: 'Aloria Client',
      instance: false
    })
  } catch {
    // Discord fermé entre-temps : la reconnexion s'en chargera
  }
}

function scheduleRetry(): void {
  if (retry) return
  retry = setTimeout(() => {
    retry = null
    connect()
  }, 30_000)
}

async function connect(): Promise<void> {
  if (!enabled() || ready) return
  client?.destroy().catch(() => {})
  client = new Client({ clientId: DISCORD_CLIENT_ID })
  client.on('ready', () => {
    ready = true
    push()
  })
  client.on('disconnected', () => {
    ready = false
    scheduleRetry()
  })
  try {
    await client.login()
  } catch {
    ready = false
    scheduleRetry()
  }
}

export function initDiscord(): void {
  connect()
}

/** À appeler quand un réglage Discord change dans le launcher */
export function refreshDiscord(): void {
  if (enabled() && !ready) connect()
  else push()
}

export function setDiscordPlaying(profile: string, version: string): void {
  game = { profile, version, server: null, since: Date.now() }
  push()
}

/** Serveur rejoint (« solo » pour un monde solo, null pour les menus du jeu) */
export function setDiscordServer(server: string | null): void {
  if (!game || game.server === server) return
  game.server = server
  push()
}

export function setDiscordIdle(): void {
  game = null
  push()
}
