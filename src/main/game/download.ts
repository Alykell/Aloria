import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

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

/** Exécute fn sur chaque élément avec au plus `limit` tâches en parallèle. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
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

async function downloadOne(task: DownloadTask): Promise<number> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(task.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = Buffer.from(await res.arrayBuffer())
      if (task.sha1 && sha1(data) !== task.sha1) throw new Error('fichier corrompu (sha1)')
      await mkdir(dirname(task.path), { recursive: true })
      const tmp = `${task.path}.part`
      await writeFile(tmp, data)
      await rename(tmp, task.path)
      if (task.executable && process.platform !== 'win32') await chmod(task.path, 0o755)
      return data.length
    } catch (err) {
      lastError = err
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Impossible de télécharger ${task.url} : ${reason}`)
}

export async function downloadAll(
  tasks: DownloadTask[],
  onProgress: (p: DownloadProgress) => void,
  concurrency = 16
): Promise<void> {
  const progress: DownloadProgress = {
    doneFiles: 0,
    totalFiles: tasks.length,
    doneBytes: 0,
    totalBytes: tasks.reduce((sum, t) => sum + (t.size ?? 0), 0)
  }
  onProgress(progress)
  await pool(tasks, concurrency, async (t) => {
    const bytes = await downloadOne(t)
    progress.doneFiles++
    progress.doneBytes += t.size ?? bytes
    onProgress(progress)
  })
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de récupérer ${url} (HTTP ${res.status})`)
  return (await res.json()) as T
}
