import type { PackElement, PackInfo, PackVanilla } from '../../shared/types'

/**
 * Images des packs « Créations », dans un format commun à toutes les versions, à la résolution du pack
 * (×1 = celle du jeu, ×2, ×4 : tailles ci-dessous multipliées) : viseur 15×15, hotbar 182×22, case sélectionnée 24×24,
 * totem 16×16, icônes de vie 9×9, barre d'XP 182×5.
 * Conversion vers la version du profil : une image par élément (1.20.2+) ou planches icons.png / widgets.png recomposées
 * (agrandies si le pack est en haute résolution : le jeu accepte des planches plus grandes que 256×256).
 */
export const SIZES: Record<PackElement, [number, number]> = {
  crosshair: [15, 15],
  hotbar: [182, 22],
  hotbar_selection: [24, 24],
  totem: [16, 16],
  heart_full: [9, 9],
  heart_half: [9, 9],
  heart_container: [9, 9],
  armor_full: [9, 9],
  armor_half: [9, 9],
  armor_empty: [9, 9],
  food_full: [9, 9],
  food_half: [9, 9],
  food_empty: [9, 9],
  xp_background: [182, 5],
  xp_progress: [182, 5]
}

/** Taille d'un élément à la résolution du pack */
export const sizeOf = (el: PackElement, scale: number): [number, number] => [SIZES[el][0] * scale, SIZES[el][1] * scale]

/** Éléments de icons.png (jusqu'à la 1.20.1) : place dans la planche, et chemin du sprite (1.20.2+) */
const ICONS: Partial<Record<PackElement, { x: number; y: number; sprite: string }>> = {
  heart_full: { x: 52, y: 0, sprite: 'heart/full' },
  heart_half: { x: 61, y: 0, sprite: 'heart/half' },
  heart_container: { x: 16, y: 0, sprite: 'heart/container' },
  armor_full: { x: 34, y: 9, sprite: 'armor_full' },
  armor_half: { x: 25, y: 9, sprite: 'armor_half' },
  armor_empty: { x: 16, y: 9, sprite: 'armor_empty' },
  food_full: { x: 52, y: 27, sprite: 'food_full' },
  food_half: { x: 61, y: 27, sprite: 'food_half' },
  food_empty: { x: 16, y: 27, sprite: 'food_empty' },
  xp_background: { x: 0, y: 64, sprite: 'experience_bar_background' },
  xp_progress: { x: 0, y: 69, sprite: 'experience_bar_progress' }
}

/** Images d'origine au format commun */
export type BaseImages = Partial<Record<PackElement, string>>

const T = 'assets/minecraft/textures/'

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image illisible'))
    img.src = src
  })
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  return [c, g]
}

/** Morceau d'une image, en data URL PNG de la taille demandée (pixels nets) */
export async function crop(src: string, x: number, y: number, w: number, h: number, outW = w, outH = h): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(outW, outH)
  g.drawImage(img, x, y, w, h, 0, 0, w, h)
  return c.toDataURL('image/png')
}

/** Image redimensionnée sans flou (import, changement de résolution) */
export async function resize(src: string, w: number, h: number): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(w, h)
  g.drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/png')
}

/** Images d'origine de la version, au format commun et à la résolution du pack */
export async function vanillaElements(v: PackVanilla, scale: number): Promise<BaseImages> {
  const x1: BaseImages = {}
  if (v.layout === 'sprites') {
    if (v.images.crosshair) x1.crosshair = v.images.crosshair
    if (v.images.hotbar) x1.hotbar = v.images.hotbar
    // 24×23 depuis la 1.20.2 : une ligne vide en bas pour revenir au format commun 24×24
    if (v.images.hotbar_selection) x1.hotbar_selection = await crop(v.images.hotbar_selection, 0, 0, 24, 23, 24, 24)
    for (const key of Object.keys(ICONS) as PackElement[]) {
      const img = v.images[key]
      if (img) x1[key] = img
    }
  } else {
    if (v.atlases.icons) {
      x1.crosshair = await crop(v.atlases.icons, 0, 0, 15, 15)
      for (const [key, p] of Object.entries(ICONS) as [PackElement, { x: number; y: number }][]) {
        const [w, h] = SIZES[key]
        x1[key] = await crop(v.atlases.icons, p.x, p.y, w, h)
      }
    }
    if (v.atlases.widgets) {
      x1.hotbar = await crop(v.atlases.widgets, 0, 0, 182, 22)
      x1.hotbar_selection = await crop(v.atlases.widgets, 0, 22, 24, 24)
    }
  }
  if (v.images.totem) x1.totem = v.images.totem
  if (scale === 1) return x1
  const out: BaseImages = {}
  for (const [key, img] of Object.entries(x1) as [PackElement, string][]) {
    const [w, h] = sizeOf(key, scale)
    out[key] = await resize(img, w, h)
  }
  return out
}

/**
 * Planche d'origine (taille du jeu, 256 de large) agrandie à la résolution du pack, où l'on remplace des zones
 * par les images du pack (positions et tailles données à la taille du jeu)
 */
async function patchAtlas(
  atlas: string,
  scale: number,
  patches: { image: string; x: number; y: number; w: number; h: number }[]
): Promise<string> {
  const img = await loadImage(atlas)
  // Planche d'un pack déjà HD (rare) : on garde sa propre échelle si elle est plus grande
  const k = Math.max(scale, img.width / 256)
  const [c, g] = canvas(256 * k, (img.height / img.width) * 256 * k)
  g.drawImage(img, 0, 0, c.width, c.height)
  for (const p of patches) {
    g.clearRect(p.x * k, p.y * k, p.w * k, p.h * k)
    g.drawImage(await loadImage(p.image), p.x * k, p.y * k, p.w * k, p.h * k)
  }
  return c.toDataURL('image/png')
}

/** Fichiers du pack pour une version (chemin dans le zip → PNG), seulement pour les éléments modifiés */
export async function packFiles(pack: PackInfo, v: PackVanilla): Promise<Record<string, string>> {
  const img = pack.images
  const s = pack.scale ?? 1
  const files: Record<string, string> = {}
  if (v.layout === 'sprites') {
    if (img.crosshair) files[`${T}gui/sprites/hud/crosshair.png`] = img.crosshair
    if (img.hotbar) files[`${T}gui/sprites/hud/hotbar.png`] = img.hotbar
    if (img.hotbar_selection) files[`${T}gui/sprites/hud/hotbar_selection.png`] = await crop(img.hotbar_selection, 0, 0, 24 * s, 23 * s)
    for (const [key, p] of Object.entries(ICONS) as [PackElement, { sprite: string }][]) {
      const image = img[key]
      if (image) files[`${T}gui/sprites/hud/${p.sprite}.png`] = image
    }
  } else {
    // Le jeu dessine le viseur en 16×16 depuis (0, 0) : la colonne et la ligne 16 restent vides
    const icons = [
      ...(img.crosshair ? [{ image: img.crosshair, x: 0, y: 0, w: 15, h: 15 }] : []),
      ...(Object.entries(ICONS) as [PackElement, { x: number; y: number }][])
        .filter(([key]) => img[key])
        .map(([key, p]) => ({ image: img[key]!, x: p.x, y: p.y, w: SIZES[key][0], h: SIZES[key][1] }))
    ]
    if (icons.length && v.atlases.icons) files[`${T}gui/icons.png`] = await patchAtlas(v.atlases.icons, s, icons)
    const widgets = [
      ...(img.hotbar ? [{ image: img.hotbar, x: 0, y: 0, w: 182, h: 22 }] : []),
      ...(img.hotbar_selection ? [{ image: img.hotbar_selection, x: 0, y: 22, w: 24, h: 24 }] : [])
    ]
    if (widgets.length && v.atlases.widgets) files[`${T}gui/widgets.png`] = await patchAtlas(v.atlases.widgets, s, widgets)
  }
  if (img.totem && v.totemPath) files[v.totemPath] = img.totem
  return files
}

/** Icône du pack (pack.png) : le viseur sur un fond turquoise, comme une petite vignette */
export async function packIcon(pack: PackInfo, vanilla: BaseImages): Promise<string> {
  const [c, g] = canvas(64, 64)
  const grad = g.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, '#5cc8e0')
  grad.addColorStop(1, '#0b5f86')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const cross = pack.images.crosshair ?? vanilla.crosshair
  if (cross) g.drawImage(await loadImage(cross), 2, 2, 60, 60)
  return c.toDataURL('image/png')
}
