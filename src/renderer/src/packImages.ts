import type { PackElement, PackInfo, PackVanilla } from '../../shared/types'

/**
 * Images des packs « Créations », dans un format commun à toutes les versions :
 * viseur 15×15, hotbar 182×22, case sélectionnée 24×24, totem 16×16.
 * Conversion vers la version du profil : une image par élément (1.20.2+) ou planches icons.png / widgets.png recomposées.
 */
export const SIZES: Record<PackElement, [number, number]> = {
  crosshair: [15, 15],
  hotbar: [182, 22],
  hotbar_selection: [24, 24],
  totem: [16, 16],
  heart_full: [9, 9],
  heart_half: [9, 9],
  armor_full: [9, 9],
  armor_half: [9, 9],
  food_full: [9, 9],
  food_half: [9, 9]
}

/** Icônes de la barre de vie : place dans icons.png (jusqu'à la 1.20.1) et chemin du sprite (1.20.2+) */
const HUD_ICONS: Record<string, { x: number; y: number; sprite: string }> = {
  heart_full: { x: 52, y: 0, sprite: 'heart/full' },
  heart_half: { x: 61, y: 0, sprite: 'heart/half' },
  heart_container: { x: 16, y: 0, sprite: 'heart/container' },
  armor_full: { x: 34, y: 9, sprite: 'armor_full' },
  armor_half: { x: 25, y: 9, sprite: 'armor_half' },
  armor_empty: { x: 16, y: 9, sprite: 'armor_empty' },
  food_full: { x: 52, y: 27, sprite: 'food_full' },
  food_half: { x: 61, y: 27, sprite: 'food_half' },
  food_empty: { x: 16, y: 27, sprite: 'food_empty' }
}

/** Images d'origine : éléments modifiables + fonds des icônes de vie (pour l'aperçu) */
export type BaseImages = Partial<Record<string, string>>

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

/** Image redimensionnée sans flou (import d'une image de taille quelconque) */
export async function resize(src: string, w: number, h: number): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(w, h)
  g.drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/png')
}

/** Images d'origine de la version, au format commun (pour l'aperçu et comme point de départ) */
export async function vanillaElements(v: PackVanilla): Promise<BaseImages> {
  const out: BaseImages = {}
  if (v.layout === 'sprites') {
    if (v.images.crosshair) out.crosshair = v.images.crosshair
    if (v.images.hotbar) out.hotbar = v.images.hotbar
    // 24×23 depuis la 1.20.2 : une ligne vide en bas pour revenir au format commun 24×24
    if (v.images.hotbar_selection) out.hotbar_selection = await crop(v.images.hotbar_selection, 0, 0, 24, 23, 24, 24)
    for (const key of Object.keys(HUD_ICONS)) {
      const img = v.images[key]
      if (img) out[key] = img
    }
  } else {
    if (v.atlases.icons) {
      out.crosshair = await crop(v.atlases.icons, 0, 0, 15, 15)
      for (const [key, p] of Object.entries(HUD_ICONS)) out[key] = await crop(v.atlases.icons, p.x, p.y, 9, 9)
    }
    if (v.atlases.widgets) {
      out.hotbar = await crop(v.atlases.widgets, 0, 0, 182, 22)
      out.hotbar_selection = await crop(v.atlases.widgets, 0, 22, 24, 24)
    }
  }
  if (v.images.totem) out.totem = v.images.totem
  return out
}

/** Planche d'origine où l'on remplace des zones par les images du pack */
async function patchAtlas(atlas: string, patches: { image: string; x: number; y: number; w: number; h: number }[]): Promise<string> {
  const img = await loadImage(atlas)
  const [c, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  // Les planches de packs HD sont plus grandes : on garde l'échelle (256 = taille du jeu)
  const k = img.width / 256
  for (const p of patches) {
    g.clearRect(p.x * k, p.y * k, p.w * k, p.h * k)
    g.drawImage(await loadImage(p.image), p.x * k, p.y * k, p.w * k, p.h * k)
  }
  return c.toDataURL('image/png')
}

/** Fichiers du pack pour une version (chemin dans le zip → PNG), seulement pour les éléments modifiés */
export async function packFiles(pack: PackInfo, v: PackVanilla): Promise<Record<string, string>> {
  const img = pack.images
  const files: Record<string, string> = {}
  if (v.layout === 'sprites') {
    if (img.crosshair) files[`${T}gui/sprites/hud/crosshair.png`] = img.crosshair
    if (img.hotbar) files[`${T}gui/sprites/hud/hotbar.png`] = img.hotbar
    if (img.hotbar_selection) files[`${T}gui/sprites/hud/hotbar_selection.png`] = await crop(img.hotbar_selection, 0, 0, 24, 23)
    for (const [key, p] of Object.entries(HUD_ICONS)) {
      const image = img[key as PackElement]
      if (image) files[`${T}gui/sprites/hud/${p.sprite}.png`] = image
    }
  } else {
    // Le jeu dessine le viseur en 16×16 depuis (0, 0) : la colonne et la ligne 16 restent vides
    const icons = [
      ...(img.crosshair ? [{ image: img.crosshair, x: 0, y: 0, w: 15, h: 15 }] : []),
      ...Object.entries(HUD_ICONS)
        .filter(([key]) => img[key as PackElement])
        .map(([key, p]) => ({ image: img[key as PackElement]!, x: p.x, y: p.y, w: 9, h: 9 }))
    ]
    if (icons.length && v.atlases.icons) files[`${T}gui/icons.png`] = await patchAtlas(v.atlases.icons, icons)
    const widgets = [
      ...(img.hotbar ? [{ image: img.hotbar, x: 0, y: 0, w: 182, h: 22 }] : []),
      ...(img.hotbar_selection ? [{ image: img.hotbar_selection, x: 0, y: 22, w: 24, h: 24 }] : [])
    ]
    if (widgets.length && v.atlases.widgets) files[`${T}gui/widgets.png`] = await patchAtlas(v.atlases.widgets, widgets)
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
