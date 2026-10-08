import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { fetchJson } from './download'
import { mavenPath } from './install'
import { paths } from './paths'
import type { Library, VersionJson } from './versions'
import { forgeSupported } from '../../shared/loaders'
import type { LoaderVersion } from '../../shared/types'

/**
 * Forge, pour les anciennes versions où l'on joue avec OptiFine (ni Sodium ni Iris avant 1.16.5).
 * Jusqu'à la 1.12.2, l'installeur de Forge se contente de copier son jar et d'écrire un JSON de version :
 * on refait ces deux étapes nous-mêmes. À partir de la 1.13, il recompile le jeu (« processors ») : pas encore géré.
 */
const MAVEN = 'https://maven.minecraftforge.net/'
const FORGE_MAVEN = `${MAVEN}net/minecraftforge/forge/`
const PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'

/** Toutes les versions de Forge publiées (format Maven : « 1.8.9-11.15.1.2318-1.8.9 », « 1.12.2-14.23.5.2859 ») */
async function allForgeVersions(): Promise<string[]> {
  const res = await fetch(`${FORGE_MAVEN}maven-metadata.xml`)
  if (!res.ok) throw new Error(`Liste des versions de Forge indisponible (HTTP ${res.status}).`)
  return [...(await res.text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
}

/** « 1.8.9-11.15.1.2318-1.8.9 » → « 11.15.1.2318 » */
export function forgeLabel(full: string, gameVersion: string): string {
  return full.slice(gameVersion.length + 1).replace(new RegExp(`-${gameVersion.replace(/\./g, '\\.')}$`), '')
}

/** Versions de Forge pour une version du jeu, la plus récente d'abord ; « stable » = la recommandée */
export async function forgeLoaders(gameVersion: string): Promise<LoaderVersion[]> {
  if (!forgeSupported(gameVersion)) return []
  const [all, promos] = await Promise.all([
    allForgeVersions(),
    fetchJson<{ promos: Record<string, string> }>(PROMOTIONS).catch(() => ({ promos: {} as Record<string, string> }))
  ])
  const recommended = promos.promos[`${gameVersion}-recommended`] ?? promos.promos[`${gameVersion}-latest`]
  return all
    .filter((v) => v.startsWith(`${gameVersion}-`))
    .reverse()
    .map((full) => {
      const label = forgeLabel(full, gameVersion)
      return { version: full, label, stable: label === recommended }
    })
}

/** Bibliothèque de l'ancien installeur : clientreq = false pour celles du serveur seulement */
type LegacyLibrary = Library & { clientreq?: boolean; serverreq?: boolean; checksums?: string[] }

interface LegacyInstallProfile {
  install: { path: string; filePath: string }
  versionInfo: Omit<VersionJson, 'libraries'> & { libraries: LegacyLibrary[] }
}

interface InstallProfile {
  json: string
  processors?: unknown[]
}

function extract(zip: AdmZip, entry: string, to: string): Promise<void> {
  const data = zip.getEntry(entry.replace(/^\//, ''))?.getData()
  if (!data) throw new Error(`Installeur de Forge incomplet (${entry} introuvable).`)
  return mkdir(dirname(to), { recursive: true }).then(() => writeFile(to, data))
}

/**
 * Installe Forge (JSON de version héritant de la version vanilla + jar de Forge) et renvoie l'id du profil.
 * Sans version imposée, on prend la recommandée.
 */
export async function installForge(gameVersion: string, loaderVersion: string | null): Promise<string> {
  if (!forgeSupported(gameVersion)) throw new Error(`Forge n'est pas encore géré par Aloria pour Minecraft ${gameVersion}.`)
  let full = loaderVersion
  if (!full) {
    const loaders = await forgeLoaders(gameVersion)
    if (loaders.length === 0) throw new Error(`Forge n'existe pas pour Minecraft ${gameVersion}.`)
    full = (loaders.find((l) => l.stable) ?? loaders[0]).version
  }

  const id = `forge-${full}`
  const file = paths.versionJson(id)
  if (existsSync(file)) return id

  // Forge demande de ne pas automatiser son installation sans le soutenir : voir le lien dans la création de profil
  const res = await fetch(`${FORGE_MAVEN}${full}/forge-${full}-installer.jar`)
  if (!res.ok) throw new Error(`Impossible de télécharger Forge ${full} (HTTP ${res.status}).`)
  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()))
  const profile = JSON.parse(zip.readAsText('install_profile.json')) as LegacyInstallProfile | InstallProfile

  let json: VersionJson
  if ('versionInfo' in profile) {
    // Ancien installeur (1.12.2 et avant, jusqu'en 2018) : JSON de version dans install_profile.json
    json = {
      ...profile.versionInfo,
      libraries: profile.versionInfo.libraries
        .filter((lib) => lib.clientreq !== false)
        .map(({ clientreq: _c, serverreq: _s, checksums: _k, ...lib }) => lib)
    }
    await extract(zip, profile.install.filePath, join(paths.libraries, mavenPath(profile.install.path)))
  } else {
    if (profile.processors?.length) throw new Error(`Cette version de Forge (${full}) n'est pas encore gérée par Aloria.`)
    // Installeur récent sans compilation : JSON à part, jars de Forge rangés dans maven/ de l'installeur
    json = JSON.parse(zip.readAsText(profile.json.replace(/^\//, ''))) as VersionJson
    for (const lib of json.libraries) {
      const artifact = lib.downloads?.artifact
      if (artifact && !artifact.url) await extract(zip, `maven/${artifact.path ?? mavenPath(lib.name)}`, join(paths.libraries, artifact.path ?? mavenPath(lib.name)))
    }
  }

  // L'id du JSON doit correspondre à son dossier
  json.id = id
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(json))
  return id
}
