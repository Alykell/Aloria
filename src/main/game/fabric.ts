import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchJson } from './download'
import { paths } from './paths'
import type { LoaderVersion } from '../../shared/types'

const META = 'https://meta.fabricmc.net/v2'

/** Versions du loader Fabric compatibles avec une version du jeu (vide si Fabric ne la supporte pas). */
export async function fabricLoaders(gameVersion: string): Promise<LoaderVersion[]> {
  const list = await fetchJson<{ loader: { version: string; stable: boolean } }[]>(
    `${META}/versions/loader/${encodeURIComponent(gameVersion)}`
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
    if (loaders.length === 0) throw new Error(`Fabric n'est pas encore disponible pour Minecraft ${gameVersion}.`)
    loader = (loaders.find((l) => l.stable) ?? loaders[0]).version
  }

  const id = `fabric-loader-${loader}-${gameVersion}`
  const file = paths.versionJson(id)
  if (!existsSync(file)) {
    const res = await fetch(
      `${META}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`
    )
    if (!res.ok) throw new Error(`Impossible d'installer Fabric ${loader} pour ${gameVersion} (HTTP ${res.status}).`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, await res.text())
  }
  return id
}
