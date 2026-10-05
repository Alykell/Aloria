import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { delimiter } from 'node:path'
import { paths } from './paths'
import { rulesAllow, type Features } from './rules'
import type { InstalledVersion } from './install'
import type { Argument } from './versions'

export interface LaunchOptions {
  installed: InstalledVersion
  gameDir: string
  ramMb: number
  player: { name: string; uuid: string; accessToken: string; xuid: string }
  demo: boolean
  launcherVersion: string
  /** Arguments ajoutés pour les tests en développement */
  extraJvmArgs?: string[]
  extraGameArgs?: string[]
}

// Arguments JVM utilisés par les versions d'avant 1.13 (qui n'en fournissent pas)
const LEGACY_JVM: Argument[] = [
  '-Djava.library.path=${natives_directory}',
  '-Dminecraft.launcher.brand=${launcher_name}',
  '-Dminecraft.launcher.version=${launcher_version}',
  '-cp',
  '${classpath}'
]

function expand(args: Argument[], features: Features): string[] {
  const out: string[] = []
  for (const arg of args) {
    if (typeof arg === 'string') out.push(arg)
    else if (rulesAllow(arg.rules, features)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]))
  }
  return out
}

export function buildArguments(opts: LaunchOptions): string[] {
  const { installed, gameDir, player } = opts
  const { version } = installed
  const features: Features = { is_demo_user: opts.demo }

  const vars: Record<string, string> = {
    auth_player_name: player.name,
    auth_uuid: player.uuid,
    auth_access_token: player.accessToken,
    auth_session: `token:${player.accessToken}:${player.uuid}`,
    auth_xuid: player.xuid,
    clientid: '',
    user_type: 'msa',
    user_properties: '{}',
    version_name: version.id,
    version_type: version.type,
    game_directory: gameDir,
    assets_root: installed.assetsRoot,
    game_assets: installed.legacyAssetsDir ?? installed.assetsRoot,
    assets_index_name: version.assetIndex?.id ?? version.assets ?? 'legacy',
    natives_directory: installed.nativesDir,
    library_directory: paths.libraries,
    classpath_separator: delimiter,
    classpath: installed.classpath.join(delimiter),
    launcher_name: 'Aloria',
    launcher_version: opts.launcherVersion
  }
  const fill = (s: string) => s.replace(/\$\{(\w+)\}/g, (m, key: string) => vars[key] ?? m)

  const jvm = expand(version.arguments?.jvm ?? LEGACY_JVM, features)
  const game = version.arguments?.game
    ? expand(version.arguments.game, features)
    : (version.minecraftArguments ?? '').split(' ').filter(Boolean)
  if (opts.demo && !version.arguments?.game) game.push('--demo')

  return [
    `-Xmx${opts.ramMb}M`,
    `-Xms${Math.min(1024, opts.ramMb)}M`,
    ...jvm.map(fill),
    ...(opts.extraJvmArgs ?? []),
    ...(installed.loggingArg ? [installed.loggingArg] : []),
    version.mainClass,
    ...game.map(fill),
    ...(opts.extraGameArgs ?? [])
  ]
}

export async function launchGame(opts: LaunchOptions): Promise<ChildProcess> {
  await mkdir(opts.gameDir, { recursive: true })
  const args = buildArguments(opts)
  return spawn(opts.installed.javaPath, args, { cwd: opts.gameDir, windowsHide: false })
}
