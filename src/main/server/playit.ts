import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { Resolver } from 'node:dns/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import { downloadAll } from '../game/download'
import { paths } from '../game/paths'
import type { ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/**
 * playit.gg : adresse publique fixe pour n'importe quel serveur (Paper, Vanilla…), sans ouvrir de ports.
 * Le PC est relié une fois au compte playit du joueur (page ouverte dans le navigateur) ; la clé obtenue sert ensuite
 * à créer un tunnel « Minecraft Java » par serveur (API de playit) et à faire tourner leur programme, qui relaie les joueurs.
 */
const API = 'https://api.playit.gg'
/** Programme officiel de playit (version fixée : son fonctionnement a déjà changé d'une version à l'autre) */
const AGENT_VERSION = 'v1.0.12'
const AGENT_FILES: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'playit-windows-x86_64-signed.exe',
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
  }[]
  pending: { id: string }[]
}

const tunnelName = (server: ServerInfo) => `aloria-${server.id}`

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

export async function ensureTunnel(server: ServerInfo): Promise<TunnelAddress> {
  const secret = config()?.secretKey
  if (!secret) throw new Error(tm('err.playitNotLinked'))
  let run = await call<RunData>('/agents/rundata', {}, secret)
  let tunnel = run.tunnels.find((t) => t.name === tunnelName(server))
  if (tunnel && tunnel.local_port !== server.port) {
    await call('/tunnels/delete', { tunnel_id: tunnel.id }, secret)
    tunnel = undefined
  }
  if (!tunnel) {
    const created = await withRetry(() =>
      call<{ id: string }>(
        '/tunnels/create',
        {
          name: tunnelName(server),
          tunnel_type: 'minecraft-java',
          port_type: 'tcp',
          port_count: 1,
          origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: server.port } },
          enabled: true,
          alloc: null,
          firewall_id: null,
          proxy_protocol: null
        },
        secret
      )
    )
    // Le tunnel reçoit son adresse en quelques secondes
    const end = Date.now() + 60_000
    while (!tunnel && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 2000))
      run = await call<RunData>('/agents/rundata', {}, secret)
      tunnel = run.tunnels.find((t) => t.id === created.id)
    }
    if (!tunnel) throw new Error(tm('err.playitTunnelTimeout'))
  }
  const domain = tunnel.custom_domain ?? tunnel.assigned_domain
  return { address: domain, fallback: await fallbackAddress(tunnel.assigned_domain, tunnel.port.from) }
}

/** Supprime le tunnel d'un serveur supprimé (sans erreur si playit n'est pas relié ou injoignable) */
export async function deleteTunnel(server: ServerInfo): Promise<void> {
  const secret = config()?.secretKey
  if (!secret) return
  try {
    const run = await call<RunData>('/agents/rundata', {}, secret)
    const tunnel = run.tunnels.find((t) => t.name === tunnelName(server))
    if (tunnel) await call('/tunnels/delete', { tunnel_id: tunnel.id }, secret)
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
  const child = spawn(exe, ['--secret', secret, '--log-path', join(dir, 'playit.log')], { cwd: dir, windowsHide: true })
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
