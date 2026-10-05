import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fetchJson } from './download'
import { paths } from './paths'
import type { Rule } from './rules'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export interface ManifestVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  sha1: string
  releaseTime: string
}

export interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestVersion[]
}

export interface Artifact {
  path?: string
  url: string
  sha1?: string
  size?: number
}

export interface Library {
  name: string
  url?: string
  sha1?: string
  size?: number
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: Rule[]
}

export type Argument = string | { rules?: Rule[]; value: string | string[] }

export interface VersionJson {
  id: string
  type: string
  inheritsFrom?: string
  mainClass: string
  arguments?: { game?: Argument[]; jvm?: Argument[] }
  minecraftArguments?: string
  assets?: string
  assetIndex?: { id: string; url: string; sha1: string; size: number; totalSize?: number }
  downloads?: { client?: Artifact }
  libraries: Library[]
  javaVersion?: { component: string; majorVersion: number }
  logging?: { client?: { argument: string; file: { id: string; url: string; sha1: string; size: number } } }
}

const manifestCache = join(paths.versions, 'version_manifest_v2.json')
let manifestMemo: Manifest | null = null

/** Liste des versions Mojang ; en cas de coupure réseau on reprend la dernière copie locale. */
export async function getManifest(): Promise<Manifest> {
  if (manifestMemo) return manifestMemo
  try {
    manifestMemo = await fetchJson<Manifest>(MANIFEST_URL)
    await mkdir(paths.versions, { recursive: true })
    await writeFile(manifestCache, JSON.stringify(manifestMemo))
  } catch (err) {
    if (!existsSync(manifestCache)) throw err
    manifestMemo = JSON.parse(await readFile(manifestCache, 'utf8')) as Manifest
  }
  return manifestMemo
}

export async function resolveVersionId(id: string): Promise<string> {
  const manifest = await getManifest()
  if (id === 'latest-release') return manifest.latest.release
  if (id === 'latest-snapshot') return manifest.latest.snapshot
  return id
}

async function loadRaw(id: string): Promise<VersionJson> {
  const file = paths.versionJson(id)
  const manifest = await getManifest().catch(() => null)
  const entry = manifest?.versions.find((v) => v.id === id)

  if (existsSync(file)) {
    const text = await readFile(file, 'utf8')
    // Version Mojang : on vérifie que la copie locale est à jour ; version installée à la main (Fabric…) : telle quelle
    if (!entry || createHash('sha1').update(text).digest('hex') === entry.sha1) return JSON.parse(text) as VersionJson
  }
  if (!entry) throw new Error(`Version inconnue : ${id}`)

  const res = await fetch(entry.url)
  if (!res.ok) throw new Error(`Impossible de récupérer la version ${id} (HTTP ${res.status})`)
  const text = await res.text()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, text)
  return JSON.parse(text) as VersionJson
}

/** Charge le JSON d'une version en fusionnant son parent (inheritsFrom), utilisé par Fabric. */
export async function loadVersion(id: string): Promise<VersionJson> {
  const child = await loadRaw(id)
  if (!child.inheritsFrom) return child
  const parent = await loadVersion(child.inheritsFrom)
  return {
    ...parent,
    ...child,
    libraries: [...child.libraries, ...parent.libraries],
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
    },
    // Le jar client reste celui du parent
    downloads: parent.downloads,
    inheritsFrom: parent.id
  }
}
