import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { gameDirOf, getProfile } from '../profiles'
import { resolveVersionId } from './versions'
import { installContent, modrinthLoaders, setContentEnabled } from '../modrinth/content'
import { getProject, getProjects, getVersions, listVersions, search, versionsByHash } from '../modrinth/api'
import { cfFiles, cfFingerprint, cfModIdsByFingerprint, cfMods, modIdOf } from '../curseforge'
import { bufferSource, fileSource, urlSource, zipEntries, zipRead, type ZipSource } from '../shared/zipPeek'
import type { Loader, MissingMod, ModCheck } from '../../shared/types'

/**
 * Vérification des mods avant de lancer le jeu : chaque mod du dossier mods déclare les mods dont il a besoin
 * (fabric.mod.json, mods.toml de Forge, neoforge.mods.toml). Sans eux, le chargeur plante au démarrage avec un message
 * que les joueurs ne comprennent pas : Aloria propose plutôt de les installer, de les réactiver ou de désactiver le mod.
 */

/** Ce qu'un jar déclare : les identifiants qu'il fournit et ceux dont il a besoin (jars embarqués compris) */
interface JarMeta {
  name: string | null
  ids: string[]
  needs: string[]
}

// Fournis par le jeu ou le chargeur lui-même
const BUILT_IN: Record<Loader, string[]> = {
  fabric: ['minecraft', 'java', 'fabricloader', 'fabric-loader', 'mixinextras'],
  forge: ['minecraft', 'java', 'forge', 'fml', 'javafml', 'lowcodefml', 'mcp'],
  neoforge: ['minecraft', 'java', 'neoforge', 'forge', 'fml', 'javafml', 'lowcodefml'],
  vanilla: []
}

/** Mini-lecteur TOML (mods.toml) : tables [[mods]] et [[dependencies.<mod>]], textes, booléens ; le reste est ignoré */
function parseModsToml(text: string): { mods: Record<string, string>[]; deps: Record<string, string>[] } {
  const mods: Record<string, string>[] = []
  const deps: Record<string, string>[] = []
  let current: Record<string, string> | null = null
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const table = /^\[\[\s*([^\]]+?)\s*\]\]/.exec(line)
    if (table) {
      current = {}
      if (table[1] === 'mods') mods.push(current)
      else if (table[1].startsWith('dependencies.')) deps.push(current)
      else current = null
      continue
    }
    if (line.startsWith('[')) {
      current = null
      continue
    }
    const kv = /^([\w.-]+)\s*=\s*(.*)$/.exec(line)
    if (!kv) continue
    let value = kv[2]
    // Textes sur plusieurs lignes (description = '''…''') : sautés jusqu'à leur fin
    const triple = value.startsWith("'''") ? "'''" : value.startsWith('"""') ? '"""' : null
    if (triple) {
      while (!value.slice(3).includes(triple) && i + 1 < lines.length) value += '\n' + lines[++i]
      continue
    }
    const quoted = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(value)
    value = quoted ? (quoted[1] ?? quoted[2]) : value.replace(/\s+#.*$/, '').trim()
    if (current) current[kv[1]] = value
  }
  return { mods, deps }
}

/** Fabric accepte parfois des retours à la ligne bruts dans les textes : on les retire avant de relire */
function parseJson(raw: Buffer): Record<string, unknown> | null {
  const text = raw.toString('utf8').replace(/^﻿/, '')
  for (const attempt of [text, text.replace(/[\u0000-\u001f]+/g, ' ')]) {
    try {
      return JSON.parse(attempt) as Record<string, unknown>
    } catch {
      // Essai suivant
    }
  }
  return null
}

/** Lit la fiche d'un jar (et de ses jars embarqués) selon le chargeur du profil */
async function readJar(read: ZipSource, size: number, loader: Loader, depth = 0): Promise<JarMeta | null> {
  const entries = await zipEntries(read, size)
  if (!entries) return null
  const meta: JarMeta = { name: null, ids: [], needs: [] }
  const file = async (name: string) => {
    const entry = entries.get(name)
    return entry ? zipRead(read, entry) : null
  }
  let nested: string[] = []

  if (loader === 'fabric') {
    const raw = await file('fabric.mod.json')
    const json = raw && parseJson(raw)
    if (!json) return meta
    if (typeof json.id === 'string') meta.ids.push(json.id)
    if (typeof json.name === 'string') meta.name = json.name
    if (Array.isArray(json.provides)) meta.ids.push(...json.provides.filter((p): p is string => typeof p === 'string'))
    if (json.depends && typeof json.depends === 'object') meta.needs.push(...Object.keys(json.depends))
    if (Array.isArray(json.jars)) nested = json.jars.map((j) => (j as { file?: string }).file).filter((f): f is string => !!f)
  } else {
    const raw = (loader === 'neoforge' ? await file('META-INF/neoforge.mods.toml') : null) ?? (await file('META-INF/mods.toml'))
    if (raw) {
      const { mods, deps } = parseModsToml(raw.toString('utf8'))
      for (const m of mods) {
        if (m.modId) meta.ids.push(m.modId)
        if (!meta.name && m.displayName) meta.name = m.displayName
      }
      for (const d of deps) {
        const required = d.type ? d.type.toLowerCase() === 'required' : d.mandatory === 'true'
        if (required && d.modId && d.side?.toUpperCase() !== 'SERVER') meta.needs.push(d.modId)
      }
    }
    const jarjar = await file('META-INF/jarjar/metadata.json')
    const list = jarjar && parseJson(jarjar)
    if (list && Array.isArray(list.jars)) nested = list.jars.map((j) => (j as { path?: string }).path).filter((p): p is string => !!p)
  }

  // Jars embarqués : ils sont chargés comme des mods à part entière
  if (depth < 3) {
    for (const path of nested) {
      const data = await file(path)
      if (!data) continue
      const inner = await readJar(bufferSource(data), data.length, loader, depth + 1)
      if (inner) {
        meta.ids.push(...inner.ids)
        meta.needs.push(...inner.needs)
      }
    }
  }
  return meta
}

async function readLocalJar(path: string, loader: Loader): Promise<JarMeta | null> {
  try {
    const src = await fileSource(path)
    try {
      return await readJar(src.read, src.size, loader)
    } finally {
      await src.close()
    }
  } catch {
    return null
  }
}

/** Fiches lues pendant cette session (un jar ne change pas sans changer de taille ou de date) */
const cache = new Map<string, JarMeta | null>()

async function jarMeta(path: string, loader: Loader): Promise<JarMeta | null> {
  const s = await stat(path).catch(() => null)
  if (!s) return null
  const key = `${loader}|${path}|${s.size}|${s.mtimeMs}`
  if (!cache.has(key)) cache.set(key, await readLocalJar(path, loader))
  return cache.get(key)!
}

const DISABLED = '.disabled'
const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge']
/** « stylish-effects », « stylish_effects » et « stylisheffects » désignent le même mod */
const loose = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const FABRIC_API = 'P7dR8mSH'
/** Modules de Fabric API (« fabric-networking-api-v1 »…) : embarqués dans Fabric API, pas publiés à part */
const isFabricApiModule = (id: string) => id === 'fabric' || /^fabric-.+-v\d+$/.test(id) || id.startsWith('fabric-api-')

/**
 * Serveur Fabric créé depuis un modpack : les mods « côté joueur » en ont été retirés, et ceux qui en dépendent (ex. un écran
 * de configuration qui demande Mod Menu) empêcheraient le serveur de démarrer. Ils sont retirés à leur tour, en cascade.
 */
export async function dropOrphanMods(modsDir: string): Promise<string[]> {
  const removed: string[] = []
  const mods: { name: string; meta: JarMeta }[] = []
  for (const name of await readdir(modsDir)) {
    if (!name.endsWith('.jar')) continue
    const meta = await jarMeta(join(modsDir, name), 'fabric')
    if (meta) mods.push({ name, meta })
  }
  for (;;) {
    const provided = new Set([...BUILT_IN.fabric, ...mods.flatMap((m) => m.meta.ids)])
    const fabricApi = mods.some((m) => m.meta.ids.includes('fabric-api'))
    const orphans = mods.filter((m) => m.meta.needs.some((id) => !provided.has(id) && !(fabricApi && isFabricApiModule(id))))
    if (orphans.length === 0) return removed
    for (const m of orphans) {
      await rm(join(modsDir, m.name), { force: true })
      removed.push(m.name)
      mods.splice(mods.indexOf(m), 1)
    }
  }
}

/** Projet Modrinth qui fournit vraiment cet identifiant pour cette version du jeu (sa fiche est vérifiée) */
async function findOnModrinth(
  id: string,
  candidates: string[],
  loader: Loader,
  gameVersion: string
): Promise<{ projectId: string; title: string; iconUrl: string | null } | null> {
  const loaders = modrinthLoaders('mod', loader)
  const tried = new Set<string>()
  for (const candidate of candidates) {
    if (tried.size >= 8) break
    try {
      const project = await getProject(candidate)
      if (tried.has(project.id) || project.project_type !== 'mod') continue
      tried.add(project.id)
      const versions = await listVersions(project.id, loaders, [gameVersion])
      const version = versions.find((v) => v.version_type === 'release') ?? versions[0]
      const file = version && (version.files.find((f) => f.primary) ?? version.files[0])
      if (!file) continue
      // Sans les jars embarqués : des dizaines de lectures à distance pour Fabric API
      const meta = await readJar(urlSource(file.url), file.size, loader, 3)
      if (meta?.ids.includes(id) || (project.id === FABRIC_API && isFabricApiModule(id))) return { projectId: project.id, title: project.title, iconUrl: project.icon_url }
    } catch {
      // Projet introuvable ou Modrinth injoignable : candidat suivant
    }
  }
  return null
}

/** Mods qui manquent aux mods activés du profil (null : rien ne manque, ou chargeur sans mods) */
/** Ce que aloria-content.json sait d'un fichier installé depuis la Bibliothèque */
type Indexed = { title?: string; projectId?: string; versionId?: string; modrinthId?: string }

export async function checkMods(profileId: string): Promise<ModCheck | null> {
  const profile = getProfile(profileId)
  const loader = profile.loader
  if (loader === 'vanilla') return null
  const dir = join(gameDirOf(profile.id), 'mods')
  if (!existsSync(dir)) return null

  let index: Record<string, Indexed> = {}
  try {
    index = JSON.parse(await readFile(join(gameDirOf(profile.id), 'aloria-content.json'), 'utf8'))
  } catch {
    // Pas d'index : noms lus dans les jars
  }

  const enabled: { fileName: string; meta: JarMeta }[] = []
  const disabled: { fileName: string; meta: JarMeta }[] = []
  for (const entry of await readdir(dir)) {
    const off = entry.endsWith(DISABLED)
    const fileName = off ? entry.slice(0, -DISABLED.length) : entry
    // Le mod du launcher est remis (avec Fabric API) au lancement : ses besoins sont déjà couverts
    if (!fileName.endsWith('.jar') || fileName === 'aloria-hud.jar') continue
    const meta = await jarMeta(join(dir, entry), loader)
    if (meta) (off ? disabled : enabled).push({ fileName, meta })
  }

  const provided = new Set([...BUILT_IN[loader], ...enabled.flatMap((m) => m.meta.ids)])
  const titleOf = (m: { fileName: string; meta: JarMeta }) => index[m.fileName]?.title ?? m.meta.name ?? m.fileName
  const needed = new Map<string, { fileName: string; title: string }[]>()
  for (const mod of enabled) {
    for (const id of new Set(mod.meta.needs)) {
      if (provided.has(id)) continue
      const list = needed.get(id) ?? []
      if (!list.some((r) => r.fileName === mod.fileName)) list.push({ fileName: mod.fileName, title: titleOf(mod) })
      needed.set(id, list)
    }
  }
  // Mods d'un modpack : testés ensemble par son auteur, seuls leurs jars comptent (Modrinth en déclare parfois à tort)
  let fromPack = new Set<string>()
  try {
    const manifest = JSON.parse(await readFile(join(gameDirOf(profile.id), 'aloria-modpack.json'), 'utf8')) as { files: Record<string, string> }
    fromPack = new Set(Object.keys(manifest.files).map((path) => path.split('/').pop()!))
  } catch {
    // Modpack installé avant cette liste : on ne sait pas quels mods en viennent, seuls les jars comptent
    if (profile.modpack) fromPack = new Set(enabled.map((m) => m.fileName))
  }
  const fromModrinth = await modrinthNeeds(enabled, fromPack, index, provided, loader === 'fabric' ? ['fabric', 'quilt'] : [loader], titleOf)
  const fromCurseforge = await curseforgeNeeds(dir, enabled, fromPack, index, titleOf)
  if (needed.size === 0 && fromModrinth.size === 0 && fromCurseforge.size === 0) return null

  const gameVersion = await resolveVersionId(profile.versionId)
  // Dépendances déclarées sur Modrinth par les mods qui les demandent : les candidats les plus sûrs
  const declared: string[] = []
  try {
    const requirers = [...new Set([...needed.values()].flat().map((r) => r.fileName))]
    const hashes = await Promise.all(requirers.map(async (f) => createHash('sha1').update(await readFile(join(dir, f))).digest('hex')))
    for (const version of Object.values(await versionsByHash(hashes))) {
      for (const dep of version.dependencies) if (dep.dependency_type === 'required' && dep.project_id) declared.push(dep.project_id)
    }
  } catch {
    // Modrinth injoignable : on cherche par identifiant
  }

  const missing: MissingMod[] = []
  for (const [id, requiredBy] of needed) {
    const off = disabled.find((m) => m.meta.ids.includes(id))
    let fix: MissingMod['fix'] = { kind: 'none' }
    if (off) fix = { kind: 'enable', fileName: off.fileName, title: titleOf(off) }
    else {
      const hits = await search({ profileId, type: 'mod', query: id, sort: 'relevance', offset: 0 }, gameVersion, modrinthLoaders('mod', loader))
        .then((r) => r.hits.slice(0, 4).map((h) => h.projectId))
        .catch(() => [] as string[])
      const first = loader === 'fabric' && isFabricApiModule(id) ? [FABRIC_API] : []
      const found = await findOnModrinth(id, [...new Set([...first, id, id.replace(/_/g, '-'), ...declared, ...hits])], loader, gameVersion)
      if (found) fix = { kind: 'install', ...found }
    }
    missing.push({ id, requiredBy, fix })
  }

  const providedLoose = new Set([...provided].map(loose))
  // Dépendances que seuls Modrinth ou CurseForge connaissent : le projet est déjà identifié, il reste à le réactiver ou l'installer
  const projects: { id: string; slug: string; title: string; icon_url: string | null }[] =
    fromModrinth.size > 0 ? await getProjects([...fromModrinth.keys()]).catch(() => []) : []
  if (fromCurseforge.size > 0) {
    const mods = await cfMods([...fromCurseforge.keys()].map(modIdOf)).catch(() => [])
    projects.push(...mods.map((m) => ({ id: `cf:${m.id}`, slug: m.slug, title: m.name, icon_url: m.logo?.thumbnailUrl ?? null })))
  }
  for (const [projectId, requiredBy] of [...fromModrinth, ...fromCurseforge]) {
    // Déjà trouvé par le jar (sous l'identifiant du mod plutôt que celui du projet)
    const same = missing.find(
      (m) => (m.fix.kind === 'install' && m.fix.projectId === projectId) || (m.fix.kind === 'enable' && index[m.fix.fileName]?.projectId === projectId)
    )
    if (same) {
      for (const r of requiredBy) if (!same.requiredBy.some((s) => s.fileName === r.fileName)) same.requiredBy.push(r)
      continue
    }
    const project = projects.find((p) => p.id === projectId)
    if (!project || [project.slug, project.title].some((name) => providedLoose.has(loose(name)))) continue
    const off = disabled.find((m) => index[m.fileName]?.projectId === projectId)
    const fix: MissingMod['fix'] = off
      ? { kind: 'enable', fileName: off.fileName, title: titleOf(off) }
      : { kind: 'install', projectId, title: project.title, iconUrl: project.icon_url }
    missing.push({ id: project.slug, requiredBy, fix })
  }
  return missing.length > 0 ? { missing } : null
}

/**
 * Dépendances obligatoires déclarées sur Modrinth par les mods installés depuis la Bibliothèque (certains, comme REI
 * pour Fabric, ne les écrivent pas dans leur jar) et absentes des mods activés ; ceux de `skip` (modpack) ne sont pas consultés
 */
async function modrinthNeeds(
  enabled: { fileName: string; meta: JarMeta }[],
  skip: Set<string>,
  index: Record<string, Indexed>,
  provided: Set<string>,
  loaders: string[],
  titleOf: (m: { fileName: string; meta: JarMeta }) => string
): Promise<Map<string, { fileName: string; title: string }[]>> {
  const needs = new Map<string, { fileName: string; title: string }[]>()
  const present = new Set(enabled.flatMap((m) => [index[m.fileName]?.projectId, index[m.fileName]?.modrinthId]).filter(Boolean))
  // Mods venus de CurseForge : leurs dépendances sont lues par curseforgeNeeds
  const byVersion = new Map(
    enabled
      .filter((m) => index[m.fileName]?.versionId && !index[m.fileName].projectId?.startsWith('cf:') && !skip.has(m.fileName))
      .map((m) => [index[m.fileName].versionId!, m])
  )
  if (byVersion.size === 0) return needs
  try {
    const ids = [...byVersion.keys()]
    for (let i = 0; i < ids.length; i += 100) {
      for (const version of await getVersions(ids.slice(i, i + 100))) {
        const mod = byVersion.get(version.id)
        // Version publiée pour plusieurs chargeurs : ses dépendances peuvent ne valoir que pour un autre (Kotlin pour Forge…)
        if (!mod || version.loaders.some((l) => MOD_LOADERS.includes(l) && !loaders.includes(l))) continue
        for (const dep of version.dependencies) {
          if (dep.dependency_type !== 'required' || !dep.project_id || present.has(dep.project_id)) continue
          // Fabric API embarqué ailleurs, ou fourni sous un autre nom : le jar le dit déjà
          if (dep.project_id === FABRIC_API && provided.has('fabric-api')) continue
          const list = needs.get(dep.project_id) ?? []
          list.push({ fileName: mod.fileName, title: titleOf(mod) })
          needs.set(dep.project_id, list)
        }
      }
    }
  } catch {
    // Modrinth injoignable : seuls les jars comptent
  }
  return needs
}

/** Dépendances obligatoires déclarées sur CurseForge par les mods installés depuis CurseForge, absentes des mods activés */
async function curseforgeNeeds(
  dir: string,
  enabled: { fileName: string; meta: JarMeta }[],
  skip: Set<string>,
  index: Record<string, Indexed>,
  titleOf: (m: { fileName: string; meta: JarMeta }) => string
): Promise<Map<string, { fileName: string; title: string }[]>> {
  const needs = new Map<string, { fileName: string; title: string }[]>()
  const present = new Set(enabled.map((m) => index[m.fileName]?.projectId).filter(Boolean))
  const byFile = new Map(
    enabled
      .filter((m) => index[m.fileName]?.projectId?.startsWith('cf:') && index[m.fileName].versionId && !skip.has(m.fileName))
      .map((m) => [Number(index[m.fileName].versionId), m])
  )
  if (byFile.size === 0) return needs
  try {
    for (const file of await cfFiles([...byFile.keys()])) {
      const mod = byFile.get(file.id)
      if (!mod) continue
      for (const dep of file.dependencies ?? []) {
        const id = `cf:${dep.modId}`
        if (dep.relationType !== 3 || present.has(id)) continue
        const list = needs.get(id) ?? []
        list.push({ fileName: mod.fileName, title: titleOf(mod) })
        needs.set(id, list)
      }
    }
    // Jars sans projet connu (ceux d'un modpack, ajoutés à la main) : reconnus par CurseForge à leur empreinte. Sinon,
    // une bibliothèque fournie par le modpack passait pour absente et « Réparer » en installait une autre version
    const unknown = enabled.filter((m) => !index[m.fileName]?.projectId)
    if (needs.size > 0 && unknown.length > 0) {
      const fingerprints = await Promise.all(unknown.map(async (m) => cfFingerprint(await readFile(join(dir, m.fileName)))))
      for (const modId of await cfModIdsByFingerprint(fingerprints)) needs.delete(`cf:${modId}`)
    }
  } catch {
    // CurseForge injoignable : seuls les jars comptent
  }
  return needs
}

/**
 * Répare le profil : installe ou réactive ce qui manque ; ce qui est introuvable (ou tout, avec `disableOnly`) fait
 * désactiver les mods qui le demandent
 */
export async function fixMods(profileId: string, check: ModCheck, disableOnly: boolean): Promise<void> {
  for (const m of check.missing) {
    if (!disableOnly && m.fix.kind === 'install') await installContent(profileId, m.fix.projectId, 'mod')
    else if (!disableOnly && m.fix.kind === 'enable') await setContentEnabled(profileId, 'mod', m.fix.fileName, true)
    else for (const r of m.requiredBy) await setContentEnabled(profileId, 'mod', r.fileName, false)
  }
}
