import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { tm } from '../i18n'

export interface DownloadTask {
  url: string
  path: string
  sha1?: string
  size?: number
  /** Ne compare que la taille (fichiers adressés par leur hash, comme les assets) */
  sizeOnly?: boolean
  executable?: boolean
}

export interface DownloadProgress {
  doneFiles: number
  totalFiles: number
  doneBytes: number
  totalBytes: number
}

/** Exécute fn sur chaque élément avec au plus `limit` tâches en parallèle ; après une erreur (ou une annulation), plus rien ne démarre. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      try {
        await fn(items[next++])
      } catch (err) {
        failed = true
        throw err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const sha1 = (data: Buffer) => createHash('sha1').update(data).digest('hex')

async function isValid(task: DownloadTask): Promise<boolean> {
  try {
    const st = await stat(task.path)
    if (task.size !== undefined && st.size !== task.size) return false
    if (task.sizeOnly || !task.sha1) return true
    return sha1(await readFile(task.path)) === task.sha1
  } catch {
    return false
  }
}

/** Ne garde que les fichiers absents ou corrompus. */
export async function filterMissing(tasks: DownloadTask[]): Promise<DownloadTask[]> {
  const missing: DownloadTask[] = []
  await pool(tasks, 32, async (t) => {
    if (!(await isValid(t))) missing.push(t)
  })
  return missing
}

/** Rien reçu depuis ce délai : la connexion est figée (Wi-Fi coupé…), on abandonne cet essai pour en refaire un */
const STALL_MS = 30_000
/** Pauses avant chaque nouvel essai : une coupure de quelques secondes ne doit pas épuiser tous les essais d'un coup */
const RETRY_DELAYS = [1000, 3000, 6000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Le serveur peut répondre normalement un peu plus tard */
const retryable = (status: number) => status >= 500 || status === 429 || status === 408

/** Raison lisible d'une erreur réseau (« fetch failed » seul ne dit rien : la vraie cause est dans err.cause) */
function networkReason(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = err.cause as { code?: string; message?: string } | undefined
  return cause?.code ?? cause?.message ?? err.message
}

export interface Fetched {
  ok: boolean
  status: number
  data: Buffer
}

async function fetchOnce(url: string, headers: Record<string, string> | undefined, onBytes?: (done: number) => void): Promise<Fetched> {
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), STALL_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    const chunks: Buffer[] = []
    let done = 0
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        clearTimeout(timer)
        timer = setTimeout(() => controller.abort(), STALL_MS)
        chunks.push(Buffer.from(chunk))
        done += chunk.length
        onBytes?.(done)
      }
    }
    return { ok: res.ok, status: res.status, data: Buffer.concat(chunks) }
  } catch (err) {
    if (controller.signal.aborted) throw new Error(tm('err.stalled'))
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Récupère un fichier en entier, en réessayant (pauses de 1, 3 puis 6 s) après une erreur réseau, une connexion figée
 * ou une réponse 5xx / 429. Les autres réponses (404…) sont renvoyées telles quelles, à l'appelant de les signaler.
 */
export async function fetchBytes(
  url: string,
  options: { headers?: Record<string, string>; onBytes?: (done: number) => void } = {}
): Promise<Fetched> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchOnce(url, options.headers, options.onBytes)
      if (!retryable(res.status) || attempt >= RETRY_DELAYS.length) return res
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) throw new Error(tm('err.download', { url, reason: networkReason(err) }))
    }
    await sleep(RETRY_DELAYS[attempt])
  }
}

/** `onBytes` : octets reçus pour l'essai en cours (repart de 0 à chaque nouvel essai) */
async function downloadOne(task: DownloadTask, onBytes?: (done: number) => void): Promise<number> {
  let reason = ''
  // Deux passes : un fichier coupé en route peut aussi arriver incomplet (sha1 faux)
  for (let pass = 0; pass < 2; pass++) {
    const res = await fetchBytes(task.url, { onBytes })
    if (!res.ok) {
      reason = `HTTP ${res.status}`
      break
    }
    if (task.sha1 && sha1(res.data) !== task.sha1) {
      reason = tm('err.corrupted')
      continue
    }
    await mkdir(dirname(task.path), { recursive: true })
    const tmp = `${task.path}.part`
    await writeFile(tmp, res.data)
    await rename(tmp, task.path)
    if (task.executable && process.platform !== 'win32') await chmod(task.path, 0o755)
    return res.data.length
  }
  throw new Error(tm('err.download', { url: task.url, reason }))
}

/** Progression envoyée au plus toutes les PROGRESS_MS pendant les fichiers (32 en parallèle : sinon des centaines par seconde) */
const PROGRESS_MS = 150

/**
 * Télécharge les fichiers ; la progression avance pendant chaque fichier, octet par octet (un gros mod sur une connexion
 * lente figeait sinon la barre plusieurs minutes, comme bloquée)
 */
export async function downloadAll(
  tasks: DownloadTask[],
  onProgress: (p: DownloadProgress) => void,
  concurrency = 32
): Promise<void> {
  // Un même fichier listé deux fois (l'installeur Forge déclare certaines bibliothèques dans ses deux listes) serait
  // téléchargé en parallèle vers le même .part : le premier le renomme, le second échoue (ENOENT)
  tasks = [...new Map(tasks.map((t) => [t.path, t])).values()]
  // Fichiers terminés, puis octets des fichiers en cours (comptés en plus dans doneBytes, et dans totalBytes si leur
  // taille est inconnue, pour ne jamais dépasser 100 %)
  const finished: DownloadProgress = {
    doneFiles: 0,
    totalFiles: tasks.length,
    doneBytes: 0,
    totalBytes: tasks.reduce((sum, t) => sum + (t.size ?? 0), 0)
  }
  const inFlight = new Map<DownloadTask, number>()
  let lastSent = 0
  const send = (force: boolean) => {
    const now = Date.now()
    if (!force && now - lastSent < PROGRESS_MS) return
    lastSent = now
    let partial = 0
    let unknown = 0
    for (const [t, done] of inFlight) {
      partial += t.size === undefined ? done : Math.min(done, t.size)
      if (t.size === undefined) unknown += done
    }
    onProgress({ ...finished, doneBytes: finished.doneBytes + partial, totalBytes: finished.totalBytes + unknown })
  }
  send(true)
  await pool(tasks, concurrency, async (t) => {
    inFlight.set(t, 0)
    try {
      const bytes = await downloadOne(t, (done) => {
        inFlight.set(t, done)
        send(false)
      })
      finished.doneFiles++
      finished.doneBytes += t.size ?? bytes
      if (t.size === undefined) finished.totalBytes += bytes
    } finally {
      inFlight.delete(t)
    }
    send(true)
  })
}

export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetchBytes(url, { headers })
  if (!res.ok) throw new Error(tm('err.fetch', { url, status: res.status }))
  return JSON.parse(res.data.toString('utf8')) as T
}
