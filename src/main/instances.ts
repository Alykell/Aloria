import { existsSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { createProfile, deleteProfile, gameDirOf, getProfile } from './profiles'
import { forgeVersion, safeJoin } from './modrinth/modpack'
import { forgeSupported, neoforgeSupported } from '../shared/loaders'
import type { ExportOptions, Loader, Profile, ProfileInput } from '../shared/types'
import { tm } from './i18n'

/** Fichier décrivant le profil dans un zip exporté par Aloria */
const PROFILE_FILE = 'aloria-profile.json'

// Jamais exportés : journaux, caches et fichiers propres au PC ou au compte
const SKIPPED = new Set(['logs', 'crash-reports', '.fabric', '.mixin.out', 'downloads', 'natives', 'usercache.json', 'usernamecache.json'])

/** Ce qu'on garde d'un profil pour le recréer ailleurs (ni id, ni dates) */
function portable(p: Profile): ProfileInput {
  return {
    name: p.name,
    icon: p.icon,
    versionId: p.versionId,
    loader: p.loader,
    loaderVersion: p.loaderVersion,
    ramMb: p.ramMb,
    aloriaHud: p.aloriaHud,
    shareServers: p.shareServers,
    modpack: p.modpack
  }
}

/** Exporte un profil en zip : ses réglages, mods, packs, configs… et, si demandé, ses mondes et ses captures */
export async function exportProfile(id: string, dest: string, options: ExportOptions): Promise<void> {
  const profile = getProfile(id)
  const gameDir = gameDirOf(id)
  const zip = new AdmZip()
  zip.addFile(PROFILE_FILE, Buffer.from(JSON.stringify({ format: 1, profile: portable(profile) }, null, 2)))
  if (existsSync(gameDir)) {
    for (const entry of await readdir(gameDir, { withFileTypes: true })) {
      const name = entry.name
      if (SKIPPED.has(name)) continue
      if (name === 'saves' && !options.worlds) continue
      if (name === 'screenshots' && !options.screenshots) continue
      const path = join(gameDir, name)
      if (entry.isDirectory()) zip.addLocalFolder(path, name)
      else zip.addLocalFile(path)
    }
  }
  await zip.writeZipPromise(dest)
}

/** Profil décrit par un zip : Aloria (aloria-profile.json), Prism Launcher / MultiMC (mmc-pack.json) ou CurseForge (manifest.json) */
interface Detected {
  input: ProfileInput
  /** Dossier du zip qui devient le dossier du profil (« » pour la racine) */
  root: string
}

const entryText = (zip: AdmZip, path: string) => zip.getEntry(path)?.getData().toString('utf8')

/** Vérifie que le chargeur est géré par Aloria et convertit la version de Forge au format du launcher */
async function loaderInput(gameVersion: string, loader: string, version: string | null): Promise<Pick<ProfileInput, 'loader' | 'loaderVersion'>> {
  if (loader === 'vanilla' || loader === 'fabric') return { loader, loaderVersion: version }
  if (loader === 'neoforge' && neoforgeSupported(gameVersion)) return { loader, loaderVersion: version }
  if (loader === 'forge') {
    if (!forgeSupported(gameVersion)) throw new Error(tm('err.modpackForge', { version: gameVersion }))
    return { loader, loaderVersion: version ? await forgeVersion(gameVersion, version) : null }
  }
  throw new Error(tm('err.modpackLoader', { loader }))
}

async function detect(zip: AdmZip, fallbackName: string): Promise<Detected> {
  const names = zip.getEntries().map((e) => e.entryName)

  const aloria = entryText(zip, PROFILE_FILE)
  if (aloria) {
    const { profile } = JSON.parse(aloria) as { profile: ProfileInput }
    return { input: { ...profile, ...(await loaderCheck(profile)) }, root: '' }
  }

  // Prism Launcher / MultiMC : mmc-pack.json (composants) à côté du dossier .minecraft (ou minecraft)
  const pack = names.find((n) => n === 'mmc-pack.json' || n.endsWith('/mmc-pack.json'))
  if (pack) {
    const base = pack.slice(0, -'mmc-pack.json'.length)
    const { components } = JSON.parse(entryText(zip, pack)!) as { components: { uid: string; version?: string }[] }
    const version = (uid: string) => components.find((c) => c.uid === uid)?.version ?? null
    const gameVersion = version('net.minecraft')
    if (!gameVersion) throw new Error(tm('err.instanceUnknown', { name: fallbackName }))
    const other = version('org.quiltmc.quilt-loader') ? 'Quilt' : null
    const loader =
      other ??
      (version('net.fabricmc.fabric-loader') ? 'fabric' : version('net.neoforged') ? 'neoforge' : version('net.minecraftforge') ? 'forge' : 'vanilla')
    const loaderVersion = version('net.fabricmc.fabric-loader') ?? version('net.neoforged') ?? version('net.minecraftforge')
    const cfgName = entryText(zip, `${base}instance.cfg`)?.match(/^name=(.*)$/m)?.[1]?.trim()
    const root = names.some((n) => n.startsWith(`${base}.minecraft/`)) ? `${base}.minecraft/` : `${base}minecraft/`
    return {
      input: {
        name: cfgName || fallbackName,
        icon: '📥',
        versionId: gameVersion,
        ramMb: null,
        ...(await loaderInput(gameVersion, loader, loaderVersion))
      },
      root
    }
  }

  // CurseForge : la liste des mods ne donne que des numéros, téléchargeables seulement avec une clé de l'API CurseForge
  const manifest = entryText(zip, 'manifest.json')
  if (manifest && /"manifestType"\s*:\s*"minecraftModpack"/.test(manifest)) throw new Error(tm('err.instanceCurseforge'))

  throw new Error(tm('err.instanceUnknown', { name: fallbackName }))
}

/** Profil Aloria exporté par une autre version : son chargeur doit toujours être pris en charge */
async function loaderCheck(p: ProfileInput): Promise<Pick<ProfileInput, 'loader' | 'loaderVersion'>> {
  if (p.loader === 'forge' && !forgeSupported(p.versionId)) throw new Error(tm('err.modpackForge', { version: p.versionId }))
  return { loader: p.loader as Loader, loaderVersion: p.loaderVersion }
}

/** Le zip est-il un profil complet (Aloria, Prism, MultiMC, CurseForge) plutôt qu'un resource pack ? */
export function isInstanceZip(zip: AdmZip): boolean {
  return zip
    .getEntries()
    .some((e) => e.entryName === PROFILE_FILE || e.entryName === 'mmc-pack.json' || e.entryName.endsWith('/mmc-pack.json') || e.entryName === 'manifest.json')
}

/** Crée un profil à partir d'un zip de profil ; en cas d'échec, rien ne reste */
export async function importInstance(path: string): Promise<Profile> {
  let zip: AdmZip
  try {
    zip = new AdmZip(path)
  } catch {
    throw new Error(tm('err.importUnreadable', { name: path.split(/[\\/]/).pop() ?? path }))
  }
  const fallbackName = (path.split(/[\\/]/).pop() ?? 'Profil').replace(/\.zip$/i, '')
  const { input, root } = await detect(zip, fallbackName)
  const profile = createProfile(input)
  const gameDir = gameDirOf(profile.id)
  try {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith(root)) continue
      const rel = entry.entryName.slice(root.length)
      if (!rel || rel === PROFILE_FILE) continue
      const dest = safeJoin(gameDir, rel)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
    }
  } catch (err) {
    await deleteProfile(profile.id, true).catch(() => {})
    throw err
  }
  return profile
}
