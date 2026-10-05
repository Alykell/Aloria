import { app } from 'electron'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { installContent, listInstalled } from '../modrinth/content'
import type { Profile } from '../../shared/types'

/** Version de Minecraft pour laquelle le mod Aloria HUD est compilé */
export const ALORIA_HUD_MC_VERSION = '26.3'
const FABRIC_API = 'P7dR8mSH'
const JAR_NAME = 'aloria-hud.jar'

/** Le jar est livré avec le launcher ; en développement on prend celui que Gradle vient de construire. */
async function bundledJar(): Promise<string | null> {
  const dir = app.isPackaged ? join(process.resourcesPath, 'mods') : join(app.getAppPath(), 'mod', 'build', 'libs')
  if (!existsSync(dir)) return null
  const jar = (await readdir(dir)).find((f) => /^aloria-hud-[\d.]+\.jar$/.test(f))
  return jar ? join(dir, jar) : null
}

export const hudEnabled = (profile: Profile) => profile.loader === 'fabric' && profile.aloriaHud !== false

/**
 * Met le mod dans le dossier mods du profil (avec Fabric API) ou l'en retire selon le réglage du profil.
 * Renvoie un avertissement si le mod ne peut pas être utilisé avec cette version du jeu.
 */
export async function syncAloriaHud(profile: Profile, gameVersion: string, gameDir: string): Promise<string | null> {
  const target = join(gameDir, 'mods', JAR_NAME)
  const wanted = hudEnabled(profile) && gameVersion === ALORIA_HUD_MC_VERSION

  if (!wanted) {
    await rm(target, { force: true })
    return hudEnabled(profile) ? `Aloria HUD n'existe que pour Minecraft ${ALORIA_HUD_MC_VERSION}.` : null
  }

  const jar = await bundledJar()
  if (!jar) return "Le mod Aloria HUD est introuvable (lance « gradlew build » dans le dossier mod)."

  await mkdir(join(gameDir, 'mods'), { recursive: true })
  await copyFile(jar, target)

  const installed = await listInstalled(profile.id)
  if (!installed.some((i) => i.projectId === FABRIC_API)) await installContent(profile.id, FABRIC_API, 'mod')
  return null
}
