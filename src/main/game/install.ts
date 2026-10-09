import AdmZip from 'adm-zip'
import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { downloadAll, filterMissing, pool, type DownloadProgress, type DownloadTask } from './download'
import { prepareJava } from './java'
import { paths } from './paths'
import { OS_NAME, rulesAllow } from './rules'
import type { Library, VersionJson } from './versions'
import { tm } from '../i18n'

const LIBRARIES_URL = 'https://libraries.minecraft.net/'
const RESOURCES_URL = 'https://resources.download.minecraft.net/'

export interface InstalledVersion {
  version: VersionJson
  javaPath: string
  classpath: string[]
  nativesDir: string
  assetsRoot: string
  /** Dossier d'assets pour les très vieilles versions (avant 1.7.10) */
  legacyAssetsDir: string | null
  loggingArg: string | null
}

export type InstallStep =
  | { step: 'check' }
  | ({ step: 'download' } & DownloadProgress)
  | { step: 'extract' }

/** groupe:artefact:version[:classifier][@ext] → chemin Maven */
export function mavenPath(name: string): string {
  const [coords, ext = 'jar'] = name.split('@')
  const [group, artifact, version, classifier] = coords.split(':')
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return [...group.split('.'), artifact, version, file].join('/')
}

function nativeClassifier(lib: Library): string | undefined {
  const raw = lib.natives?.[OS_NAME]
  return raw?.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
}

function libraryTasks(libs: Library[]) {
  const tasks: DownloadTask[] = []
  const classpath: string[] = []
  const nativeJars: { path: string; exclude: string[] }[] = []

  for (const lib of libs) {
    if (!rulesAllow(lib.rules)) continue

    const artifact = lib.downloads?.artifact
    if (artifact) {
      const path = join(paths.libraries, artifact.path ?? mavenPath(lib.name))
      if (artifact.url) tasks.push({ url: artifact.url, path, sha1: artifact.sha1, size: artifact.size })
      classpath.push(path)
    } else if (!lib.natives) {
      // Format Maven simple (Fabric, Forge…) : pas de bloc "downloads"
      const rel = mavenPath(lib.name)
      const path = join(paths.libraries, rel)
      tasks.push({ url: (lib.url ?? LIBRARIES_URL).replace(/\/?$/, '/') + rel, path, sha1: lib.sha1, size: lib.size })
      classpath.push(path)
    }

    // Anciennes versions (avant 1.19) : natives dans un jar séparé, à extraire
    const classifier = nativeClassifier(lib)
    const native = classifier ? lib.downloads?.classifiers?.[classifier] : undefined
    if (native) {
      const path = join(paths.libraries, native.path ?? mavenPath(`${lib.name}:${classifier}`))
      tasks.push({ url: native.url, path, sha1: native.sha1, size: native.size })
      nativeJars.push({ path, exclude: lib.extract?.exclude ?? ['META-INF/'] })
    }
  }
  return { tasks, classpath: [...new Set(classpath)], nativeJars }
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

async function assetTasks(version: VersionJson): Promise<{ tasks: DownloadTask[]; index: AssetIndex | null }> {
  const info = version.assetIndex
  if (!info) return { tasks: [], index: null }
  const indexPath = join(paths.assets, 'indexes', `${info.id}.json`)
  const [missing] = await filterMissing([{ url: info.url, path: indexPath, sha1: info.sha1, size: info.size }])
  if (missing) await downloadAll([missing], () => {})

  const index = JSON.parse(await readFile(indexPath, 'utf8')) as AssetIndex
  const seen = new Set<string>()
  const tasks: DownloadTask[] = []
  for (const { hash, size } of Object.values(index.objects)) {
    if (seen.has(hash)) continue
    seen.add(hash)
    const rel = `${hash.slice(0, 2)}/${hash}`
    tasks.push({ url: RESOURCES_URL + rel, path: join(paths.assets, 'objects', rel), sha1: hash, size, sizeOnly: true })
  }
  return { tasks, index }
}

/** Copie les assets sous leur vrai nom pour les versions qui ne lisent pas le dossier objects/. */
async function linkLegacyAssets(index: AssetIndex, version: VersionJson, gameDir: string): Promise<string | null> {
  if (!index.virtual && !index.map_to_resources) return null
  const target = index.map_to_resources ? join(gameDir, 'resources') : join(paths.assets, 'virtual', version.assetIndex!.id)
  await pool(Object.entries(index.objects), 32, async ([name, { hash }]) => {
    const dest = join(target, name)
    if (existsSync(dest)) return
    await mkdir(dirname(dest), { recursive: true })
    await copyFile(join(paths.assets, 'objects', hash.slice(0, 2), hash), dest)
  })
  return target
}

function extractNatives(jars: { path: string; exclude: string[] }[], dir: string): void {
  for (const jar of jars) {
    const zip = new AdmZip(jar.path)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || jar.exclude.some((ex) => entry.entryName.startsWith(ex))) continue
      // Déjà en place (même taille) : on ne la réécrit pas. Une partie de la même version peut être en cours,
      // et Windows interdit d'écraser une DLL chargée (EBUSY)
      const target = join(dir, basename(entry.entryName))
      if (existsSync(target) && statSync(target).size === entry.header.size) continue
      zip.extractEntryTo(entry, dir, false, true)
    }
  }
}

/** Vérifie et télécharge tout ce qu'il faut pour lancer une version : Java, jar client, librairies, assets. */
export async function installVersion(
  version: VersionJson,
  gameDir: string,
  onStep: (s: InstallStep) => void
): Promise<InstalledVersion> {
  onStep({ step: 'check' })

  const java = await prepareJava(version.javaVersion?.component ?? 'jre-legacy')
  const libs = libraryTasks(version.libraries)
  const assets = await assetTasks(version)

  const clientId = version.inheritsFrom ?? version.id
  const client = version.downloads?.client
  if (!client) throw new Error(tm('err.noClientJar', { version: version.id }))
  const clientPath = paths.versionJar(clientId)

  const tasks: DownloadTask[] = [
    { url: client.url, path: clientPath, sha1: client.sha1, size: client.size },
    ...java.tasks,
    ...libs.tasks,
    ...assets.tasks
  ]

  let loggingArg: string | null = null
  const logging = version.logging?.client
  if (logging) {
    const logPath = join(paths.assets, 'log_configs', logging.file.id)
    tasks.push({ url: logging.file.url, path: logPath, sha1: logging.file.sha1, size: logging.file.size })
    loggingArg = logging.argument.replace('${path}', logPath)
  }

  const missing = await filterMissing(tasks)
  if (missing.length > 0) await downloadAll(missing, (p) => onStep({ step: 'download', ...p }))

  onStep({ step: 'extract' })
  const nativesDir = paths.natives(version.id)
  await mkdir(nativesDir, { recursive: true })
  if (libs.nativeJars.length > 0) extractNatives(libs.nativeJars, nativesDir)
  const legacyAssetsDir = assets.index ? await linkLegacyAssets(assets.index, version, gameDir) : null

  return {
    version,
    javaPath: java.executable,
    classpath: [...libs.classpath, clientPath],
    nativesDir,
    assetsRoot: paths.assets,
    legacyAssetsDir,
    loggingArg
  }
}
