import { Client } from '@xhayper/discord-rpc'
import { DISCORD_CLIENT_ID } from './config'
import { getSettings } from './settings'

/**
 * Statut Discord (« Rich Presence ») : « Joue à Aloria », avec le profil lancé et le temps de jeu.
 * Discord doit être ouvert ; sinon on réessaie régulièrement sans gêner le launcher.
 */
let client: Client | null = null
let ready = false
let retry: NodeJS.Timeout | null = null
let current: { details: string; state?: string; startTimestamp?: number } = { details: 'Dans le launcher' }
const launcherSince = Date.now()

const enabled = () => !!DISCORD_CLIENT_ID && getSettings().discordPresence

async function push(): Promise<void> {
  if (!client || !ready) return
  try {
    if (!enabled()) {
      await client.user?.clearActivity()
      return
    }
    await client.user?.setActivity({
      details: current.details,
      state: current.state,
      startTimestamp: current.startTimestamp ?? launcherSince,
      largeImageKey: 'aloria',
      largeImageText: 'Aloria — launcher Minecraft',
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

/** À appeler quand le réglage change dans le launcher */
export function refreshDiscord(): void {
  if (enabled()) {
    if (ready) push()
    else connect()
  } else {
    push()
  }
}

export function setDiscordPlaying(profileName: string, versionLabel: string): void {
  current = { details: `En jeu · ${profileName}`, state: versionLabel, startTimestamp: Date.now() }
  push()
}

export function setDiscordIdle(): void {
  current = { details: 'Dans le launcher' }
  push()
}
