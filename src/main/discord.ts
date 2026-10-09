import { Client } from '@xhayper/discord-rpc'
import { DISCORD_CLIENT_ID, DISCORD_MINECRAFT_ID } from './config'
import { getSettings } from './settings'
import { tm } from './i18n'

/**
 * Statut Discord (« Rich Presence ») : « Joue à Aloria Client », avec le profil, la version
 * et le serveur, selon les réglages. Discord doit être ouvert ; sinon on réessaie régulièrement.
 * Pendant une partie, le statut peut montrer « Joue à Minecraft » : le nom vient de l'application Discord,
 * on se reconnecte donc avec celle de Minecraft le temps de la partie.
 */
let client: Client | null = null
/** Application Discord de la connexion en cours */
let clientId = ''

let ready = false
let retry: NodeJS.Timeout | null = null
const launcherSince = Date.now()

/** Partie en cours (null = dans le launcher). server : adresse, « solo », ou null (menus du jeu) */
let game: { profile: string; version: string; server: string | null; since: number } | null = null

const enabled = () => !!DISCORD_CLIENT_ID && getSettings().discordPresence

/** Application Discord voulue maintenant */
function wantedId(): string {
  return game && getSettings().discordGameName === 'minecraft' ? DISCORD_MINECRAFT_ID : DISCORD_CLIENT_ID
}

function activity(): { details: string; state?: string; startTimestamp: number } {
  if (!game) return { details: tm('discord.inLauncher'), startTimestamp: launcherSince }
  const s = getSettings()
  let details = tm('discord.inGame')
  if (s.discordShowServer && game.server) details = game.server === 'solo' ? tm('discord.singleplayer') : tm('discord.onServer', { server: game.server })
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
    // L'image « aloria » n'existe que dans notre application : avec celle de Minecraft, Discord montre son icône
    const ours = clientId === DISCORD_CLIENT_ID
    await client.user?.setActivity({
      ...activity(),
      ...(ours ? { largeImageKey: 'aloria', largeImageText: 'Aloria Client' } : {}),
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
  if (!enabled() || (ready && clientId === wantedId())) return
  ready = false
  const old = client
  if (old) {
    old.removeAllListeners()
    // Effacer d'abord le statut : sinon l'ancien peut rester affiché un moment
    await old.user?.clearActivity().catch(() => {})
    await old.destroy().catch(() => {})
  }
  clientId = wantedId()
  const current = new Client({ clientId })
  client = current
  current.on('ready', () => {
    if (client !== current) return
    ready = true
    push()
  })
  current.on('disconnected', () => {
    if (client !== current) return
    ready = false
    scheduleRetry()
  })
  try {
    await current.login()
  } catch {
    if (client !== current) return
    ready = false
    scheduleRetry()
  }
}

export function initDiscord(): void {
  connect()
}

/** À appeler quand un réglage Discord change dans le launcher */
export function refreshDiscord(): void {
  update()
}

/** Se (re)connecte si l'application voulue a changé, sinon met juste le statut à jour */
function update(): void {
  if (enabled() && (!ready || clientId !== wantedId())) connect()
  else push()
}

export function setDiscordPlaying(profile: string, version: string): void {
  game = { profile, version, server: null, since: Date.now() }
  update()
}

/** Serveur rejoint (« solo » pour un monde solo, null pour les menus du jeu) */
export function setDiscordServer(server: string | null): void {
  if (!game || game.server === server) return
  game.server = server
  push()
}

export function setDiscordIdle(): void {
  game = null
  update()
}
