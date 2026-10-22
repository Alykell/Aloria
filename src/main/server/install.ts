import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { downloadAll, fetchJson, filterMissing, type DownloadProgress, type DownloadTask } from '../game/download'
import { prepareJava } from '../game/java'
import { fabricLoaders, isLegacyFabric } from '../game/fabric'
import { forgeLoaders } from '../game/forge'
import { neoforgeLoaders } from '../game/neoforge'
import { loadVersion, type Artifact } from '../game/versions'
import { listVersions } from '../modrinth/api'
import { bundledJar } from '../game/aloriaHud'
import { e4mcSupported, needsE4mcCompat } from '../../shared/aloriaHud'
import { serverDirOf, updateServer } from './store'
import type { ServerInfo } from '../../shared/types'
import { tm } from '../i18n'

/** Commande de démarrage : Java et ses arguments après ceux de la mémoire */
export interface LaunchSpec {
  java: string
  args: string[]
}

export type InstallStep = (label: string, progress?: number) => void

const FABRIC_META = 'https://meta.fabricmc.net/v2'
const PAPER_API = 'https://fill.papermc.io/v3/projects/paper'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge/'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/'
const USER_AGENT = 'Alykell/Aloria (github.com/Alykell/Aloria)'
/** e4mc et sa dépendance sous Fabric (Fabric API) */
const E4MC = 'qANg5Jrr'
const FABRIC_API = 'P7dR8mSH'

/** API de Paper : elle demande un User-Agent qui identifie l'application */
async function paperJson<T>(path: string): Promise<T> {
  return fetchJson<T>(`${PAPER_API}${path}`, { 'User-Agent': USER_AGENT })
}

const progressOf = (p: DownloadProgress) => (p.totalBytes > 0 ? p.doneBytes / p.totalBytes : p.doneFiles / Math.max(1, p.totalFiles))

async function download(tasks: DownloadTask[], label: string, onStep: InstallStep): Promise<void> {
  const missing = await filterMissing(tasks)
  if (missing.length > 0) await downloadAll(missing, (p) => onStep(label, progressOf(p)))
}

/** java.exe plutôt que javaw.exe : on lit la sortie du serveur pour la console */
function javaCli(executable: string): string {
  return process.platform === 'win32' ? join(dirname(executable), 'java.exe') : executable
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

/** Version du chargeur à installer : celle imposée, sinon la dernière stable */
async function resolveLoader(server: ServerInfo): Promise<string | null> {
  if (server.loaderVersion) return server.loaderVersion
  const pick = (list: { version: string; stable: boolean }[]) => (list.find((l) => l.stable) ?? list[0])?.version ?? null
  switch (server.type) {
    case 'fabric':
      return pick(await fabricLoaders(server.gameVersion))
    case 'forge':
      return pick(await forgeLoaders(server.gameVersion))
    case 'neoforge':
      return pick(await neoforgeLoaders(server.gameVersion))
    case 'paper': {
      const build = await paperJson<{ id: number }>(`/versions/${server.gameVersion}/builds/latest`)
      return String(build.id)
    }
    default:
      return null
  }
}

/** Arguments de démarrage de Forge / NeoForge installés : fichier d'arguments (1.17+) ou jar exécutable (avant) */
async function forgeLaunch(dir: string, type: 'forge' | 'neoforge', full: string): Promise<string[] | null> {
  const argsFile = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'
  const group = type === 'neoforge' ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge'
  const args = join(dir, 'libraries', group, full, argsFile)
  if (existsSync(args)) return [`@${relative(dir, args).replace(/\\/g, '/')}`, 'nogui']
  const jars = (await readdir(dir)).filter((f) => f.startsWith(`forge-${full}`) && f.endsWith('.jar') && !f.includes('installer'))
  const jar = jars.find((f) => f.includes('universal')) ?? jars[0]
  return jar ? ['-jar', jar, 'nogui'] : null
}

/**
 * Mods qui modifient, comme e4mc, le chiffrement de la connexion (Krypton, optimisation réseau de nombreux modpacks) : le
 * serveur ne démarre pas avec les deux. Ils sont mis de côté tant qu'e4mc est utilisé, puis remis.
 */
const E4MC_CONFLICTS = /^krypton[^/]*\.jar$/i
const PARKED = '.aloria-e4mc-off'

async function parkConflicts(mods: string, park: boolean): Promise<void> {
  if (!existsSync(mods)) return
  for (const f of await readdir(mods)) {
    if (park && E4MC_CONFLICTS.test(f)) await rename(join(mods, f), join(mods, f + PARKED))
    else if (!park && f.endsWith(PARKED)) await rename(join(mods, f), join(mods, f.slice(0, -PARKED.length)))
  }
}

/** Met e4mc (et Fabric API sous Fabric) dans les mods du serveur, ou l'en retire */
async function syncE4mc(server: ServerInfo, dir: string, onStep: InstallStep): Promise<void> {
  const mods = join(dir, 'mods')
  const existing = existsSync(mods) ? (await readdir(mods)).filter((f) => f.startsWith('aloria-e4mc-')) : []
  const modded = server.type === 'fabric' || server.type === 'forge' || server.type === 'neoforge'
  if (!modded || server.tunnel !== 'e4mc') {
    for (const f of existing) await rm(join(mods, f), { force: true })
    await parkConflicts(mods, false)
    return
  }
  await parkConflicts(mods, true)
  if (!e4mcSupported(server.type, server.gameVersion)) throw new Error(tm('err.serverE4mcMissing', { version: server.gameVersion }))
  onStep(tm('server.step.e4mc'))
  const projects = server.type === 'fabric' ? [E4MC, FABRIC_API] : [E4MC]
  const tasks: DownloadTask[] = []
  const wanted = new Set<string>()
  for (const project of projects) {
    const versions = await listVersions(project, [server.type], [server.gameVersion])
    const file = versions[0]?.files.find((f) => f.primary) ?? versions[0]?.files[0]
    if (!file) {
      if (project === E4MC) throw new Error(tm('err.serverE4mcMissing', { version: server.gameVersion }))
      continue
    }
    // Fabric API déjà mise par le joueur : on ne l'ajoute pas en double
    if (project === FABRIC_API && existsSync(mods) && (await readdir(mods)).some((f) => /^fabric-api-/.test(f))) continue
    const name = `aloria-e4mc-${file.filename}`
    wanted.add(name)
    tasks.push({ url: file.url, path: join(mods, name), sha1: file.hashes.sha1, size: file.size })
  }
  // Depuis la 1.21.11 : Aloria HUD remet la méthode qu'e4mc appelle encore (sinon plantage à la connexion d'un joueur) ;
  // sur un serveur, le mod ne charge que ce correctif
  const compat = 'aloria-e4mc-aloria-hud.jar'
  if (needsE4mcCompat(server.gameVersion)) {
    const jar = await bundledJar(server.gameVersion, false)
    if (!jar) throw new Error(tm('err.serverE4mcMissing', { version: server.gameVersion }))
    await mkdir(mods, { recursive: true })
    await copyFile(jar, join(mods, compat))
    wanted.add(compat)
  }
  for (const f of existing) if (!wanted.has(f)) await rm(join(mods, f), { force: true })
  await download(tasks, tm('server.step.e4mc'), onStep)
}

/**
 * Installe (ou vérifie) le serveur et renvoie sa commande de démarrage. La version du chargeur installée est notée :
 * au démarrage suivant, seuls les fichiers manquants sont retéléchargés.
 */
export async function installServer(server: ServerInfo, onStep: InstallStep): Promise<LaunchSpec> {
  const dir = serverDirOf(server.id)
  onStep(tm('server.step.prepare'))

  // Jeu vanilla : son Java, et son serveur (base de Fabric, et pré-placé pour l'installeur de Forge)
  const vanilla = (await loadVersion(server.gameVersion)) as Awaited<ReturnType<typeof loadVersion>> & {
    downloads?: { server?: Artifact }
  }
  const serverJar = vanilla.downloads?.server
  if (!serverJar) throw new Error(tm('err.serverNoJar', { version: server.gameVersion }))
  const java = await prepareJava(vanilla.javaVersion?.component ?? 'jre-legacy')
  const javaExe = javaCli(java.executable)
  await download(java.tasks, tm('server.step.java'), onStep)

  const previous = server.installed
  const loader = previous?.gameVersion === server.gameVersion && !server.loaderVersion ? previous.loaderVersion : await resolveLoader(server)
  if (server.type !== 'vanilla' && !loader) throw new Error(tm('err.serverLoaderMissing', { version: server.gameVersion }))
  const vanillaTask = (path: string): DownloadTask => ({ url: serverJar.url, path, sha1: serverJar.sha1, size: serverJar.size })

  let args: string[]
  switch (server.type) {
    case 'vanilla':
      await download([vanillaTask(join(dir, 'server.jar'))], tm('server.step.game'), onStep)
      args = ['-jar', 'server.jar', 'nogui']
      break

    case 'fabric': {
      if (isLegacyFabric(server.gameVersion)) throw new Error(tm('err.serverFabricOld'))
      const installers = await fetchJson<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/installer`)
      const installer = (installers.find((i) => i.stable) ?? installers[0]).version
      const launcher = join(dir, 'fabric-server-launch.jar')
      if (previous?.loaderVersion !== loader || previous?.gameVersion !== server.gameVersion) await rm(launcher, { force: true })
      await download(
        [
          vanillaTask(join(dir, 'server.jar')),
          { url: `${FABRIC_META}/versions/loader/${server.gameVersion}/${loader}/${installer}/server/jar`, path: launcher }
        ],
        tm('server.step.game'),
        onStep
      )
      args = ['-jar', 'fabric-server-launch.jar', 'nogui']
      break
    }

    case 'paper': {
      const build = await paperJson<{ downloads: Record<string, { name: string; url: string; size: number }> }>(
        `/versions/${server.gameVersion}/builds/${loader}`
      )
      const file = build.downloads['server:default']
      if (!file) throw new Error(tm('err.serverLoaderMissing', { version: server.gameVersion }))
      const jar = join(dir, 'paper.jar')
      if (previous?.loaderVersion !== loader || previous?.gameVersion !== server.gameVersion) await rm(jar, { force: true })
      await download([{ url: file.url, path: jar, size: file.size }], tm('server.step.game'), onStep)
      args = ['-jar', 'paper.jar', 'nogui']
      break
    }

    case 'forge':
    case 'neoforge': {
      const full = loader as string
      let launch = previous?.loaderVersion === full ? await forgeLaunch(dir, server.type, full) : null
      if (!launch) {
        // L'installeur officiel (« --installServer ») fait tout ; on lui donne le serveur vanilla pour qu'il ne le
        // cherche pas à une ancienne adresse de Mojang (installeurs d'avant 2019)
        await download([vanillaTask(join(dir, `minecraft_server.${server.gameVersion}.jar`))], tm('server.step.game'), onStep)
        const url =
          server.type === 'neoforge'
            ? `${NEOFORGE_MAVEN}${full}/neoforge-${full}-installer.jar`
            : `${FORGE_MAVEN}${full}/forge-${full}-installer.jar`
        const installer = join(dir, 'aloria-installer.jar')
        await download([{ url, path: installer }], tm('server.step.loader'), onStep)
        onStep(tm('server.step.loaderInstall'))
        await run(javaExe, ['-jar', 'aloria-installer.jar', '--installServer'], dir)
        await rm(installer, { force: true })
        await rm(join(dir, 'aloria-installer.jar.log'), { force: true })
        launch = await forgeLaunch(dir, server.type, full)
        if (!launch) throw new Error(tm('err.serverForgeLaunch'))
        // Les scripts de démarrage de l'installeur ne servent pas : Aloria lance le serveur lui-même
        await writeFile(join(dir, 'user_jvm_args.txt'), '# Aloria : la mémoire se règle dans le launcher\n').catch(() => {})
      }
      args = launch
      break
    }
  }

  await syncE4mc(server, dir, onStep)
  if (previous?.gameVersion !== server.gameVersion || previous?.loaderVersion !== loader) {
    updateServer(server.id, { installed: { gameVersion: server.gameVersion, loaderVersion: loader } })
  }
  return { java: javaExe, args }
}
