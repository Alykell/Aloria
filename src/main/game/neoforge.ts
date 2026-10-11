import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import AdmZip from 'adm-zip'
import { paths } from './paths'
import { runModernInstaller, type InstallerStep, type ModernInstallProfile } from './processors'
import type { LoaderVersion } from '../../shared/types'
import { tm } from '../i18n'

/**
 * NeoForge (successeur de Forge, de la 1.20.2 à aujourd'hui) : beaucoup de modpacks récents l'utilisent.
 * Même installeur que Forge récent (processors).
 */
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/'

/**
 * Version du jeu d'une version de NeoForge : « 21.1.259 » → 1.21.1, « 21.0.5 » → 1.21 ;
 * depuis 2026, « 26.3.0.75 » → 26.3, « 26.1.1.4 » → 26.1.1. null pour les versions spéciales (snapshots…)
 */
export function neoforgeGameVersion(version: string): string | null {
  const parts = version.replace(/-.*$/, '').split('.').map(Number)
  if (parts.some(Number.isNaN)) return null
  if (parts.length === 3 && parts[0] >= 20 && parts[0] < 26) return parts[1] === 0 ? `1.${parts[0]}` : `1.${parts[0]}.${parts[1]}`
  if (parts.length === 4 && parts[0] >= 26) return parts[2] === 0 ? `${parts[0]}.${parts[1]}` : `${parts[0]}.${parts[1]}.${parts[2]}`
  return null
}

let allVersions: Promise<string[]> | null = null

/** Toutes les versions publiées (mémorisées : la liste fait plus de 1 800 entrées) */
function neoforgeVersions(): Promise<string[]> {
  allVersions ??= fetch(`${NEOFORGE_MAVEN}maven-metadata.xml`)
    .then(async (res) => {
      if (!res.ok) throw new Error(tm('err.neoforgeList', { status: res.status }))
      return [...(await res.text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    })
    .catch((err) => {
      allVersions = null
      throw err
    })
  return allVersions
}

/** Versions de NeoForge pour une version du jeu, la plus récente d'abord ; « stable » = pas une bêta */
export async function neoforgeLoaders(gameVersion: string): Promise<LoaderVersion[]> {
  return (await neoforgeVersions())
    .filter((v) => neoforgeGameVersion(v) === gameVersion)
    .reverse()
    .map((version) => ({ version, stable: !version.includes('-') }))
}

/** Installe NeoForge (dernière stable sans version imposée) et renvoie l'id de son JSON de version */
export async function installNeoForge(
  gameVersion: string,
  loaderVersion: string | null,
  onStep: (s: InstallerStep) => void = () => {}
): Promise<string> {
  let version = loaderVersion
  if (!version) {
    const loaders = await neoforgeLoaders(gameVersion)
    if (loaders.length === 0) throw new Error(tm('err.neoforgeMissing', { version: gameVersion }))
    version = (loaders.find((l) => l.stable) ?? loaders[0]).version
  }

  const id = `neoforge-${version}`
  const file = paths.versionJson(id)
  if (existsSync(file)) return id

  const res = await fetch(`${NEOFORGE_MAVEN}${version}/neoforge-${version}-installer.jar`)
  if (!res.ok) throw new Error(tm('err.neoforgeDownload', { version, status: res.status }))
  const installer = Buffer.from(await res.arrayBuffer())
  const profile = JSON.parse(new AdmZip(installer).readAsText('install_profile.json')) as ModernInstallProfile
  const json = await runModernInstaller(installer, profile, onStep)

  // Écrit en dernier : un JSON présent veut dire une installation complète
  json.id = id
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(json))
  return id
}
