import AdmZip from 'adm-zip'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { paths } from '../game/paths'
import { fromLegacy, isLegacyVersion, isSyncedKey, parseOptions, serializeOptions, toLegacy } from './options'
import { getPreset, MAIN_PRESET, sharedDir, updatePresetOptions } from './presets'
import type { Profile } from '../../shared/types'

const sharedServers = join(sharedDir, 'servers.dat')

/** Ce qui a été appliqué au lancement, pour savoir quoi récupérer à la fermeture du jeu */
export interface SyncSession {
  serversMtime: number | null
  presetId: string | null
}

export const sharesServers = (profile: Profile) => profile.shareServers !== false
export const presetOf = (profile: Profile) => (profile.settingsPreset === undefined ? MAIN_PRESET : profile.settingsPreset)

/** Première fois : la liste commune reprend la liste de serveurs modifiée le plus récemment */
function newestServersFile(): string | null {
  if (!existsSync(paths.instances)) return null
  let best: { path: string; mtime: number } | null = null
  for (const id of readdirSync(paths.instances)) {
    if (id.startsWith('selftest')) continue
    const path = join(paths.instances, id, 'servers.dat')
    if (!existsSync(path)) continue
    const mtime = statSync(path).mtimeMs
    if (!best || mtime > best.mtime) best = { path, mtime }
  }
  return best?.path ?? null
}

/** Numéro de format des données du jeu, nécessaire en tête d'un options.txt moderne */
function dataVersion(clientJar: string): number | null {
  try {
    const entry = new AdmZip(clientJar).getEntry('version.json')
    const json = entry ? (JSON.parse(entry.getData().toString('utf8')) as { world_version?: number }) : null
    return json?.world_version ?? null
  } catch {
    return null
  }
}

/** Avant le lancement : copie la liste de serveurs commune et applique le jeu de réglages du profil */
export async function applyShared(profile: Profile, gameVersion: string, gameDir: string, clientJar: string): Promise<SyncSession> {
  await mkdir(gameDir, { recursive: true })
  const session: SyncSession = { serversMtime: null, presetId: null }

  if (sharesServers(profile)) {
    const target = join(gameDir, 'servers.dat')
    if (!existsSync(sharedServers)) {
      const source = newestServersFile()
      if (source) {
        await mkdir(sharedDir, { recursive: true })
        await copyFile(source, sharedServers)
      }
    }
    if (existsSync(sharedServers)) await copyFile(sharedServers, target)
    session.serversMtime = existsSync(target) ? (await stat(target)).mtimeMs : 0
  }

  const preset = presetOf(profile) ? getPreset(presetOf(profile)!) : null
  if (preset) {
    const legacy = isLegacyVersion(gameVersion)
    const optionsFile = join(gameDir, 'options.txt')
    let entries: [string, string][]
    if (existsSync(optionsFile)) {
      entries = parseOptions(await readFile(optionsFile, 'utf8'))
    } else {
      // Nouveau profil : options.txt minimal ; les versions modernes exigent le numéro de format en tête
      entries = []
      const version = legacy ? null : dataVersion(clientJar)
      if (!legacy && version === null) return session
      if (version !== null) entries.push(['version', String(version)])
    }
    const index = new Map(entries.map(([k], i) => [k, i]))
    for (const [key, value] of Object.entries(preset.options)) {
      const converted = legacy ? toLegacy(key, value) : value
      if (converted === null) continue
      const i = index.get(key)
      if (i !== undefined) entries[i] = [key, converted]
      else entries.push([key, converted])
    }
    await writeFile(optionsFile, serializeOptions(entries))
    session.presetId = preset.id
  }
  return session
}

/** Après la fermeture du jeu : récupère les changements (serveurs ajoutés, touches modifiées…) */
export async function collectShared(session: SyncSession, gameVersion: string, gameDir: string): Promise<void> {
  const servers = join(gameDir, 'servers.dat')
  if (session.serversMtime !== null && existsSync(servers) && (await stat(servers)).mtimeMs > session.serversMtime) {
    await mkdir(sharedDir, { recursive: true })
    await copyFile(servers, sharedServers)
  }

  const optionsFile = join(gameDir, 'options.txt')
  if (session.presetId && existsSync(optionsFile)) {
    const legacy = isLegacyVersion(gameVersion)
    const patch: Record<string, string> = {}
    for (const [key, value] of parseOptions(await readFile(optionsFile, 'utf8'))) {
      if (!isSyncedKey(key)) continue
      const converted = legacy ? fromLegacy(key, value) : value
      if (converted !== null) patch[key] = converted
    }
    updatePresetOptions(session.presetId, patch)
  }
}
