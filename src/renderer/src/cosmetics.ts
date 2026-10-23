import { BoxGeometry, FrontSide, Group, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, TextureLoader } from 'three'
import aloriaCape from './assets/cosmetics/aloria_cape.png'
import pumpkinHat from './assets/cosmetics/pumpkin_hat.png'

/**
 * Dessin des cosmétiques dans l'aperçu 3D (skinview3d). Textures : scripts/cosmetics-textures.mjs (mêmes fichiers
 * qu'Aloria HUD) ; les chapeaux sont des cubes en « box UV » comme les modèles du jeu, posés sur la tête.
 */
export const COSMETIC_TEXTURES: Record<string, string> = {
  aloria_cape: aloriaCape,
  pumpkin_hat: pumpkinHat
}

/** Emoji de la carte d'un cosmétique sans aperçu à plat */
export const COSMETIC_ICONS: Record<string, string> = { pumpkin_hat: '🎃', aloria_cape: '🌊' }

/** Coordonnées de texture d'un cube au format des modèles Minecraft (même ordre de faces que skinview3d) */
function boxUV(box: BoxGeometry, u: number, v: number, w: number, h: number, d: number, tw = 64, th = 32): void {
  const face = (x1: number, y1: number, x2: number, y2: number) => [
    [x1 / tw, 1 - y2 / th],
    [x2 / tw, 1 - y2 / th],
    [x2 / tw, 1 - y1 / th],
    [x1 / tw, 1 - y1 / th]
  ]
  const top = face(u + d, v, u + w + d, v + d)
  const bottom = face(u + w + d, v, u + w * 2 + d, v + d)
  const left = face(u, v + d, u + d, v + d + h)
  const front = face(u + d, v + d, u + w + d, v + d + h)
  const right = face(u + w + d, v + d, u + w + d * 2, v + h + d)
  const back = face(u + w + d * 2, v + d, u + w * 2 + d * 2, v + h + d)
  const order = (f: number[][]) => [f[3], f[2], f[0], f[1]]
  const faces = [order(right), order(left), order(top), [bottom[0], bottom[1], bottom[3], bottom[2]], order(front), order(back)]
  box.attributes.uv.array.set(faces.flat(2))
  box.attributes.uv.needsUpdate = true
}

/** Cubes des chapeaux : [u, v, largeur, hauteur, profondeur, y du centre] (repère de la tête : dessus du crâne à y = 8) */
const HATS: Record<string, [number, number, number, number, number, number][]> = {
  pumpkin_hat: [
    [0, 0, 10, 6, 10, 11],
    [0, 16, 2, 3, 2, 15.5]
  ]
}

export const isHat = (id: string) => id in HATS

/** Chapeau prêt à ajouter à la tête du joueur (playerObject.skin.head) */
export function buildHat(id: string): Group | null {
  const cubes = HATS[id]
  if (!cubes) return null
  const texture = new TextureLoader().load(COSMETIC_TEXTURES[id])
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  const material = new MeshStandardMaterial({ map: texture, side: FrontSide, transparent: true, alphaTest: 1e-5 })
  const group = new Group()
  group.name = 'aloria-hat'
  for (const [u, v, w, h, d, y] of cubes) {
    const box = new BoxGeometry(w, h, d)
    boxUV(box, u, v, w, h, d)
    const mesh = new Mesh(box, material)
    mesh.position.y = y
    group.add(mesh)
  }
  return group
}
