import { app } from 'electron'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { installContent, listInstalled } from '../modrinth/content'
import { isLegacyFabric } from './fabric'
import { sharedDir } from '../shared/presets'
import { paths } from './paths'
import { hudAvailable, hudVersionsLabel } from '../../shared/aloriaHud'
import type { Profile } from '../../shared/types'

const FABRIC_API = 'P7dR8mSH'
const JAR_NAME = 'aloria-hud.jar'

/**
 * Jar du mod pour cette version du jeu (aloria-hud-<version>+<minecraft>.jar). Il est livré avec le launcher ;
 * en développement on prend celui que Gradle vient de construire.
 */
async function bundledJar(gameVersion: string, forge: boolean): Promise<string | null> {
  // En développement : mod moderne (mod/), mod 1.8.9 (mod-legacy/) et sa version Forge (mod-forge/) construits par Gradle
  const dirs = app.isPackaged
    ? [join(process.resourcesPath, 'mods')]
    : ['mod', 'mod-legacy', 'mod-forge'].map((d) => join(app.getAppPath(), d, 'build', 'libs'))
  // aloria-hud-0.1.0+1.8.9.jar (Fabric) ou aloria-hud-0.1.0+1.8.9-forge.jar
  const suffix = `+${gameVersion}${forge ? '-forge' : ''}.jar`
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const jar = (await readdir(dir)).find((f) => f.startsWith('aloria-hud-') && f.endsWith(suffix))
    if (jar) return join(dir, jar)
  }
  return null
}

export const hudEnabled = (profile: Profile) => profile.loader !== 'vanilla' && profile.aloriaHud !== false

/**
 * Met le mod dans le dossier mods du profil (avec Fabric API) ou l'en retire selon le réglage du profil.
 * Renvoie un avertissement si le mod ne peut pas être utilisé avec cette version du jeu.
 */
export async function syncAloriaHud(profile: Profile, gameVersion: string, gameDir: string): Promise<string | null> {
  const target = join(gameDir, 'mods', JAR_NAME)
  const forge = profile.loader === 'forge'
  const wanted = hudEnabled(profile) && hudAvailable(profile.loader, gameVersion)

  if (!wanted) {
    await rm(target, { force: true })
    return hudEnabled(profile) ? `Aloria HUD n'existe que pour Minecraft ${hudVersionsLabel(profile.loader)}${forge ? ' sous Forge' : ''}.` : null
  }

  const jar = await bundledJar(gameVersion, forge)
  if (!jar) return `Le mod Aloria HUD pour Minecraft ${gameVersion} est introuvable (dossier mod : gradlew build).`

  await mkdir(join(gameDir, 'mods'), { recursive: true })
  await copyFile(jar, target)

  // Le mod 1.8.9 (Legacy Fabric ou Forge) n'a pas besoin de Fabric API
  if (forge || isLegacyFabric(gameVersion)) return null
  const installed = await listInstalled(profile.id)
  if (!installed.some((i) => i.projectId === FABRIC_API)) await installContent(profile.id, FABRIC_API, 'mod')
  return null
}

/** Réglages du HUD (modules, disposition, couleurs, écran Visuel) communs à tous les profils */
export const sharedHudConfig = join(sharedDir, 'aloria-hud.json')

/** Première fois : la config commune reprend celle du profil dont le HUD a été modifié le plus récemment */
async function newestHudConfig(): Promise<string | null> {
  if (!existsSync(paths.instances)) return null
  let best: { path: string; mtime: number } | null = null
  for (const id of await readdir(paths.instances)) {
    if (id.startsWith('selftest')) continue
    const path = join(paths.instances, id, 'config', 'aloria-hud.json')
    if (!existsSync(path)) continue
    const mtime = (await stat(path)).mtimeMs
    if (!best || mtime > best.mtime) best = { path, mtime }
  }
  return best?.path ?? null
}

/**
 * Arguments Java qui indiquent au mod où lire et enregistrer ses réglages : le fichier commun, pour que le HUD
 * soit le même dans tous les profils et toutes les versions. Les profils de test gardent leur propre fichier.
 */
export async function hudJvmArgs(profile: Profile): Promise<string[]> {
  if (!hudEnabled(profile) || profile.id.startsWith('selftest')) return []
  if (!existsSync(sharedHudConfig)) {
    const source = await newestHudConfig()
    if (source) {
      await mkdir(sharedDir, { recursive: true })
      await copyFile(source, sharedHudConfig)
    }
  }
  return [`-Daloriahud.config=${sharedHudConfig}`]
}
