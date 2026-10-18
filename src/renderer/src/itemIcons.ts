import { useEffect, useState } from 'react'
import type { GameData, ItemIcon, ModelFace } from '../../shared/types'

/**
 * Icônes des items, dessinées ici à partir des modèles et textures du jeu (lus dans le jar par le processus principal) :
 * les blocs en 3D isométrique comme dans l'inventaire (rotation « gui » du modèle), les autres items à plat.
 * Dessinées une fois par version, petit à petit pour ne pas figer l'interface.
 */
const SIZE = 64
type Vec = [number, number, number]

const cache = new Map<string, { icons: Map<string, string>; done: boolean; listeners: Set<() => void> }>()
const dataCache = new Map<string, Promise<GameData>>()

/** Données d'une version (items, tags, recettes) et leurs icônes, qui arrivent au fur et à mesure */
export function useGameData(gameVersion: string | null, onError: (message: string) => void) {
  const [data, setData] = useState<GameData | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    setData(null)
    if (!gameVersion) return
    let alive = true
    if (!dataCache.has(gameVersion)) {
      dataCache.set(
        gameVersion,
        window.aloria.datapacks.gameData(gameVersion).then((res) => {
          if (!res.ok) {
            dataCache.delete(gameVersion)
            throw new Error(res.error)
          }
          return res.value
        })
      )
    }
    dataCache
      .get(gameVersion)!
      .then((value) => {
        if (!alive) return
        setData(value)
        const entry = renderAll(value)
        const listener = () => setTick((n) => n + 1)
        entry.listeners.add(listener)
        setTick((n) => n + 1)
        cleanup = () => entry.listeners.delete(listener)
      })
      .catch((err: Error) => alive && onError(err.message))
    let cleanup = () => {}
    return () => {
      alive = false
      cleanup()
    }
  }, [gameVersion, onError])

  const entry = gameVersion ? cache.get(gameVersion) : undefined
  return { data, icons: entry?.icons ?? new Map<string, string>(), iconsReady: !!entry?.done }
}

function renderAll(data: GameData) {
  let entry = cache.get(data.gameVersion)
  if (entry) return entry
  entry = { icons: new Map(), done: false, listeners: new Set() }
  cache.set(data.gameVersion, entry)
  const e = entry
  const images = new Map<string, HTMLImageElement>()
  const load = (path: string) =>
    new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        images.set(path, img)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = data.textures[path]
    })

  ;(async () => {
    await Promise.all(Object.keys(data.textures).map(load))
    const painter = new Painter(images)
    for (let i = 0; i < data.items.length; i += 40) {
      for (const item of data.items.slice(i, i + 40)) e.icons.set(item.id, painter.paint(item.icon))
      e.listeners.forEach((l) => l())
      await new Promise((r) => setTimeout(r, 0))
    }
    e.done = true
    e.listeners.forEach((l) => l())
  })()
  return e
}

// ---------------------------------------------------------------- dessin

/** Coins (haut-gauche, haut-droit, bas-gauche) de chaque face vue de l'extérieur, et UV par défaut */
const FACES: Record<ModelFace, { corners: (f: Vec, t: Vec) => [Vec, Vec, Vec]; uv: (f: Vec, t: Vec) => number[] }> = {
  north: {
    corners: (f, t) => [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]]],
    uv: (f, t) => [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]]
  },
  south: {
    corners: (f, t) => [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]]],
    uv: (f, t) => [f[0], 16 - t[1], t[0], 16 - f[1]]
  },
  east: {
    corners: (f, t) => [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]]],
    uv: (f, t) => [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]]
  },
  west: {
    corners: (f, t) => [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]]],
    uv: (f, t) => [f[2], 16 - t[1], t[2], 16 - f[1]]
  },
  up: {
    corners: (f, t) => [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]]],
    uv: (f, t) => [f[0], f[2], t[0], t[2]]
  },
  down: {
    corners: (f, t) => [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]]],
    uv: (f, t) => [f[0], 16 - t[2], t[0], 16 - f[2]]
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180

function rotate(p: Vec, axis: 'x' | 'y' | 'z', angle: number): Vec {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const [x, y, z] = p
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c]
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c]
  return [x * c - y * s, x * s + y * c, z]
}

class Painter {
  private tinted = new Map<string, HTMLCanvasElement>()
  constructor(private images: Map<string, HTMLImageElement>) {}

  /** Première image de la texture (les textures animées sont une bande verticale), multipliée par une couleur */
  private texture(path: string, color: string): HTMLCanvasElement | null {
    const key = `${path}|${color}`
    const hit = this.tinted.get(key)
    if (hit) return hit
    const img = this.images.get(path)
    if (!img) return null
    const s = img.width
    const c = document.createElement('canvas')
    c.width = s
    c.height = s
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, s, s, 0, 0, s, s)
    if (color !== '#ffffff') {
      g.globalCompositeOperation = 'multiply'
      g.fillStyle = color
      g.fillRect(0, 0, s, s)
      g.globalCompositeOperation = 'destination-in'
      g.drawImage(img, 0, 0, s, s, 0, 0, s, s)
    }
    this.tinted.set(key, c)
    return c
  }

  paint(icon: ItemIcon): string {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const g = canvas.getContext('2d')!
    g.imageSmoothingEnabled = false
    if (icon.kind === 'flat') {
      for (const layer of icon.layers) {
        const tex = this.texture(layer.tex, layer.tint ?? '#ffffff')
        if (tex) g.drawImage(tex, 0, 0, SIZE, SIZE)
      }
    } else if (icon.kind === 'model') this.model(g, icon)
    return canvas.toDataURL()
  }

  private model(g: CanvasRenderingContext2D, icon: Extract<ItemIcon, { kind: 'model' }>) {
    const [rx, ry, rz] = icon.gui.rotation.map(rad)
    const [sx, sy, sz] = icon.gui.scale
    const [tx, ty, tz] = icon.gui.translation
    const k = SIZE / 16
    const toView = (p: Vec): Vec => {
      let v: Vec = [(p[0] - 8) * sx, (p[1] - 8) * sy, (p[2] - 8) * sz]
      v = rotate(rotate(rotate(v, 'z', rz), 'y', ry), 'x', rx)
      return [v[0] + tx, v[1] + ty, v[2] + tz]
    }
    const screen = (v: Vec) => [SIZE / 2 + v[0] * k, SIZE / 2 - v[1] * k]

    const quads: { depth: number; draw: () => void }[] = []
    for (const el of icon.elements) {
      const f = el.from as Vec
      const t = el.to as Vec
      const elRot = (p: Vec): Vec => {
        if (!el.rotation || !el.rotation.angle) return p
        const o = el.rotation.origin
        const r = rotate([p[0] - o[0], p[1] - o[1], p[2] - o[2]], el.rotation.axis, rad(el.rotation.angle))
        return [r[0] + o[0], r[1] + o[1], r[2] + o[2]]
      }
      for (const [dir, face] of Object.entries(el.faces) as [ModelFace, NonNullable<(typeof el.faces)[ModelFace]>][]) {
        const spec = FACES[dir]
        const [tl, tr, bl] = spec.corners(f, t).map((p) => toView(elRot(p)))
        const br: Vec = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1], tr[2] + bl[2] - tl[2]]
        const [a, b, c, d] = [tl, tr, br, bl].map(screen)
        // Face tournée vers nous : de haut-gauche à haut-droit puis bas-gauche, on tourne dans le sens des aiguilles
        if ((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) <= 0.0001) continue
        // Lumière de l'inventaire : dessus clair, côté gauche un peu plus sombre, côté droit encore plus
        const n = [tr, bl].map((p) => [p[0] - tl[0], p[1] - tl[1], p[2] - tl[2]])
        const nx = n[1][1] * n[0][2] - n[1][2] * n[0][1]
        const ny = n[1][2] * n[0][0] - n[1][0] * n[0][2]
        const len = Math.hypot(nx, ny, n[1][0] * n[0][1] - n[1][1] * n[0][0]) || 1
        const light = el.shade === false ? 1 : Math.max(0.35, Math.min(1, 0.75 + 0.25 * (ny / len) - 0.12 * Math.sign(Math.round((nx / len) * 100))))
        const tint = face.tint ?? '#ffffff'
        const color = '#' + [1, 3, 5].map((i) => Math.round(parseInt(tint.slice(i, i + 2), 16) * light).toString(16).padStart(2, '0')).join('')
        const uv = face.uv ?? spec.uv(f, t)
        const corners = [a, b, c, d]
        const turn = (((face.rotation ?? 0) / 90) % 4 + 4) % 4
        const depth = (tl[2] + br[2]) / 2
        quads.push({
          depth,
          draw: () => {
            const tex = this.texture(face.tex, color)
            if (!tex) return
            const p0 = corners[turn]
            const p1 = corners[(turn + 1) % 4]
            const p3 = corners[(turn + 3) % 4]
            const s = tex.width / 16
            g.save()
            g.beginPath()
            g.moveTo(a[0], a[1])
            g.lineTo(b[0], b[1])
            g.lineTo(c[0], c[1])
            g.lineTo(d[0], d[1])
            g.closePath()
            g.clip()
            g.setTransform(p1[0] - p0[0], p1[1] - p0[1], p3[0] - p0[0], p3[1] - p0[1], p0[0], p0[1])
            // UV inversées (u1 > u2) : la texture est retournée
            const [u1, v1, u2, v2] = uv
            g.transform(u1 > u2 ? -1 : 1, 0, 0, v1 > v2 ? -1 : 1, u1 > u2 ? 1 : 0, v1 > v2 ? 1 : 0)
            const w = Math.max(Math.abs(u2 - u1), 0.01) * s
            const h = Math.max(Math.abs(v2 - v1), 0.01) * s
            // Un peu plus grand que la face : pas de fines lignes claires entre deux faces voisines
            g.drawImage(tex, Math.min(u1, u2) * s, Math.min(v1, v2) * s, w, h, -0.02, -0.02, 1.04, 1.04)
            g.restore()
          }
        })
      }
    }
    quads.sort((x, y) => x.depth - y.depth).forEach((q) => q.draw())
  }
}
