import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { installServer } from './install'
import { parseMspt, TICK_QUERY_LINE, tickQuerySupported, watchProcess } from './stats'
import { acquireAgent, ensureTunnel, releaseAgent } from './playit'
import { writeBackup } from './backups'
import { getServer, serverDirOf, updateServer } from './store'
import type { ServerStatus } from '../../shared/types'
import { tm } from '../i18n'

/** Lignes de console gardées par serveur (la page les réaffiche en revenant) */
const MAX_LINES = 2000
/** Après « stop », temps laissé au serveur pour sauvegarder le monde avant de le forcer à s'arrêter */
const STOP_TIMEOUT_MS = 60_000
/** Mesure des TPS (/tick query, réponse cachée de la console) */
const TPS_INTERVAL_MS = 5000

interface Running {
  status: ServerStatus
  child: ChildProcessWithoutNullStreams | null
  lines: string[]
  /** Arrêt demandé : une sortie du processus n'est pas un crash */
  stopping: boolean
  /** Suivi de la mémoire, du processeur et des TPS, arrêté avec le serveur */
  cleanup: (() => void)[]
  /** Jusqu'à quand cacher la réponse à notre /tick query */
  hideTickUntil: number
  /** Attentes d'une ligne précise de la console (fin d'enregistrement du monde avant une sauvegarde) */
  waiters: ((line: string) => boolean)[]
  /** Sauvegarde en cours (une seule à la fois) */
  backingUp: boolean
}

const servers = new Map<string, Running>()
let target: WebContents | null = null

export function setServerTarget(wc: WebContents): void {
  target = wc
}

const idle = (id: string): ServerStatus => ({ id, state: 'stopped', publicAddress: null, players: [] })

function entry(id: string): Running {
  let r = servers.get(id)
  if (!r) {
    r = { status: idle(id), child: null, lines: [], stopping: false, cleanup: [], hideTickUntil: 0, waiters: [], backingUp: false }
    servers.set(id, r)
  }
  return r
}

function emit(r: Running): void {
  if (target && !target.isDestroyed()) target.send('servers:status', r.status)
}

function setStatus(r: Running, patch: Partial<ServerStatus>): void {
  r.status = { ...r.status, ...patch }
  emit(r)
}

function addLine(id: string, r: Running, line: string): void {
  r.waiters = r.waiters.filter((w) => !w(line))
  r.lines.push(line)
  if (r.lines.length > MAX_LINES) r.lines.splice(0, r.lines.length - MAX_LINES)
  if (target && !target.isDestroyed()) target.send('servers:log', { id, line })
}

/**
 * playit.gg : tunnel du serveur (adresse fixe) et relais. Une erreur (compte pas relié, réseau) n'empêche pas le serveur
 * de tourner : elle s'affiche à la place de l'adresse, et peut être retentée (après avoir relié le compte).
 */
export async function connectTunnel(id: string): Promise<void> {
  const r = entry(id)
  const server = getServer(id)
  if (server.tunnel !== 'playit' || !r.child) return
  setStatus(r, { tunnelError: undefined })
  try {
    // Le programme de playit d'abord : il annonce sa version à playit.gg, qui refuse sinon de créer le tunnel
    // (« AgentVersionTooOld »)
    await acquireAgent(id, () => {})
    r.cleanup.push(() => releaseAgent(id))
    const { address, fallback } = await ensureTunnel(server)
    setStatus(r, { publicAddress: address, fallbackAddress: fallback ?? undefined })
  } catch (err) {
    setStatus(r, { tunnelError: err instanceof Error ? err.message : String(err) })
  }
}

export const serverStatuses = (): ServerStatus[] => [...servers.values()].map((r) => r.status)
export const serverLog = (id: string): string[] => servers.get(id)?.lines ?? []
export const isServerAlive = (id: string): boolean => !!servers.get(id)?.child
export const anyServerRunning = (): boolean => [...servers.values()].some((r) => r.child !== null)

/** Ce que la console du serveur nous apprend : prêt, adresse e4mc, joueurs qui arrivent ou partent */
function parse(r: Running, line: string): void {
  if (r.status.state === 'starting' && /\]: Done \(/.test(line)) {
    setStatus(r, { state: 'running' })
    startTpsQueries(r)
    startAutoBackups(r)
  }
  const domain = /Domain assigned: (\S+)/.exec(line)
  if (domain) setStatus(r, { publicAddress: domain[1] })
  const joined = /\]: (\w{1,16}) joined the game/.exec(line)
  if (joined && !r.status.players.includes(joined[1])) setStatus(r, { players: [...r.status.players, joined[1]] })
  const left = /\]: (\w{1,16}) left the game/.exec(line)
  if (left) setStatus(r, { players: r.status.players.filter((p) => p !== left[1]) })
}

/** Attend une ligne de la console (au plus `timeoutMs`) */
function waitForLine(r: Running, re: RegExp, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      r.waiters = r.waiters.filter((w) => w !== waiter)
      resolve(false)
    }, timeoutMs)
    const waiter = (line: string) => {
      if (!re.test(line)) return false
      clearTimeout(timer)
      resolve(true)
      return true
    }
    r.waiters.push(waiter)
  })
}

/**
 * Sauvegarde le monde. Serveur allumé : on coupe ses enregistrements automatiques, on lui fait tout écrire sur le
 * disque (« save-all flush »), on zippe, puis on les remet : le zip n'attrape jamais un fichier à moitié écrit.
 */
export async function backupServer(id: string, kind: 'manual' | 'auto' | 'version' = 'manual'): Promise<string | null> {
  const r = entry(id)
  if (r.backingUp) throw new Error(tm('err.serverBackupBusy'))
  r.backingUp = true
  const child = r.child
  try {
    if (child && r.status.state === 'running') {
      addLine(id, r, `> ${tm('server.console.backup')}`)
      child.stdin.write('save-off\n')
      const saved = waitForLine(r, /Saved the game|All dimensions are saved|Saved the world/i, 30_000)
      child.stdin.write('save-all flush\n')
      await saved
    }
    const file = await writeBackup(id, kind)
    if (child && r.child === child) addLine(id, r, `> ${tm('server.console.backupDone', { file: file ?? '-' })}`)
    return file
  } finally {
    if (child && r.child === child) child.stdin.write('save-on\n')
    r.backingUp = false
  }
}

/** Sauvegardes automatiques pendant que le serveur tourne (réglage du serveur, en heures) */
function startAutoBackups(r: Running): void {
  const id = r.status.id
  const hours = getServer(id).backupHours ?? 6
  if (hours <= 0) return
  const timer = setInterval(() => backupServer(id, 'auto').catch(() => {}), hours * 3_600_000)
  r.cleanup.push(() => clearInterval(timer))
}

/** Toutes les 5 s, /tick query (1.20.3 et plus) : le temps moyen d'un tick donne les TPS */
function startTpsQueries(r: Running): void {
  const id = r.status.id
  if (!tickQuerySupported(getServer(id).gameVersion)) return
  const query = () => {
    if (!r.child) return
    r.hideTickUntil = Date.now() + 2000
    r.child.stdin.write('tick query\n')
  }
  query()
  const timer = setInterval(query, TPS_INTERVAL_MS)
  r.cleanup.push(() => clearInterval(timer))
}

/** Remplace (ou ajoute) une ligne de server.properties */
async function setProperty(dir: string, key: string, value: string): Promise<void> {
  const file = join(dir, 'server.properties')
  const text = existsSync(file) ? await readFile(file, 'utf8') : ''
  const re = new RegExp(`^${key.replace(/[.-]/g, '\\$&')}=.*$`, 'm')
  const line = `${key}=${value}`
  await writeFile(file, re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`)
}

export async function startServer(id: string): Promise<void> {
  const r = entry(id)
  if (r.child || r.status.state === 'installing') return
  const server = getServer(id)
  const dir = serverDirOf(id)
  r.lines = []
  r.stopping = false
  setStatus(r, { ...idle(id), state: 'installing', label: tm('server.step.prepare') })
  try {
    // Changement de version : le monde est converti pour de bon au démarrage, on en garde une copie avant
    if (server.installed && server.installed.gameVersion !== server.gameVersion) {
      setStatus(r, { label: tm('server.step.backup') })
      await backupServer(id, 'version')
    }
    const spec = await installServer(server, (label, progress) => setStatus(r, { label, progress }))
    await setProperty(dir, 'server-port', String(server.port))
    const args = [
      `-Xmx${server.ramMb}M`,
      `-Xms${Math.min(server.ramMb, 1024)}M`,
      // Console en UTF-8 (accents des noms de joueurs, messages traduits)
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
      '-Dfile.encoding=UTF-8',
      ...spec.args
    ]
    addLine(id, r, `> ${tm('server.console.starting')}`)
    const child = spawn(spec.java, args, { cwd: dir, windowsHide: true })
    r.child = child
    if (child.pid) {
      const pid = child.pid
      r.cleanup.push(
        watchProcess(pid, (s) => setStatus(r, { stats: { ...r.status.stats, ramMb: s.ramMb, ramMaxMb: server.ramMb, cpu: s.cpu } }))
      )
    }
    updateServer(id, { lastStarted: Date.now() })
    setStatus(r, { state: 'starting', label: undefined, progress: undefined })
    connectTunnel(id)

    let pending = ''
    const onData = (chunk: Buffer) => {
      const text = pending + chunk.toString('utf8')
      const parts = text.split(/\r?\n/)
      pending = parts.pop() ?? ''
      for (const line of parts) {
        if (!line) continue
        // Réponse à notre /tick query : on garde les TPS, sans remplir la console
        if (Date.now() < r.hideTickUntil && TICK_QUERY_LINE.test(line)) {
          const mspt = parseMspt(line)
          if (mspt !== null) setStatus(r, { stats: { ...r.status.stats, mspt, tps: Math.min(20, 1000 / Math.max(mspt, 0.001)) } })
          continue
        }
        addLine(id, r, line)
        parse(r, line)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => {
      addLine(id, r, `! ${err.message}`)
    })
    child.on('exit', (code) => {
      r.child = null
      for (const stop of r.cleanup.splice(0)) stop()
      const crashed = !r.stopping && code !== 0
      addLine(id, r, `> ${tm('server.console.stopped', { code: String(code ?? '?') })}`)
      setStatus(r, { ...idle(id), error: crashed ? tm('err.serverCrashed', { code: String(code ?? '?') }) : undefined })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    addLine(id, r, `! ${message}`)
    setStatus(r, { ...idle(id), error: message })
    throw err
  }
}

/** Envoie une commande à la console du serveur (« op Alykell », « say Salut »…) */
export function sendCommand(id: string, command: string): void {
  const r = servers.get(id)
  if (!r?.child) return
  const text = command.replace(/^\//, '').trim()
  if (!text) return
  addLine(id, r, `> /${text}`)
  r.child.stdin.write(`${text}\n`)
}

/** Arrêt propre (« stop » sauvegarde le monde) ; forcé si le serveur ne répond plus */
export function stopServer(id: string): Promise<void> {
  const r = servers.get(id)
  const child = r?.child
  if (!r || !child) return Promise.resolve()
  r.stopping = true
  setStatus(r, { state: 'stopping' })
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), STOP_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.stdin.write('stop\n')
  })
}

/** Arrêt immédiat, sans sauvegarder (serveur bloqué) */
export function killServer(id: string): void {
  const r = servers.get(id)
  if (!r?.child) return
  r.stopping = true
  addLine(id, r, `> ${tm('server.console.killed')}`)
  r.child.kill()
}

export async function restartServer(id: string): Promise<void> {
  await stopServer(id)
  await startServer(id)
}

export async function stopAllServers(): Promise<void> {
  await Promise.all([...servers.keys()].map((id) => stopServer(id)))
}
