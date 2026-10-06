import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sharedDir } from './presets'
import { collectShared, type SyncSession } from './sync'

/**
 * Parties en cours dont il faudra récupérer les réglages et la liste de serveurs à la fermeture.
 * Enregistrées sur disque : si le launcher est fermé pendant le jeu, la récupération se fait
 * à sa prochaine ouverture.
 */
interface Pending {
  pid: number
  gameVersion: string
  gameDir: string
  session: SyncSession
}

const file = join(sharedDir, 'pending.json')

function load(): Pending[] {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Pending[]) : []
  } catch {
    return []
  }
}

function save(list: Pending[]): void {
  mkdirSync(sharedDir, { recursive: true })
  writeFileSync(file, JSON.stringify(list, null, 2))
}

export function addPending(entry: Pending): void {
  save([...load().filter((p) => p.pid !== entry.pid), entry])
}

export function removePending(pid: number): void {
  save(load().filter((p) => p.pid !== pid))
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Au démarrage du launcher : récupère les parties terminées pendant qu'il était fermé, surveille les autres */
export async function processPending(): Promise<void> {
  const list = load()
  for (const p of list) {
    if (isAlive(p.pid)) continue
    await collectShared(p.session, p.gameVersion, p.gameDir).catch((err) => console.warn('[réglages partagés]', err))
    removePending(p.pid)
  }
  if (load().length > 0) setTimeout(() => processPending(), 30_000)
}
