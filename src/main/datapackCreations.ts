import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { paths } from './game/paths'
import { resolveVersionId } from './game/versions'
import { clientJar } from './packs'
import { gameData, jsonFiles, RECIPE_TYPES, recipeFormat, type RecipeFormat } from './gameData'
import { gameDirOf, getProfile } from './profiles'
import { tm } from './i18n'
import type { DatapackCreation, Recipe, RecipeIngredient } from '../shared/types'

/**
 * Datapacks faits dans Aloria (« Créations ») : un fichier JSON par datapack, au format commun de `Recipe`.
 * À l'installation, il devient un zip au format de la version du profil, rangé dans le dossier datapacks/ du profil
 * (`game/datapacks.ts` le copie dans tous ses mondes au lancement) ; chaque enregistrement le remet à jour partout.
 */
const DIR = join(paths.root, 'creations', 'datapacks')
const file = (id: string) => join(DIR, `${id}.json`)
const COOKING_TIME = { smelting: 200, blasting: 100, smoking: 100, campfire: 600 } as const

export async function listDatapacks(): Promise<DatapackCreation[]> {
  if (!existsSync(DIR)) return []
  const out: DatapackCreation[] = []
  for (const name of await readdir(DIR)) {
    if (!name.endsWith('.json')) continue
    try {
      out.push(await getDatapack(name.slice(0, -5)))
    } catch {
      // fichier abîmé : ignoré
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDatapack(id: string): Promise<DatapackCreation> {
  const dp = JSON.parse(await readFile(file(id), 'utf8')) as DatapackCreation
  return { ...dp, recipes: dp.recipes ?? [], removed: dp.removed ?? [], installed: dp.installed ?? {} }
}

export async function createDatapack(name: string, gameVersion: string): Promise<DatapackCreation> {
  const now = Date.now()
  const dp: DatapackCreation = {
    id: randomUUID().slice(0, 8),
    name: name.trim() || tm('datapacks.defaultName'),
    gameVersion: await resolveVersionId(gameVersion),
    recipes: [],
    removed: [],
    installed: {},
    createdAt: now,
    updatedAt: now
  }
  await mkdir(DIR, { recursive: true })
  await writeFile(file(dp.id), JSON.stringify(dp, null, 2))
  return dp
}

/** Enregistre (nom, version, recettes) puis remet à jour le zip dans les profils où il est installé */
export async function saveDatapack(next: DatapackCreation): Promise<DatapackCreation> {
  const prev = await getDatapack(next.id)
  const dp: DatapackCreation = { ...prev, name: next.name.trim() || prev.name, gameVersion: next.gameVersion, recipes: next.recipes, removed: next.removed ?? [], updatedAt: Date.now() }
  for (const profileId of Object.keys(dp.installed)) {
    try {
      dp.installed[profileId] = (await writeToProfile(dp, profileId, dp.installed[profileId])).fileName
    } catch {
      // Profil supprimé entre-temps : on l'oublie
      delete dp.installed[profileId]
    }
  }
  await writeFile(file(dp.id), JSON.stringify(dp, null, 2))
  return dp
}

export async function deleteDatapack(id: string): Promise<void> {
  // Le zip reste dans les profils (comme les packs de textures) : le joueur peut le retirer dans la Bibliothèque
  await rm(file(id), { force: true })
}

/** Installe (ou retire) le datapack d'un profil ; renvoie les recettes laissées de côté (items absents de cette version) */
export async function installDatapack(id: string, profileId: string, install: boolean): Promise<{ dp: DatapackCreation; skipped: string[] }> {
  const dp = await getDatapack(id)
  let skipped: string[] = []
  if (install) {
    const res = await writeToProfile(dp, profileId, dp.installed[profileId])
    dp.installed[profileId] = res.fileName
    skipped = res.skipped
  } else {
    const old = dp.installed[profileId]
    if (old) {
      const dir = join(gameDirOf(profileId), 'datapacks')
      await rm(join(dir, old), { force: true })
      await rm(join(dir, `${old}.disabled`), { force: true })
    }
    delete dp.installed[profileId]
  }
  await writeFile(file(dp.id), JSON.stringify(dp, null, 2))
  return { dp, skipped }
}

export async function exportDatapack(id: string, target: string): Promise<string[]> {
  const dp = await getDatapack(id)
  const { zip, skipped } = await buildZip(dp, dp.gameVersion)
  await writeFile(target, zip)
  return skipped
}

export const zipName = (dp: DatapackCreation) => `Aloria - ${dp.name.replace(/[\\/:*?"<>|]/g, '').trim() || dp.id}.zip`

async function writeToProfile(dp: DatapackCreation, profileId: string, previous?: string): Promise<{ fileName: string; skipped: string[] }> {
  const gameVersion = await resolveVersionId(getProfile(profileId).versionId)
  const { zip, skipped } = await buildZip(dp, gameVersion)
  const dir = join(gameDirOf(profileId), 'datapacks')
  await mkdir(dir, { recursive: true })
  const fileName = zipName(dp)
  // Désactivé dans la Bibliothèque (« .disabled ») : il le reste
  const disabled = !!previous && existsSync(join(dir, `${previous}.disabled`))
  if (previous && previous !== fileName) {
    await rm(join(dir, previous), { force: true })
    await rm(join(dir, `${previous}.disabled`), { force: true })
  }
  const target = join(dir, disabled ? `${fileName}.disabled` : fileName)
  await writeFile(`${target}.part`, zip)
  await rename(`${target}.part`, target)
  return { fileName, skipped }
}

// ---------------------------------------------------------------- zip au format de la version

async function buildZip(dp: DatapackCreation, gameVersion: string): Promise<{ zip: Buffer; skipped: string[] }> {
  const jar = new AdmZip(await clientJar(gameVersion))
  if (!jar.getEntries().some((e) => e.entryName.startsWith('data/minecraft/'))) throw new Error(tm('err.noDatapacks', { version: gameVersion }))
  const format = recipeFormat(jar, gameVersion)
  const data = await gameData(gameVersion)
  const items = new Set(data.items.map((i) => i.id))

  const out = new AdmZip()
  const description = tm('packs.description', { name: dp.name })
  const [major, minor] = format.dataFormat
  const meta: Record<string, unknown> = format.rangeFormat
    ? { pack: { description, min_format: [major, minor], max_format: [major, minor] } }
    : { pack: { pack_format: major, description } }
  // Recettes du jeu supprimées : depuis la 1.19 (format 10), un filtre cache leur fichier dans les packs en dessous
  // (le jeu) ; avant, un fichier vide à leur place, que le jeu refuse (il le note dans son journal) : la recette disparaît
  const removed = new Set(dp.removed)
  if (removed.size && major >= 10) {
    const escape = (path: string) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const block = [...removed].map((id) => {
      const [ns, path] = id.split(':')
      return { namespace: ns, path: `${format.dir}/${escape(path)}\\.json` }
    })
    // Les succès qui débloquent ces recettes (livre de recettes) aussi : en 26.x, une recette absente qu'ils citent
    // empêche le monde de se charger
    const advDir = format.dir === 'recipe' ? 'advancement' : 'advancements'
    for (const [path, adv] of jsonFiles(jar, `data/minecraft/${advDir}/`)) {
      if (recipeRefs(adv).some((id) => removed.has(id))) block.push({ namespace: 'minecraft', path: `${advDir}/${escape(path)}\\.json` })
    }
    meta.filter = { block }
  } else {
    for (const id of removed) {
      const [ns, path] = id.split(':')
      out.addFile(`data/${ns}/${format.dir}/${path}.json`, Buffer.from('{}'))
    }
  }
  out.addFile('pack.mcmeta', Buffer.from(JSON.stringify(meta, null, 2)))

  const skipped: string[] = []
  for (const recipe of dp.recipes) {
    if (removed.has(recipe.id)) continue
    const json = recipeJson(recipe, format, items, data.tags)
    if (!json) {
      skipped.push(recipe.id)
      continue
    }
    const [ns, path] = recipe.id.split(':')
    out.addFile(`data/${ns}/${format.dir}/${path}.json`, Buffer.from(JSON.stringify(json, null, 2)))
  }
  return { zip: out.toBuffer(), skipped }
}

/** Recettes citées par un succès : récompenses et critères « recette débloquée » */
function recipeRefs(adv: Record<string, unknown>): string[] {
  const list = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  const refs = list((adv.rewards as Record<string, unknown> | undefined)?.recipes)
  for (const c of Object.values((adv.criteria ?? {}) as Record<string, { conditions?: Record<string, unknown> }>)) {
    refs.push(...list(c?.conditions?.recipe), ...list(c?.conditions?.recipes))
  }
  return refs.map((id) => (id.includes(':') ? id : `minecraft:${id}`))
}

/** Recette au format de la version, ou null si elle est incomplète ou utilise un item absent de cette version */
export function recipeJson(r: Recipe, f: RecipeFormat, items: Set<string>, tags: Record<string, string[]>): Record<string, unknown> | null {
  if (!f.kinds.includes(r.kind) || !items.has(r.result)) return null
  const count = Math.max(1, Math.min(99, Math.round(r.count || 1)))

  /** Garde ce qui existe dans cette version ; null si plus rien */
  const ingredient = (ing: RecipeIngredient | null | undefined): unknown => {
    const ok = (ing ?? []).filter((i) => (i.startsWith('#') ? !!tags[i.slice(1)] : items.has(i)))
    if (ok.length === 0) return null
    if (f.stringIngredients) {
      if (ok.length === 1) return ok[0]
      // Une liste ne peut contenir que des items : les tags y sont dépliés
      return [...new Set(ok.flatMap((i) => (i.startsWith('#') ? tags[i.slice(1)] : [i])))]
    }
    const objs = ok.map((i) => (i.startsWith('#') ? { tag: i.slice(1) } : { item: i }))
    return objs.length === 1 ? objs[0] : objs
  }
  const stack = f.idResult ? { id: r.result, count } : { item: r.result, count }
  const json: Record<string, unknown> = { type: RECIPE_TYPES[r.kind] }
  if (r.group) json.group = r.group

  if (r.kind === 'shaped') {
    const grid = r.grid ?? []
    const cells = grid.map((c, i) => (c && c.length ? i : -1)).filter((i) => i >= 0)
    if (cells.length === 0) return null
    const xs = cells.map((i) => i % 3)
    const ys = cells.map((i) => Math.floor(i / 3))
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const letters = 'ABCDEFGHI'
    const keyOf = new Map<string, string>()
    const key: Record<string, unknown> = {}
    const pattern: string[] = []
    for (let y = y0; y <= y1; y++) {
      let row = ''
      for (let x = x0; x <= x1; x++) {
        const cell = grid[y * 3 + x]
        if (!cell || cell.length === 0) {
          row += ' '
          continue
        }
        const sig = JSON.stringify(cell)
        if (!keyOf.has(sig)) {
          const value = ingredient(cell)
          if (value === null) return null
          const letter = letters[keyOf.size]
          keyOf.set(sig, letter)
          key[letter] = value
        }
        row += keyOf.get(sig)
      }
      pattern.push(row)
    }
    Object.assign(json, { pattern, key, result: stack })
  } else if (r.kind === 'shapeless') {
    const ings = (r.ingredients ?? []).filter((i) => i.length > 0).map(ingredient)
    if (ings.length === 0 || ings.some((i) => i === null)) return null
    Object.assign(json, { ingredients: ings, result: stack })
  } else {
    const input = ingredient(r.input)
    if (input === null) return null
    json.ingredient = input
    if (r.kind === 'stonecutting') {
      if (f.idResult) json.result = stack
      else Object.assign(json, { result: r.result, count })
    } else {
      json.result = f.idResult ? { id: r.result } : r.result
      json.experience = Math.max(0, r.experience ?? 0)
      json.cookingtime = Math.max(1, Math.round(r.cookingTime ?? COOKING_TIME[r.kind]))
    }
  }
  return json
}
