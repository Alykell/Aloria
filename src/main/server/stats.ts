import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { cpus } from 'node:os'

/** Mémoire (Mo) et processeur (% de tout le PC, comme le Gestionnaire des tâches) d'un serveur */
export interface ProcessStats {
  ramMb: number
  cpu: number
}

const INTERVAL_MS = 2000

/**
 * Relève la mémoire et le processeur du processus Java toutes les 2 s. Sous Windows, un seul PowerShell reste ouvert
 * et écrit une ligne par relevé (relancer PowerShell à chaque fois coûterait plus que le serveur) ; ailleurs, /proc.
 * Renvoie la fonction qui arrête le suivi.
 */
export function watchProcess(pid: number, onStats: (s: ProcessStats) => void): () => void {
  const cores = Math.max(1, cpus().length)
  let last: { cpuMs: number; at: number } | null = null
  const sample = (ramBytes: number, cpuMs: number) => {
    const at = Date.now()
    const cpu = last ? Math.max(0, Math.min(100, ((cpuMs - last.cpuMs) / ((at - last.at) * cores)) * 100)) : 0
    last = { cpuMs, at }
    onStats({ ramMb: Math.round(ramBytes / 1024 / 1024), cpu: Math.round(cpu * 10) / 10 })
  }

  if (process.platform === 'win32') {
    const script =
      `while ($true) { $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if (-not $p) { break }; ` +
      `[Console]::Out.WriteLine("$($p.WorkingSet64) $([long]$p.TotalProcessorTime.TotalMilliseconds)"); Start-Sleep -Milliseconds ${INTERVAL_MS} }`
    const ps: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    let pending = ''
    ps.stdout?.on('data', (chunk: Buffer) => {
      const parts = (pending + chunk.toString()).split(/\r?\n/)
      pending = parts.pop() ?? ''
      for (const line of parts) {
        const [ram, cpu] = line.trim().split(' ').map(Number)
        if (Number.isFinite(ram) && Number.isFinite(cpu)) sample(ram, cpu)
      }
    })
    ps.on('error', () => {})
    return () => ps.kill()
  }

  // Linux : /proc/<pid>/stat (temps processeur en « ticks », 100 par seconde) et statm (pages de 4 Ko)
  const timer = setInterval(async () => {
    try {
      const stat = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ')[1].split(' ')
      const statm = (await readFile(`/proc/${pid}/statm`, 'utf8')).split(' ')
      sample(Number(statm[1]) * 4096, (Number(stat[11]) + Number(stat[12])) * 10)
    } catch {
      clearInterval(timer)
    }
  }, INTERVAL_MS)
  return () => clearInterval(timer)
}

/** /tick query existe depuis la 1.20.3 (vanilla, et donc aussi Paper, Fabric, Forge, NeoForge) */
export function tickQuerySupported(gameVersion: string): boolean {
  const [major, minor, patch = 0] = gameVersion.split('.').map(Number)
  if (major >= 26) return true
  return major === 1 && (minor > 20 || (minor === 20 && patch >= 3))
}

/** Lignes de la réponse à /tick query : cachées de la console, elles servent seulement à calculer les TPS */
export const TICK_QUERY_LINE =
  /The game is (running|frozen|sprinting)|Target tick rate: |^\s*Average time per tick: |Percentiles: P50: /

/** « Average time per tick: 3.2ms » → millisecondes par tick */
export function parseMspt(line: string): number | null {
  const m = /Average time per tick: ([\d.,]+)ms/.exec(line)
  return m ? Number(m[1].replace(',', '.')) : null
}
