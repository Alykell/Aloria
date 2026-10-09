import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchJson } from './download'
import { paths } from './paths'
import type { LoaderVersion } from '../../shared/types'
import { tm } from '../i18n'

const FABRIC_META = 'https://meta.fabricmc.net/v2'
/** Legacy Fabric : le même loader et le même format, pour les versions que Fabric ne gère pas (1.13.2 et avant) */
const LEGACY_META = 'https://meta.legacyfabric.net/v2'

/** Versions d'avant 1.14 : Fabric officiel ne les gère pas, c'est Legacy Fabric qui prend le relais */
export function isLegacyFabric(gameVersion: string): boolean {
  const m = /^1\.(\d+)(?:\.|$)/.exec(gameVersion)
  return !!m && Number(m[1]) < 14
}

const metaFor = (gameVersion: string) => (isLegacyFabric(gameVersion) ? LEGACY_META : FABRIC_META)

/** Versions du loader Fabric compatibles avec une version du jeu (vide si Fabric ne la supporte pas). */
export async function fabricLoaders(gameVersion: string): Promise<LoaderVersion[]> {
  const list = await fetchJson<{ loader: { version: string; stable: boolean } }[]>(
    `${metaFor(gameVersion)}/versions/loader/${encodeURIComponent(gameVersion)}`
  )
  return list.map((l) => ({ version: l.loader.version, stable: l.loader.stable }))
}

/**
 * Installe le profil Fabric (un JSON de version qui hérite de la version vanilla) et renvoie son id.
 * Sans version de loader imposée, on prend la dernière stable.
 */
export async function installFabric(gameVersion: string, loaderVersion: string | null): Promise<string> {
  let loader = loaderVersion
  if (!loader) {
    const loaders = await fabricLoaders(gameVersion)
    if (loaders.length === 0) throw new Error(tm('err.fabricMissing', { version: gameVersion }))
    loader = (loaders.find((l) => l.stable) ?? loaders[0]).version
  }

  // Préfixe distinct pour Legacy Fabric : son profil n'est pas le même que celui de Fabric officiel
  const id = `${isLegacyFabric(gameVersion) ? 'legacy-' : ''}fabric-loader-${loader}-${gameVersion}`
  const file = paths.versionJson(id)
  if (!existsSync(file)) {
    const res = await fetch(
      `${metaFor(gameVersion)}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`
    )
    if (!res.ok) throw new Error(tm('err.fabricInstall', { loader, version: gameVersion, status: res.status }))
    await mkdir(dirname(file), { recursive: true })
    // L'id du JSON doit correspondre à son dossier (le préfixe legacy- n'existe pas côté serveur)
    const json = (await res.json()) as { id: string }
    json.id = id
    await writeFile(file, JSON.stringify(json))
  }
  return id
}
