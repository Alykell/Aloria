import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { paths } from '../game/paths'
import { isSyncedKey, parseOptions } from './options'
import type { SettingsPreset } from '../../shared/types'
import { tm } from '../i18n'

/** Jeu de réglages par défaut, utilisé par les profils qui n'en ont pas choisi */
export const MAIN_PRESET = 'main'

export const sharedDir = join(paths.root, 'shared')
const file = join(sharedDir, 'presets.json')

/** Le options.txt moderne le plus récent parmi les profils (hors profils de test) */
function newestOptionsFile(): string | null {
  if (!existsSync(paths.instances)) return null
  let best: { path: string; mtime: number } | null = null
  for (const id of readdirSync(paths.instances)) {
    if (id.startsWith('selftest')) continue
    const path = join(paths.instances, id, 'options.txt')
    if (!existsSync(path)) continue
    // Les options d'une ancienne version (touches numériques) ne servent pas de base
    if (/key_key\.forward:\d/.test(readFileSync(path, 'utf8'))) continue
    const mtime = statSync(path).mtimeMs
    if (!best || mtime > best.mtime) best = { path, mtime }
  }
  return best?.path ?? null
}

/** Premier lancement : « Mes réglages » reprend les réglages du profil joué le plus récemment */
function bootstrap(): SettingsPreset[] {
  const options: Record<string, string> = {}
  const source = newestOptionsFile()
  if (source) {
    for (const [k, v] of parseOptions(readFileSync(source, 'utf8'))) if (isSyncedKey(k)) options[k] = v
  }
  return [{ id: MAIN_PRESET, name: 'Mes réglages', options }]
}

export function listPresets(): SettingsPreset[] {
  if (!existsSync(file)) {
    const presets = bootstrap()
    savePresets(presets)
    return presets
  }
  try {
    const presets = (JSON.parse(readFileSync(file, 'utf8')) as { presets: SettingsPreset[] }).presets
    return presets.some((p) => p.id === MAIN_PRESET) ? presets : [...bootstrap(), ...presets]
  } catch {
    return bootstrap()
  }
}

function savePresets(presets: SettingsPreset[]): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ presets }, null, 2))
}

export function getPreset(id: string): SettingsPreset | null {
  return listPresets().find((p) => p.id === id) ?? null
}

export function createPreset(name: string, copyFrom: string | null): SettingsPreset {
  const presets = listPresets()
  const source = presets.find((p) => p.id === copyFrom)
  const preset: SettingsPreset = { id: randomUUID().slice(0, 8), name, options: { ...(source?.options ?? {}) } }
  savePresets([...presets, preset])
  return preset
}

export function renamePreset(id: string, name: string): void {
  savePresets(listPresets().map((p) => (p.id === id ? { ...p, name } : p)))
}

export function deletePreset(id: string): void {
  if (id === MAIN_PRESET) throw new Error(tm('err.mainPreset'))
  savePresets(listPresets().filter((p) => p.id !== id))
}

/** Modifie des réglages d'un jeu (valeur null = retirer le réglage) */
export function updatePresetOptions(id: string, patch: Record<string, string | null>): SettingsPreset {
  const presets = listPresets()
  const preset = presets.find((p) => p.id === id)
  if (!preset) throw new Error(tm('err.presetMissing'))
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete preset.options[k]
    else preset.options[k] = v
  }
  savePresets(presets)
  return preset
}
