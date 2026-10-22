import { useSyncExternalStore } from 'react'
import type { ModpackProgress, Profile, Result, ServerInfo } from '../../../shared/types'
import { t } from '../i18n'

/**
 * Installation (ou mise à jour) de modpack en cours, gardée hors de la fenêtre du modpack : le joueur peut la réduire
 * et continuer à utiliser le launcher, une petite barre en bas de l'écran suit l'avancement. Une seule à la fois.
 */
export interface ModpackTask {
  title: string
  iconUrl: string | null
  update: boolean
  /** Modpack installé comme serveur (page Serveurs) */
  server: boolean
  progress: ModpackProgress | null
  running: boolean
  /** Fenêtre fermée : la barre en bas de l'écran prend le relais */
  minimized: boolean
  result: Profile | ServerInfo | null
  error: string | null
}

let task: ModpackTask | null = null
let onDone: ((profile: Profile) => void) | null = null
const listeners = new Set<() => void>()
let listening = false

function set(next: ModpackTask | null): void {
  task = next
  for (const l of listeners) l()
}

const patch = (p: Partial<ModpackTask>) => task && set({ ...task, ...p })

/** Lance l'installation ; onInstalled n'est appelé que si la fenêtre est encore ouverte à la fin */
export async function startModpackTask(
  info: Pick<ModpackTask, 'title' | 'iconUrl' | 'update' | 'server'>,
  run: () => Promise<Result<Profile | ServerInfo>>,
  onInstalled: (profile: Profile) => void
): Promise<void> {
  if (!listening) {
    listening = true
    window.aloria.modpacks.onProgress((progress) => task?.running && patch({ progress }))
  }
  onDone = onInstalled
  set({ ...info, progress: null, running: true, minimized: false, result: null, error: null })
  const res = await run()
  if (res.ok && task && !task.minimized && !info.server) onDone?.(res.value as Profile)
  onDone = null
  patch(res.ok ? { running: false, result: res.value } : { running: false, error: res.error })
}

export const minimizeModpackTask = () => patch({ minimized: true })

export const clearModpackTask = () => {
  if (!task?.running) set(null)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useModpackTask = () => useSyncExternalStore(subscribe, () => task)

/** Étape en cours : numéro (sur 3), texte et pourcentage (null : barre animée tant qu'on ne connaît pas la quantité) */
export const PROGRESS_STEPS = ['pack', 'files', 'overrides'] as const

export function describeProgress(progress: ModpackProgress | null, update: boolean): { stepIndex: number; percent: number | null; label: string } {
  const stepIndex = progress ? PROGRESS_STEPS.indexOf(progress.step as (typeof PROGRESS_STEPS)[number]) : -1
  const percent = progress && progress.total > 0 ? Math.min(100, Math.floor((progress.done / progress.total) * 100)) : null
  const mb = (bytes: number) => (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)
  const label = !progress
    ? t(update ? 'modpack.stepUpdate' : 'modpack.installing')
    : progress.step === 'pack'
      ? t('modpack.stepPack', { done: mb(progress.done), total: mb(progress.total) })
      : progress.step === 'files'
        ? t('modpack.stepFiles', { done: progress.doneFiles ?? 0, total: progress.totalFiles ?? 0 })
        : progress.step === 'overrides'
          ? t('modpack.stepOverrides', { done: progress.done, total: progress.total })
          : progress.step === 'finish'
            ? t('modpack.stepFinish')
            : t('modpack.installing')
  return { stepIndex, percent, label }
}
