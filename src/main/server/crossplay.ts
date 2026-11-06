import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { downloadAll, fetchJson, type DownloadTask } from '../game/download'
import { listVersions } from '../modrinth/api'
import { crossplayNeedsVia, crossplaySupported } from '../../shared/crossplay'
import type { ServerInfo } from '../../shared/types'
import type { InstallStep } from './install'
import { tm } from '../i18n'

/**
 * Plugins du crossplay (Geyser, Floodgate, ViaVersion si besoin) dans plugins/, préfixés « aloria- » pour les reconnaître :
 * ajoutés quand le crossplay est activé, mis à jour à chaque démarrage (Geyser suit les versions de Bedrock), retirés sinon.
 * Leurs réglages (dossiers Geyser-Spigot, floodgate) restent.
 */
const GEYSER_API = 'https://download.geysermc.org/v2/projects'
const VIAVERSION = 'viaversion'
const PREFIX = 'aloria-'

interface GeyserBuild {
  version: string
  build: number
  downloads: Record<string, { name: string }>
}

/** Fichier à jour d'un projet de GeyserMC ; hors ligne, celui déjà là fait l'affaire */
async function geyserFile(project: 'geyser' | 'floodgate', plugins: string, existing: string[]): Promise<DownloadTask | string | null> {
  try {
    const build = await fetchJson<GeyserBuild>(`${GEYSER_API}/${project}/versions/latest/builds/latest`)
    if (!build.downloads.spigot) return null
    return {
      url: `${GEYSER_API}/${project}/versions/${build.version}/builds/${build.build}/downloads/spigot`,
      path: join(plugins, `${PREFIX}${project}-${build.version}-${build.build}.jar`)
    }
  } catch {
    return existing.find((f) => f.startsWith(`${PREFIX}${project}-`)) ?? null
  }
}

async function viaFile(plugins: string, existing: string[]): Promise<DownloadTask | string | null> {
  try {
    const version = (await listVersions(VIAVERSION, ['paper'], undefined)).find((v) => v.version_type === 'release')
    const file = version?.files.find((f) => f.primary) ?? version?.files[0]
    if (!file) return null
    return {
      url: file.url,
      path: join(plugins, `${PREFIX}${file.filename}`),
      sha1: file.hashes.sha1,
      size: file.size
    }
  } catch {
    return existing.find((f) => f.toLowerCase().startsWith(`${PREFIX}viaversion`)) ?? null
  }
}

export async function syncCrossplay(server: ServerInfo, dir: string, onStep: InstallStep): Promise<void> {
  const plugins = join(dir, 'plugins')
  const existing = existsSync(plugins) ? (await readdir(plugins)).filter((f) => f.startsWith(PREFIX)) : []
  if (!server.bedrock) {
    for (const f of existing) await rm(join(plugins, f), { force: true })
    return
  }
  if (!crossplaySupported(server.type, server.gameVersion)) throw new Error(tm('err.crossplayVersion', { version: server.gameVersion }))
  onStep(tm('server.step.crossplay'))
  await mkdir(plugins, { recursive: true })
  const wanted = [await geyserFile('geyser', plugins, existing), await geyserFile('floodgate', plugins, existing)]
  if (crossplayNeedsVia(server.gameVersion)) wanted.push(await viaFile(plugins, existing))
  if (wanted.some((w) => !w)) throw new Error(tm('err.crossplayDownload'))
  const tasks = wanted.filter((w): w is DownloadTask => typeof w === 'object' && !!w && !existsSync(w.path))
  if (tasks.length > 0)
    await downloadAll(tasks, (p) => onStep(tm('server.step.crossplay'), p.totalBytes ? p.doneBytes / p.totalBytes : undefined))
  const keep = new Set(wanted.map((w) => (typeof w === 'string' ? w : basename(w!.path))))
  for (const f of existing) if (!keep.has(f)) await rm(join(plugins, f), { force: true })
}

/** Remplace la valeur d'une clé du config.yml de Geyser (première ligne `<indent><clé>:`, et ses éléments de liste « - ») */
function setKey(text: string, indent: string, key: string, value: string): string {
  const re = new RegExp(`^${indent}${key}:.*(\r?\n${indent}\s+- .*)*`, 'm')
  return re.test(text) ? text.replace(re, `${indent}${key}: ${value}`) : text
}

/** Signalisation de playit pour les tunnels NetherNet */
const PLAYIT_NXS = 'https://nethernet.playit.gg'

/**
 * Réglages de Geyser pour NetherNet, la connexion de Bedrock 26.x (la seule depuis le 27 octobre 2026 : l'ancienne, RakNet,
 * répond encore aux pings mais le jeu ne s'y connecte plus, erreur « Terracotta »). Le joueur Bedrock passe d'abord par une
 * « signalisation », qui le met en relation avec Geyser, puis joue en WebRTC (UDP).
 * - Avec un tunnel playit (`nxsToken`) : « hybrid », la signalisation de playit pour internet (adresses trouvées par playit,
 *   sans STUN), celle de Geyser (HTTP sur le port Bedrock) pour ce PC et le réseau local.
 * - Sans tunnel : celle de Geyser seule, qui cherche l'adresse publique (STUN) pour qui a ouvert ses ports.
 * Connexion par Floodgate : les joueurs Bedrock n'ont pas besoin d'un compte Java.
 * Sans fichier (premier démarrage), on en pose un minimal : Geyser le complète avec ses valeurs par défaut.
 */
export async function configureGeyser(dir: string, port: number, nxsToken?: string): Promise<void> {
  const folder = join(dir, 'plugins', 'Geyser-Spigot')
  const file = join(folder, 'config.yml')
  const mode = nxsToken ? 'hybrid' : 'builtin'
  const token = JSON.stringify(nxsToken ?? '')
  const stun = String(!nxsToken)
  if (!existsSync(file)) {
    await mkdir(folder, { recursive: true })
    await writeFile(
      file,
      [
        'bedrock:',
        `  port: ${port}`,
        '  webrtc-port: 0',
        '  transport: nethernet',
        '  clone-remote-port: false',
        '  signaling:',
        `    mode: ${mode}`,
        '    advertise-addresses: []',
        `    stun-discovery: ${stun}`,
        '    nxs:',
        `      token: ${token}`,
        `      endpoint: ${PLAYIT_NXS}`,
        'remote:',
        '  auth-type: floodgate',
        ''
      ].join('\n')
    )
    return
  }
  let text = await readFile(file, 'utf8')
  text = setKey(text, '  ', 'port', String(port))
  text = setKey(text, '  ', 'webrtc-port', '0')
  text = setKey(text, '  ', 'transport', 'nethernet')
  text = setKey(text, '    ', 'mode', mode)
  text = setKey(text, '    ', 'advertise-addresses', '[]')
  text = setKey(text, '    ', 'stun-discovery', stun)
  text = setKey(text, '      ', 'token', token)
  text = setKey(text, '      ', 'endpoint', PLAYIT_NXS)
  text = setKey(text, '  ', 'auth-type', 'floodgate')
  await writeFile(file, text)
}
