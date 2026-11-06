import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { Resolver } from 'node:dns/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import { downloadAll } from '../game/download'
import { paths } from '../game/paths'
import type { PlayitUsage, ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/**
 * playit.gg : adresse publique fixe pour n'importe quel serveur (Paper, Vanilla…), sans ouvrir de ports.
 * Le PC est relié une fois au compte playit du joueur (page ouverte dans le navigateur) ; la clé obtenue sert ensuite
 * à créer un tunnel « Minecraft Java » par serveur (API de playit) et à faire tourner leur programme, qui relaie les joueurs.
 */
const API = 'https://api.playit.gg'
/** Programme officiel de playit (version fixée : son fonctionnement a déjà changé d'une version à l'autre) */
const AGENT_VERSION = 'v1.2.0'
const AGENT_FILES: Partial<Record<NodeJS.Platform, string>> = {
  // Le service (« playitd ») : il prend la clé en option, sans installation ni fenêtre (depuis la 1.2, le programme « playit »
  // n'est plus qu'une interface pour lui). La 1.2 fait passer les tunnels NetherNet (Bedrock 26.x)
  win32: 'playitd-windows-x86_64-signed.exe',
  linux: 'playit-linux-amd64'
}

const dir = join(paths.root, 'playit')
const configFile = join(dir, 'playit.json')

interface PlayitConfig {
  secretKey: string
}

function config(): PlayitConfig | null {
  try {
    return JSON.parse(readFileSync(configFile, 'utf8')) as PlayitConfig
  } catch {
    return null
  }
}

export const playitLinked = (): boolean => !!config()?.secretKey

/** Appel à l'API de playit (POST JSON, réponse { status, data }) */
async function call<T>(path: string, body: unknown, secret?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Agent-Key ${secret}` } : {}) },
    body: JSON.stringify(body)
  })
  const json = (await res.json().catch(() => null)) as { status: string; data: unknown } | null
  if (json?.status === 'success') return json.data as T
  if (secret && (res.status === 401 || (json?.data as { message?: string } | null)?.message === 'InvalidAgentKey')) {
    return forgetRevokedKey()
  }
  const detail = json ? JSON.stringify(json.data) : `HTTP ${res.status}`
  throw Object.assign(new Error(tm('err.playitApi', { detail })), { playit: json?.data })
}

// ---------------------------------------------------------------- liaison du compte

let linking: Promise<void> | null = null

/**
 * Relie ce PC au compte playit du joueur : ouvre la page de playit dans le navigateur et attend qu'il accepte
 * (10 minutes au plus). La clé est gardée dans %APPDATA%\.aloria\playit\playit.json.
 */
export function linkPlayit(): Promise<void> {
  linking ??= (async () => {
    const code = randomBytes(5).toString('hex')
    const setup = () => call<string>('/claim/setup', { code, agent_type: 'self-managed', version: 'Aloria' })
    await setup()
    await shell.openExternal(`https://playit.gg/claim/${code}`)
    const end = Date.now() + 10 * 60_000
    while (Date.now() < end) {
      const state = await setup().catch(() => 'WaitingForUser')
      if (state === 'UserRejected') throw new Error(tm('err.playitRejected'))
      if (state === 'UserAccepted') {
        const { secret_key } = await call<{ secret_key: string }>('/claim/exchange', { code })
        await mkdir(dir, { recursive: true })
        await writeFile(configFile, JSON.stringify({ secretKey: secret_key } satisfies PlayitConfig, null, 2))
        return
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    throw new Error(tm('err.playitTimeout'))
  })().finally(() => {
    linking = null
  })
  return linking
}

export async function unlinkPlayit(): Promise<void> {
  await rm(configFile, { force: true })
}

/**
 * Clé refusée par playit.gg (PC retiré du compte sur leur site, compte supprimé…) : on l'oublie, pour que la page
 * Serveurs propose de relier le compte à nouveau au lieu d'échouer à chaque démarrage
 */
async function forgetRevokedKey(): Promise<never> {
  await unlinkPlayit()
  throw Object.assign(new Error(tm('err.playitRevoked')), { playitRevoked: true })
}

// ---------------------------------------------------------------- tunnels

interface RunData {
  agent_id: string
  tunnels: {
    id: string
    name: string | null
    local_port: number
    assigned_domain: string
    custom_domain: string | null
    port: { from: number }
    tunnel_type?: string | null
  }[]
  pending: { id: string; name: string | null }[]
}

/**
 * Tunnels d'un serveur : Java (TCP), et pour le crossplay un tunnel « nethernet » (UDP), la connexion de Bedrock 26.x :
 * la signalisation passe par le service de playit (nethernet.playit.gg, avec le jeton du tunnel), le jeu par le tunnel
 */
export type TunnelKind = 'java' | 'bedrock'
const SUFFIXES: Record<TunnelKind, string> = { java: '', bedrock: '-bedrock' }
const TUNNEL_TYPES: Record<TunnelKind, string> = { java: 'minecraft-java', bedrock: 'nethernet' }
const tunnelName = (server: ServerInfo, kind: TunnelKind = 'java') => `aloria-${server.id}${SUFFIXES[kind]}`

/** Le programme de playit vient de démarrer : tant qu'il ne s'est pas présenté à playit.gg, sa version est inconnue */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const end = Date.now() + 30_000
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      const reason = (err as { playit?: unknown }).playit
      if (reason !== 'AgentVersionTooOld' || Date.now() > end) throw err
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

/**
 * Tunnel du serveur (créé au premier démarrage, ou recréé si le port a changé) ; renvoie l'adresse à donner aux amis.
 * Les tunnels « Minecraft Java » ont un nom de domaine qui marche sans numéro de port.
 */
export interface TunnelAddress {
  /** Nom de domaine à donner aux amis (sans port : il a un enregistrement SRV) */
  address: string
  /** IP:port du relais, qui marche même avant que le nom de domaine soit connu de toutes les box */
  fallback: string | null
  /** Tunnel NetherNet : jeton pour la signalisation de playit (réglage nxs de Geyser) */
  nethernetToken?: string
}

/** IP:port du relais, demandée à un DNS public (celui de la box peut ne pas encore connaître un tunnel tout neuf) */
async function fallbackAddress(domain: string, port: number): Promise<string | null> {
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 1 })
    resolver.setServers(['1.1.1.1', '8.8.8.8'])
    const [ip] = await resolver.resolve4(domain)
    return ip ? `${ip}:${port}` : null
  } catch {
    return null
  }
}

/**
 * Bedrock (crossplay) : tunnel TCP + UDP vers le port de Geyser. Le jeu Bedrock ne lit pas les enregistrements SRV :
 * l'adresse s'utilise avec son port (« domaine:port »).
 */
export async function ensureTunnel(server: ServerInfo, kind: TunnelKind = 'java'): Promise<TunnelAddress> {
  const secret = config()?.secretKey
  if (!secret) throw new Error(tm('err.playitNotLinked'))
  const name = tunnelName(server, kind)
  const localPort = kind === 'java' ? server.port : (server.bedrockPort ?? 19132)
  let run = await call<RunData>('/agents/rundata', {}, secret)
  let tunnel = run.tunnels.find((t) => t.name === name)
  // Port changé, ou tunnel d'un ancien type (« minecraft-bedrock », RakNet, que Bedrock n'accepte plus) : recréé
  if (tunnel && (tunnel.local_port !== localPort || (tunnel.tunnel_type && tunnel.tunnel_type !== TUNNEL_TYPES[kind]))) {
    await call('/tunnels/delete', { tunnel_id: tunnel.id }, secret)
    tunnel = undefined
  }
  if (!tunnel) {
    // Déjà demandé à un démarrage précédent, toujours en attente : on l'attend au lieu d'en demander un autre
    const pending = run.pending.find((p) => p.name === name)
    const created =
      pending ??
      (await withRetry(() =>
        call<{ id: string }>(
          '/tunnels/create',
          {
            name,
            tunnel_type: TUNNEL_TYPES[kind],
            port_type: kind === 'bedrock' ? 'udp' : 'tcp',
            port_count: 1,
            origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: localPort } },
            enabled: true,
            alloc: null,
            firewall_id: null,
            proxy_protocol: null
          },
          secret
        )
      ))
    // Le tunnel reçoit son adresse en quelques secondes
    const end = Date.now() + 60_000
    while (!tunnel && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 2000))
      run = await call<RunData>('/agents/rundata', {}, secret)
      tunnel = run.tunnels.find((t) => t.id === created.id)
    }
    if (!tunnel) {
      // Toujours en attente : le compte gratuit de playit.gg n'accepte que 4 tunnels
      throw new Error(
        tm(run.tunnels.length >= PLAYIT_FREE_TUNNELS ? 'err.playitTunnelLimit' : 'err.playitTunnelTimeout', { n: run.tunnels.length })
      )
    }
  }
  const domain = tunnel.custom_domain ?? tunnel.assigned_domain
  const fallback = await fallbackAddress(tunnel.assigned_domain, tunnel.port.from)
  if (kind === 'bedrock') {
    // Le jeton n'est que dans la liste des tunnels du compte ; les joueurs Bedrock tapent le nom du tunnel et le port 19132
    const list = await call<{ tunnels: { id: string; nethernet_token: string | null }[] }>('/tunnels/list', {}, secret)
    const token = list.tunnels.find((t) => t.id === tunnel!.id)?.nethernet_token
    if (!token) throw new Error(tm('err.playitTunnelTimeout', { n: run.tunnels.length }))
    return { address: tunnel.assigned_domain, fallback, nethernetToken: token }
  }
  return { address: domain, fallback }
}

/** Places du compte gratuit de playit.gg (le 5e tunnel reste en attente pour toujours) */
export const PLAYIT_FREE_TUNNELS = 4

/** Adresses utilisées sur le compte (pour griser playit.gg quand il est plein) */
export async function playitUsage(): Promise<PlayitUsage> {
  const secret = config()?.secretKey
  const unlinked = { linked: false, used: 0, max: PLAYIT_FREE_TUNNELS, serverIds: [] }
  if (!secret) return unlinked
  const run = await call<RunData>('/agents/rundata', {}, secret).catch((err) => {
    if ((err as { playitRevoked?: boolean }).playitRevoked) return null
    throw err
  })
  if (!run) return unlinked
  const names = [...new Set([...run.tunnels, ...run.pending].map((t) => t.name ?? ''))]
  return {
    linked: true,
    used: run.tunnels.length,
    max: PLAYIT_FREE_TUNNELS,
    serverIds: [...new Set(names.filter((n) => n.startsWith('aloria-')).map((n) => n.slice('aloria-'.length).replace(/-bedrock$/, '')))]
  }
}

/** Supprime les tunnels d'un serveur supprimé, ou seulement ceux indiqués (sans erreur si playit n'est pas relié ou injoignable) */
export async function deleteTunnel(server: ServerInfo, only?: TunnelKind[]): Promise<void> {
  const secret = config()?.secretKey
  if (!secret) return
  try {
    const run = await call<RunData>('/agents/rundata', {}, secret)
    // Le tunnel actif, et les demandes encore en attente (compte plein)
    const names = (only ?? (Object.keys(SUFFIXES) as TunnelKind[])).map((kind) => tunnelName(server, kind))
    const ids = [...run.tunnels, ...run.pending].filter((t) => names.includes(t.name ?? '')).map((t) => t.id)
    for (const id of ids) await call('/tunnels/delete', { tunnel_id: id }, secret)
  } catch {
    // Le tunnel restera visible sur le site de playit, où on peut le supprimer à la main
  }
}

// ---------------------------------------------------------------- programme playit (relais)

let agent: ChildProcess | null = null
const users = new Set<string>()

async function agentExecutable(onStep: (label: string, progress?: number) => void): Promise<string> {
  const file = AGENT_FILES[process.platform]
  if (!file) throw new Error(tm('err.playitPlatform'))
  const exe = join(dir, process.platform === 'win32' ? `playit-${AGENT_VERSION}.exe` : `playit-${AGENT_VERSION}`)
  if (!existsSync(exe)) {
    onStep(tm('server.step.playit'))
    const url = `https://github.com/playit-cloud/playit-agent/releases/download/${AGENT_VERSION}/${file}`
    await downloadAll([{ url, path: exe }], (p) => onStep(tm('server.step.playit'), p.totalBytes ? p.doneBytes / p.totalBytes : undefined))
    if (process.platform !== 'win32') await chmod(exe, 0o755)
  }
  return exe
}

/** Démarre le relais de playit pour ce serveur (un seul programme pour tous les serveurs) */
export async function acquireAgent(serverId: string, onStep: (label: string, progress?: number) => void): Promise<void> {
  const secret = config()?.secretKey
  if (!secret) throw new Error(tm('err.playitNotLinked'))
  users.add(serverId)
  if (agent) return
  const exe = await agentExecutable(onStep)
  const args = ['--secret', secret, '--log-path', join(dir, 'playit.log')]
  // Sous Linux, son socket par défaut (/run/playit) n'existe qu'une fois playit installé en service : on le met chez nous,
  // sans celui d'un programme mal arrêté (sinon « Address in use »)
  if (process.platform !== 'win32') {
    const socket = join(dir, 'playitd.sock')
    await rm(socket, { force: true })
    args.push('--socket-path', socket)
  }
  const child = spawn(exe, args, { cwd: dir, windowsHide: true })
  let output = ''
  const keep = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-1000)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('error', () => {})
  agent = child
  // Un programme qui s'arrête tout de suite a refusé de démarrer (ex. clé révoquée sur le site) : on le dit
  const exited = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? -1)
    })
  })
  if (exited !== null) {
    agent = null
    users.delete(serverId)
    // « The configured playit secret is no longer valid »
    if (/secret is no longer valid|InvalidAgentKey/i.test(output)) return forgetRevokedKey()
    throw new Error(tm('err.playitAgent', { detail: output.trim().split(/\r?\n/).pop() ?? String(exited) }))
  }
  child.on('exit', () => {
    if (agent === child) agent = null
  })
}

/** Le serveur s'arrête : le relais aussi, si plus aucun serveur n'en a besoin */
export function releaseAgent(serverId: string): void {
  users.delete(serverId)
  if (users.size === 0 && agent) {
    agent.kill()
    agent = null
  }
}
