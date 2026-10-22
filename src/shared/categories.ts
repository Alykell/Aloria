import type { ContentType } from './types'

/**
 * Catégories de la Bibliothèque, communes à Modrinth et CurseForge : un filtre choisi vaut sur les deux sites.
 * modrinth : noms de catégories (l'un ou l'autre suffit) ; curseforge : numéro de la catégorie (classe du contenu).
 * Plusieurs filtres se cumulent (le projet doit les avoir tous), comme sur les deux sites.
 */
export interface Category {
  key: string
  modrinth: string[]
  curseforge: number
}

export const CATEGORIES: Record<ContentType | 'modpack', Category[]> = {
  mod: [
    { key: 'adventure', modrinth: ['adventure'], curseforge: 422 },
    { key: 'magic', modrinth: ['magic'], curseforge: 419 },
    { key: 'technology', modrinth: ['technology'], curseforge: 412 },
    { key: 'storage', modrinth: ['storage'], curseforge: 420 },
    { key: 'worldgen', modrinth: ['worldgen'], curseforge: 406 },
    { key: 'mobs', modrinth: ['mobs'], curseforge: 411 },
    { key: 'equipment', modrinth: ['equipment'], curseforge: 434 },
    { key: 'food', modrinth: ['food'], curseforge: 436 },
    { key: 'decoration', modrinth: ['decoration'], curseforge: 424 },
    { key: 'transportation', modrinth: ['transportation'], curseforge: 414 },
    { key: 'optimization', modrinth: ['optimization'], curseforge: 6814 },
    { key: 'utility', modrinth: ['utility'], curseforge: 5191 },
    { key: 'library', modrinth: ['library'], curseforge: 421 }
  ],
  modpack: [
    { key: 'adventure', modrinth: ['adventure'], curseforge: 4475 },
    { key: 'magic', modrinth: ['magic'], curseforge: 4473 },
    { key: 'technology', modrinth: ['technology'], curseforge: 4472 },
    { key: 'quests', modrinth: ['quests'], curseforge: 4478 },
    { key: 'combat', modrinth: ['combat'], curseforge: 4483 },
    { key: 'challenging', modrinth: ['challenging'], curseforge: 4479 },
    { key: 'multiplayer', modrinth: ['multiplayer'], curseforge: 4484 },
    { key: 'lightweight', modrinth: ['lightweight'], curseforge: 4481 },
    { key: 'kitchenSink', modrinth: ['kitchen-sink'], curseforge: 4482 }
  ],
  resourcepack: [
    { key: 'res16', modrinth: ['16x'], curseforge: 393 },
    { key: 'res32', modrinth: ['32x'], curseforge: 394 },
    { key: 'res64', modrinth: ['64x'], curseforge: 395 },
    { key: 'res128', modrinth: ['128x', '256x', '512x+'], curseforge: 396 },
    { key: 'realistic', modrinth: ['realistic'], curseforge: 400 },
    { key: 'vanillaLike', modrinth: ['vanilla-like'], curseforge: 403 },
    { key: 'fonts', modrinth: ['fonts'], curseforge: 5244 },
    { key: 'modSupport', modrinth: ['modded'], curseforge: 4465 }
  ],
  shader: [
    { key: 'realistic', modrinth: ['realistic', 'semi-realistic'], curseforge: 6553 },
    { key: 'fantasy', modrinth: ['fantasy', 'cartoon'], curseforge: 6554 },
    { key: 'vanillaLike', modrinth: ['vanilla-like'], curseforge: 6555 }
  ],
  datapack: [
    { key: 'adventure', modrinth: ['adventure'], curseforge: 6948 },
    { key: 'magic', modrinth: ['magic'], curseforge: 6952 },
    { key: 'technology', modrinth: ['technology'], curseforge: 6951 },
    { key: 'utility', modrinth: ['utility'], curseforge: 6953 },
    { key: 'library', modrinth: ['library'], curseforge: 6950 }
  ]
}

/** Nombre de résultats par page proposé (CurseForge n'en donne pas plus de 50 d'un coup) */
export const PAGE_SIZES = [10, 20, 50] as const
