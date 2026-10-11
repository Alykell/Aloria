import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { downloadAll, filterMissing, type DownloadProgress, type DownloadTask } from './download'
import { mavenPath } from './install'
import { prepareJava } from './java'
import { paths } from './paths'
import { loadVersion, type Library, type VersionJson } from './versions'
import { tm } from '../i18n'

/**
 * Installeurs récents de Forge (1.13+) et de NeoForge : en plus du JSON de version, ils « recompilent » le jeu
 * (patchs binaires, mappings…) avec des petits programmes Java, les « processors ». On les exécute comme le ferait
 * l'installeur officiel, côté client seulement.
 */
export interface ModernInstallProfile {
  json: string
  minecraft: string
  data?: Record<string, { client: string; server: string }>
  processors?: { sides?: string[]; jar: string; classpath: string[]; args: string[] }[]
  libraries?: Library[]
}

export type InstallerStep = { step: 'prepare' } | ({ step: 'download' } & DownloadProgress) | { step: 'processors'; done: number; total: number }

const libPath = (coords: string) => join(paths.libraries, mavenPath(coords))

/** Bibliothèques à télécharger ; celles sans adresse sont fournies par l'installeur (dossier maven/) */
async function libraryFiles(zip: AdmZip, libs: Library[]): Promise<DownloadTask[]> {
  const tasks: DownloadTask[] = []
  for (const lib of libs) {
    const artifact = lib.downloads?.artifact
    const rel = artifact?.path ?? mavenPath(lib.name)
    const path = join(paths.libraries, rel)
    if (artifact?.url) tasks.push({ url: artifact.url, path, sha1: artifact.sha1, size: artifact.size })
    else {
      // Sans entrée dans l'installeur : le fichier sera créé par un processor (jeu patché)
      const data = zip.getEntry(`maven/${rel}`)?.getData()
      if (data) {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, data)
      }
    }
  }
  return tasks
}

/** Classe principale d'un jar (son MANIFEST.MF) */
function mainClass(jar: string): string {
  const manifest = new AdmZip(jar).getEntry('META-INF/MANIFEST.MF')?.getData().toString('utf8') ?? ''
  const main = manifest.match(/^Main-Class:\s*(.+)$/m)?.[1]?.trim()
  if (!main) throw new Error(tm('err.loaderProcessor', { name: basename(jar), reason: 'Main-Class' }))
  return main
}

function run(java: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(java, args, { cwd, windowsHide: true })
    let output = ''
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(output.trim().split(/\r?\n/).slice(-8).join('\n') || `code ${code}`))
    })
  })
}

/**
 * Installe un chargeur à partir de son installeur récent et renvoie son JSON de version (id à fixer par l'appelant).
 * Étapes : bibliothèques (des processors et du jeu), Java et jar du jeu vanilla, puis les processors côté client.
 */
export async function runModernInstaller(
  installer: Buffer,
  profile: ModernInstallProfile,
  onStep: (s: InstallerStep) => void
): Promise<VersionJson> {
  const zip = new AdmZip(installer)
  const json = JSON.parse(zip.readAsText(profile.json.replace(/^\//, ''))) as VersionJson
  onStep({ step: 'prepare' })

  // Jeu vanilla (son jar est l'entrée des processors) et son Java, qui fait tourner les processors
  const vanilla = await loadVersion(profile.minecraft)
  const client = vanilla.downloads?.client
  if (!client) throw new Error(tm('err.noClientJar', { version: profile.minecraft }))
  const clientJar = paths.versionJar(profile.minecraft)
  const java = await prepareJava(vanilla.javaVersion?.component ?? 'jre-legacy')

  const tasks = [
    { url: client.url, path: clientJar, sha1: client.sha1, size: client.size },
    ...java.tasks,
    ...(await libraryFiles(zip, profile.libraries ?? [])),
    ...(await libraryFiles(zip, json.libraries))
  ]
  const missing = await filterMissing(tasks)
  if (missing.length > 0) await downloadAll(missing, (p) => onStep({ step: 'download', ...p }))

  const processors = (profile.processors ?? []).filter((p) => !p.sides || p.sides.includes('client'))
  if (processors.length > 0) {
    // java.exe plutôt que javaw.exe : on veut lire sa sortie en cas d'erreur
    const javaCli = process.platform === 'win32' ? join(dirname(java.executable), 'java.exe') : java.executable
    const work = await mkdtemp(join(tmpdir(), 'aloria-installer-'))
    try {
      const installerPath = join(work, 'installer.jar')
      await writeFile(installerPath, installer)

      // Valeurs des {VARIABLES} : artefacts Maven [..], textes '..' ou fichiers de l'installeur /..
      const vars: Record<string, string> = {
        SIDE: 'client',
        MINECRAFT_JAR: clientJar,
        MINECRAFT_VERSION: profile.minecraft,
        ROOT: paths.root,
        INSTALLER: installerPath,
        LIBRARY_DIR: paths.libraries
      }
      for (const [key, value] of Object.entries(profile.data ?? {})) {
        const v = value.client
        if (v.startsWith('[') && v.endsWith(']')) vars[key] = libPath(v.slice(1, -1))
        else if (v.startsWith("'") && v.endsWith("'")) vars[key] = v.slice(1, -1)
        else if (v.startsWith('/')) {
          const target = join(work, v.slice(1))
          const data = zip.getEntry(v.slice(1))?.getData()
          if (!data) throw new Error(tm('err.forgeIncomplete', { entry: v }))
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, data)
          vars[key] = target
        } else vars[key] = v
      }
      const arg = (a: string) =>
        a.startsWith('{') && a.endsWith('}')
          ? (vars[a.slice(1, -1)] ?? a)
          : a.startsWith('[') && a.endsWith(']')
            ? libPath(a.slice(1, -1))
            : a

      let done = 0
      onStep({ step: 'processors', done, total: processors.length })
      for (const p of processors) {
        const jar = libPath(p.jar)
        const classpath = [jar, ...p.classpath.map(libPath)].join(delimiter)
        try {
          await run(javaCli, ['-cp', classpath, mainClass(jar), ...p.args.map(arg)], work)
        } catch (err) {
          throw new Error(tm('err.loaderProcessor', { name: p.jar.split(':')[1] ?? p.jar, reason: (err as Error).message }))
        }
        onStep({ step: 'processors', done: ++done, total: processors.length })
      }
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {})
    }
  }

  // Tout ce que le jeu attend doit maintenant exister (jar patché compris)
  for (const lib of json.libraries) {
    const path = join(paths.libraries, lib.downloads?.artifact?.path ?? mavenPath(lib.name))
    if (!lib.downloads?.artifact?.url && !existsSync(path)) throw new Error(tm('err.forgeIncomplete', { entry: lib.name }))
  }
  return json
}
