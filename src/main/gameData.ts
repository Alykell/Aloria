import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import AdmZip from 'adm-zip'
import { fetchBytes, fetchJson } from './game/download'
import { paths } from './game/paths'
import { loadVersion } from './game/versions'
import { clientJar } from './packs'
import { currentLang } from './i18n'
import type { GameData, GameItem, ItemIcon, ModelFace, Recipe, RecipeIngredient, RecipeKind } from '../shared/types'

/**
 * Ce que l'éditeur de recettes lit dans le jar d'une version : la liste des items (nom dans la langue du launcher),
 * de quoi dessiner leur icône (modèles et textures, le dessin se fait dans l'interface), les tags et les recettes du jeu.
 * Le format des recettes change selon la version : dossier recipes/ puis recipe/ (1.21), résultat { item } puis { id }
 * (1.20.5), ingrédients { item } / { tag } puis en chaîne (1.21.2). `recipeFormat` le lit dans les recettes du jar.
 */
const RESOURCES_URL = 'https://resources.download.minecraft.net/'
const M = 'assets/minecraft/'

export const RECIPE_TYPES: Record<RecipeKind, string> = {
  shaped: 'minecraft:crafting_shaped',
  shapeless: 'minecraft:crafting_shapeless',
  smelting: 'minecraft:smelting',
  blasting: 'minecraft:blasting',
  smoking: 'minecraft:smoking',
  campfire: 'minecraft:campfire_cooking',
  stonecutting: 'minecraft:stonecutting'
}
const KIND_OF_TYPE = Object.fromEntries(Object.entries(RECIPE_TYPES).map(([k, v]) => [v, k as RecipeKind]))

export interface RecipeFormat {
  /** Dossier sous data/<espace>/ */
  dir: 'recipe' | 'recipes'
  /** « minecraft:stick » / « #minecraft:planks » (1.21.2+), sinon { item } / { tag } */
  stringIngredients: boolean
  /** Résultat { id, count } (1.20.5+), sinon { item, count } et une simple chaîne pour les fours et le tailleur */
  idResult: boolean
  /** Format de datapack [majeur, mineur] ; majeur seul jusqu'à la 1.21.8 */
  dataFormat: [number, number]
  /** min_format / max_format au lieu de pack_format (1.21.9+) */
  rangeFormat: boolean
  kinds: RecipeKind[]
}

type Json = Record<string, unknown>
const strip = (id: string) => id.replace(/^minecraft:/, '')
const full = (id: string) => (id.startsWith('#') ? id : id.includes(':') ? id : `minecraft:${id}`)

function readJson(zip: AdmZip, path: string): Json | null {
  const data = zip.getEntry(path)?.getData()
  if (!data) return null
  try {
    return JSON.parse(data.toString('utf8')) as Json
  } catch {
    return null
  }
}

/** Fichiers JSON d'un dossier du jar : chemin relatif sans « .json » → contenu */
export function jsonFiles(zip: AdmZip, prefix: string): Map<string, Json> {
  const out = new Map<string, Json>()
  for (const entry of zip.getEntries()) {
    const name = entry.entryName
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue
    try {
      out.set(name.slice(prefix.length, -5), JSON.parse(entry.getData().toString('utf8')) as Json)
    } catch {
      // fichier illisible : ignoré
    }
  }
  return out
}

function dataDir(zip: AdmZip, plural: string, singular: string): string {
  return zip.getEntries().some((e) => e.entryName.startsWith(`data/minecraft/${singular}/`)) ? singular : plural
}

// ---------------------------------------------------------------- format

export function recipeFormat(zip: AdmZip, gameVersion: string): RecipeFormat {
  const dir = dataDir(zip, 'recipes', 'recipe') as RecipeFormat['dir']
  const recipes = jsonFiles(zip, `data/minecraft/${dir}/`)
  const furnace = recipes.get('furnace') ?? [...recipes.values()].find((r) => r.type === RECIPE_TYPES.shaped)
  const key = Object.values((furnace?.key ?? {}) as Json)[0]
  const result = furnace?.result as Json | undefined
  const kinds = new Set<RecipeKind>(['shaped', 'shapeless'])
  for (const r of recipes.values()) if (KIND_OF_TYPE[r.type as string]) kinds.add(KIND_OF_TYPE[r.type as string])

  const raw = zip.getEntry('version.json')?.getData().toString('utf8')
  let dataFormat: [number, number] = [4, 0]
  let rangeFormat = false
  if (raw) {
    const pv = (JSON.parse(raw) as { pack_version?: number | { data?: number; data_major?: number; data_minor?: number } }).pack_version
    if (typeof pv === 'number') dataFormat = [pv, 0]
    else if (pv?.data_major !== undefined) {
      dataFormat = [pv.data_major, pv.data_minor ?? 0]
      rangeFormat = true
    } else if (pv?.data !== undefined) dataFormat = [pv.data, 0]
  } else if (/^1\.13/.test(gameVersion)) dataFormat = [4, 0]
  return { dir, stringIngredients: typeof key === 'string', idResult: !!result && 'id' in result, dataFormat, rangeFormat, kinds: [...kinds] }
}

// ---------------------------------------------------------------- recettes du jeu

function parseIngredient(value: unknown): RecipeIngredient | null {
  if (typeof value === 'string') return [full(value)]
  if (Array.isArray(value)) {
    const all = value.map(parseIngredient)
    return all.every(Boolean) && all.length > 0 ? all.flatMap((i) => i!) : null
  }
  if (value && typeof value === 'object') {
    const o = value as Json
    if (typeof o.item === 'string') return [full(o.item)]
    if (typeof o.tag === 'string') return [`#${full(o.tag)}`]
  }
  return null
}

function parseRecipe(id: string, r: Json): Recipe | null {
  const kind = KIND_OF_TYPE[r.type as string]
  if (!kind) return null
  let result: string | undefined
  let count = typeof r.count === 'number' ? r.count : 1
  if (typeof r.result === 'string') result = r.result
  else if (r.result && typeof r.result === 'object') {
    const res = r.result as Json
    // Résultat avec composants / NBT (feux d'artifice…) : pas modifiable sans les perdre
    if (res.components || res.nbt) return null
    result = (res.id ?? res.item) as string | undefined
    if (typeof res.count === 'number') count = res.count
  }
  if (!result) return null
  const recipe: Recipe = { id, kind, result: full(result), count }
  if (typeof r.group === 'string' && r.group) recipe.group = r.group

  if (kind === 'shaped') {
    const pattern = r.pattern as string[]
    const key = (r.key ?? {}) as Json
    if (!Array.isArray(pattern) || pattern.length > 3 || pattern.some((row) => row.length > 3)) return null
    const grid: (RecipeIngredient | null)[] = Array(9).fill(null)
    for (let y = 0; y < pattern.length; y++)
      for (let x = 0; x < pattern[y].length; x++) {
        const c = pattern[y][x]
        if (c === ' ') continue
        const ing = parseIngredient(key[c])
        if (!ing) return null
        grid[y * 3 + x] = ing
      }
    recipe.grid = grid
  } else if (kind === 'shapeless') {
    const list = (r.ingredients as unknown[]) ?? []
    const ings = list.map(parseIngredient)
    if (ings.length === 0 || ings.length > 9 || ings.some((i) => !i)) return null
    recipe.ingredients = ings as RecipeIngredient[]
  } else {
    const ing = parseIngredient(r.ingredient)
    if (!ing) return null
    recipe.input = ing
    if (kind !== 'stonecutting') {
      recipe.experience = typeof r.experience === 'number' ? r.experience : 0
      recipe.cookingTime = typeof r.cookingtime === 'number' ? r.cookingtime : undefined
    }
  }
  return recipe
}

// ---------------------------------------------------------------- tags

function readTags(zip: AdmZip): Record<string, string[]> {
  const dir = dataDir(zip, 'tags/items', 'tags/item')
  const raw = jsonFiles(zip, `data/minecraft/${dir}/`)
  const done: Record<string, string[]> = {}
  const resolve = (id: string, seen: Set<string>): string[] => {
    if (done[id]) return done[id]
    const tag = raw.get(strip(id))
    if (!tag || seen.has(id)) return []
    seen.add(id)
    const items: string[] = []
    for (const v of (tag.values as unknown[]) ?? []) {
      const ref = typeof v === 'string' ? v : ((v as Json)?.id as string)
      if (!ref) continue
      if (ref.startsWith('#')) items.push(...resolve(full(ref.slice(1)), seen))
      else items.push(full(ref))
    }
    return (done[id] = [...new Set(items)])
  }
  for (const name of raw.keys()) resolve(`minecraft:${name}`, new Set())
  return done
}

// ---------------------------------------------------------------- noms

/** Noms des items : en_us est dans le jar, les autres langues dans les assets (téléchargées si besoin) */
async function gameLang(zip: AdmZip, gameVersion: string): Promise<Record<string, string>> {
  const en = (readJson(zip, `${M}lang/en_us.json`) ?? {}) as Record<string, string>
  if (currentLang() !== 'fr') return en
  try {
    const info = (await loadVersion(gameVersion)).assetIndex
    if (!info) return en
    const indexPath = join(paths.assets, 'indexes', `${info.id}.json`)
    const index = existsSync(indexPath)
      ? (JSON.parse(await readFile(indexPath, 'utf8')) as { objects: Record<string, { hash: string }> })
      : await fetchJson<{ objects: Record<string, { hash: string }> }>(info.url)
    const hash = index.objects['minecraft/lang/fr_fr.json']?.hash
    if (!hash) return en
    const rel = `${hash.slice(0, 2)}/${hash}`
    const file = join(paths.assets, 'objects', rel)
    if (!existsSync(file)) {
      const res = await fetchBytes(RESOURCES_URL + rel)
      if (!res.ok) return en
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, res.data)
    }
    return { ...en, ...(JSON.parse(await readFile(file, 'utf8')) as Record<string, string>) }
  } catch {
    return en
  }
}

// ---------------------------------------------------------------- modèles

/** Texture d'un modèle : chemin, référence « #nom », ou { sprite } (26.x) */
type TextureRef = string | { sprite?: string }

interface RawModel {
  parent?: string
  textures?: Record<string, TextureRef>
  elements?: {
    from: number[]
    to: number[]
    rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number }
    shade?: boolean
    faces?: Partial<Record<ModelFace, { texture: string; uv?: number[]; rotation?: number; tintindex?: number }>>
  }[]
  display?: { gui?: { rotation?: number[]; translation?: number[]; scale?: number[] } }
}

const TINT_GRASS = '#7cbd6b'
const TINT_FOLIAGE = '#48b518'

function color(value: unknown): string | undefined {
  if (typeof value === 'number') return '#' + ((value >>> 0) & 0xffffff).toString(16).padStart(6, '0')
  if (Array.isArray(value) && value.length >= 3)
    return '#' + value.slice(0, 3).map((f: number) => Math.round(f * 255).toString(16).padStart(2, '0')).join('')
  return undefined
}

/** Couleur d'un calque teinté (définitions d'items 1.21.4+) */
function tintColor(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined
  const s = source as Json
  const type = strip(String(s.type ?? ''))
  if (type === 'constant') return color(s.value)
  if (type === 'grass') return TINT_GRASS
  return color(s.default)
}

/** Teinte des anciennes versions (sans définition d'item) : une couleur plausible selon l'item */
function legacyTint(itemId: string, block: boolean): string {
  if (block) return /grass|fern|sugar_cane/.test(itemId) ? TINT_GRASS : TINT_FOLIAGE
  if (itemId.includes('leather')) return '#a06540'
  if (/potion|tipped_arrow/.test(itemId)) return '#385dc6'
  return '#ffffff'
}

class Models {
  private cache = new Map<string, RawModel | null>()
  readonly textures = new Set<string>()
  constructor(private zip: AdmZip) {}

  private load(ref: string): RawModel | null {
    const path = strip(ref)
    if (!this.cache.has(path)) this.cache.set(path, readJson(this.zip, `${M}models/${path}.json`) as RawModel | null)
    return this.cache.get(path)!
  }

  /** Modèle et ses parents fusionnés : textures (l'enfant l'emporte), premiers éléments et affichage trouvés */
  private resolve(ref: string) {
    const chain: RawModel[] = []
    let root: 'generated' | 'entity' | null = null
    let cur: string | undefined = ref
    for (let depth = 0; cur && depth < 24; depth++) {
      const name = strip(cur)
      if (name === 'builtin/generated') root = 'generated'
      if (name === 'builtin/entity') root = 'entity'
      const model = this.load(name)
      if (!model) break
      chain.push(model)
      cur = model.parent
    }
    const textures: Record<string, TextureRef> = {}
    for (const m of [...chain].reverse()) Object.assign(textures, m.textures)
    return {
      textures,
      elements: chain.find((m) => m.elements)?.elements,
      gui: chain.find((m) => m.display?.gui)?.display?.gui,
      root
    }
  }

  private texture(textures: Record<string, TextureRef>, value: TextureRef | undefined): string | null {
    for (let i = 0; value && i < 12; i++) {
      const ref = typeof value === 'string' ? value : value.sprite
      if (!ref) return null
      // Référence écrite sans « # » (« all » au lieu de « #all », ex. noyau lourd) : le jeu l'accepte aussi
      if (!ref.startsWith('#') && !ref.includes('/') && !ref.includes(':') && textures[ref] !== undefined) {
        value = textures[ref]
        continue
      }
      if (!ref.startsWith('#')) {
        if (ref.includes(':') && !ref.startsWith('minecraft:')) return null
        const path = strip(ref)
        if (!this.zip.getEntry(`${M}textures/${path}.png`)) return null
        this.textures.add(path)
        return path
      }
      value = textures[ref.slice(1)]
    }
    return null
  }

  icon(itemId: string, ref: string, tints?: unknown[]): ItemIcon {
    const { textures, elements, gui, root } = this.resolve(ref)
    const tintOf = (index: number | undefined, block: boolean) =>
      index === undefined || index < 0 ? undefined : tints ? tintColor(tints[index]) : legacyTint(itemId, block)
    if (elements && root !== 'generated') {
      const els = elements.map((el) => {
        const faces: Partial<Record<ModelFace, { tex: string; uv?: number[]; rotation?: number; tint?: string }>> = {}
        for (const [dir, face] of Object.entries(el.faces ?? {})) {
          const tex = this.texture(textures, face?.texture)
          if (!face || !tex) continue
          faces[dir as ModelFace] = { tex, uv: face.uv, rotation: face.rotation, tint: tintOf(face.tintindex, true) }
        }
        return { from: el.from, to: el.to, rotation: el.rotation, shade: el.shade, faces }
      })
      return {
        kind: 'model',
        elements: els,
        gui: { rotation: gui?.rotation ?? [0, 0, 0], translation: gui?.translation ?? [0, 0, 0], scale: gui?.scale ?? [1, 1, 1] }
      }
    }
    if (root === 'generated') {
      const layers: { tex: string; tint?: string }[] = []
      for (let i = 0; i < 5; i++) {
        const tex = this.texture(textures, textures[`layer${i}`] ? `#layer${i}` : undefined)
        if (tex) layers.push({ tex, tint: tintOf(i, false) })
      }
      if (layers.length) return { kind: 'flat', layers }
    }
    // Rendu spécial du jeu (coffres, têtes, bannières…) : sa texture « particle » à plat, faute de mieux
    const particle = this.texture(textures, textures.particle ? '#particle' : undefined)
    return particle ? { kind: 'flat', layers: [{ tex: particle }] } : { kind: 'none' }
  }
}

/**
 * Têtes de mobs : le jeu les dessine à part (rendu spécial), leur modèle n'a qu'une texture « particule » (sable des
 * âmes). On refait la tête : un cube texturé avec la tête du mob, prise dans sa texture d'entité (premier chemin
 * existant, ils ont changé au fil des versions). `w` : largeur de la tête en pixels (piglin : 10, avec son groin).
 */
const HEADS: Record<string, { textures: string[]; w?: number; size?: number; at?: [number, number] }> = {
  skeleton_skull: { textures: ['entity/skeleton/skeleton'] },
  wither_skeleton_skull: { textures: ['entity/skeleton/wither_skeleton'] },
  zombie_head: { textures: ['entity/zombie/zombie'] },
  creeper_head: { textures: ['entity/creeper/creeper'] },
  piglin_head: { textures: ['entity/piglin/piglin'], w: 10 },
  player_head: { textures: ['entity/player/wide/steve', 'entity/steve'] },
  // Tête du dragon : un cube de 16 pixels, rangé plus loin dans sa grande texture
  dragon_head: { textures: ['entity/enderdragon/dragon'], size: 16, at: [112, 30] }
}

/** Cube de tête au format des modèles (UV en seizièmes de la largeur de la texture, comme le dessin des icônes) */
function headIcon(zip: AdmZip, models: Models, itemId: string): ItemIcon | null {
  const head = HEADS[itemId]
  if (!head) return null
  const path = head.textures.find((p) => zip.getEntry(`${M}textures/${p}.png`))
  const png = path && zip.getEntry(`${M}textures/${path}.png`)?.getData()
  if (!path || !png) return null
  models.textures.add(path)
  const unit = png.readUInt32BE(16) / 16
  // Taille dans la texture (pixels) ; le cube dessiné garde la taille d'une tête (8 de haut)
  const d = head.size ?? 8
  const h = d
  const w = head.w ?? d
  const k = 8 / d
  const [ax, ay] = head.at ?? [0, 0]
  // Patron d'une tête dans une texture d'entité : dessus et dessous en haut, puis côté, face, autre côté, arrière
  const box = (ox: number, grow: number) => {
    const uv = (x: number, y: number, x2: number, y2: number) => [(ax + ox + x) / unit, (ay + y) / unit, (ax + ox + x2) / unit, (ay + y2) / unit]
    const half = (w * k) / 2 + grow
    return {
      from: [8 - half, -grow, 8 - (d * k) / 2 - grow],
      to: [8 + half, h * k + grow, 8 + (d * k) / 2 + grow],
      faces: {
        up: { tex: path, uv: uv(d, 0, d + w, d) },
        down: { tex: path, uv: uv(d + w, 0, d + 2 * w, d) },
        east: { tex: path, uv: uv(0, d, d, d + h) },
        south: { tex: path, uv: uv(d, d, d + w, d + h) },
        west: { tex: path, uv: uv(d + w, d, 2 * d + w, d + h) },
        north: { tex: path, uv: uv(2 * d + w, d, 2 * d + 2 * w, d + h) }
      }
    }
  }
  // Seconde couche (chapeau du joueur, etc.), un peu plus grande, à droite dans la texture
  const elements = [box(0, 0), ...(w === 8 && !head.at ? [box(32, 0.5)] : [])]
  return { kind: 'model', elements, gui: { rotation: [30, 45, 0], translation: [0, 3, 0], scale: [1, 1, 1] } }
}

/** Définition d'item (1.21.4+) : le modèle « normal » de l'arbre (repli des conditions, premier d'un composite…) */
function pickModel(node: unknown): { model: string; tints?: unknown[] } | null {
  if (!node || typeof node !== 'object') return null
  const n = node as Json
  switch (strip(String(n.type ?? ''))) {
    case 'model':
      return typeof n.model === 'string' ? { model: n.model, tints: n.tints as unknown[] | undefined } : null
    case 'special':
      return typeof n.base === 'string' ? { model: n.base } : null
    case 'composite':
      for (const m of (n.models as unknown[]) ?? []) {
        const found = pickModel(m)
        if (found) return found
      }
      return null
    case 'condition':
      return pickModel(n.on_false) ?? pickModel(n.on_true)
    case 'select':
      return pickModel(n.fallback) ?? pickModel(((n.cases as Json[]) ?? [])[0]?.model)
    case 'range_dispatch':
      return pickModel(n.fallback) ?? pickModel(((n.entries as Json[]) ?? [])[0]?.model)
    default:
      return null
  }
}

// ---------------------------------------------------------------- tout ensemble

const cache = new Map<string, Promise<GameData>>()

export function gameData(gameVersion: string): Promise<GameData> {
  const key = `${gameVersion}:${currentLang()}`
  if (!cache.has(key)) {
    const p = readGameData(gameVersion)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)!
}

async function readGameData(gameVersion: string): Promise<GameData> {
  const zip = new AdmZip(await clientJar(gameVersion))
  const lang = await gameLang(zip, gameVersion)
  const models = new Models(zip)
  const definitions = jsonFiles(zip, `${M}items/`)

  // Ordre du fichier de langue (proche de celui du jeu : blocs puis items, familles groupées)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(lang)) {
    const m = /^(?:item|block)\.minecraft\.([a-z0-9_]+)$/.exec(key)
    if (m && !seen.has(m[1])) {
      seen.add(m[1])
      ids.push(m[1])
    }
  }
  // Items sans nom simple (potion…) : la liste des définitions (1.21.4+) est complète, on les ajoute à la fin
  for (const id of definitions.keys()) if (!seen.has(id) && !id.includes('/')) ids.push(id)

  const items: GameItem[] = []
  for (const id of ids) {
    if (id === 'air') continue
    let icon: ItemIcon
    const head = headIcon(zip, models, id)
    if (head) icon = head
    else if (definitions.size > 0) {
      const def = definitions.get(id)
      const picked = def && pickModel(def.model)
      if (!picked) continue
      icon = models.icon(id, picked.model, picked.tints)
    } else {
      if (!zip.getEntry(`${M}models/item/${id}.json`)) continue
      icon = models.icon(id, `item/${id}`)
    }
    const name = lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`] ?? lang[`item.minecraft.${id}.effect.water`] ?? id
    items.push({ id: `minecraft:${id}`, name, icon })
  }

  const textures: Record<string, string> = {}
  for (const path of models.textures) {
    const data = zip.getEntry(`${M}textures/${path}.png`)?.getData()
    if (data) textures[path] = `data:image/png;base64,${data.toString('base64')}`
  }

  const format = recipeFormat(zip, gameVersion)
  const recipes: Recipe[] = []
  for (const [path, raw] of jsonFiles(zip, `data/minecraft/${format.dir}/`)) {
    const recipe = parseRecipe(`minecraft:${path}`, raw)
    if (recipe) recipes.push(recipe)
  }
  return { gameVersion, items, textures, tags: readTags(zip), recipes, kinds: format.kinds }
}
