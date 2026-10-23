import { useEffect, useRef, useState } from 'react'
import { IdleAnimation, SkinViewer as Viewer } from 'skinview3d'
import type { PlayerSkin } from '../../../shared/types'
import { buildHat } from '../cosmetics'

interface Props {
  /** Skin du compte (profil Mojang) : rechargé quand il change (événement « aloria:skin-changed ») */
  uuid?: string
  /** Ou un skin donné directement (aperçu avant de l'envoyer) */
  skin?: PlayerSkin | null
  width?: number
  height?: number
  onClick?: () => void
  /** Cape d'Aloria à montrer à la place de celle du compte (texture ; null = aucune ; absent = cape Mojang) */
  cape?: string | null
  /** Chapeau d'Aloria sur la tête (id du cosmétique) */
  hat?: string | null
}

/** Prévient les vues 3D qu'un skin vient de changer (sans attendre le profil public de Mojang, qui met un moment) */
export function announceSkin(uuid: string, skin: PlayerSkin | null): void {
  window.dispatchEvent(new CustomEvent('aloria:skin-changed', { detail: { uuid, skin } }))
}

/** Tête du skin à plat (visage + couche du chapeau), pixels nets */
async function drawFlatHead(canvas: HTMLCanvasElement, texture: string): Promise<void> {
  const img = new Image()
  img.src = texture
  await img.decode()
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const size = Math.floor(Math.min(canvas.width, canvas.height) * 0.6)
  const x = (canvas.width - size) / 2
  const y = (canvas.height - size) / 2
  ctx.drawImage(img, 8, 8, 8, 8, x, y, size, size)
  ctx.drawImage(img, 40, 8, 8, 8, x, y, size, size)
}

/**
 * Skin en 3D (skinview3d) : il respire, tourne doucement, et se fait pivoter à la souris.
 * Rien ne s'affiche tant que le skin n'est pas chargé. Sans WebGL (pilote refusé par Chromium, machine
 * virtuelle…), la tête du skin à plat : sinon l'erreur emportait toute l'interface (écran blanc).
 */
export default function SkinViewer({ uuid, skin, width = 240, height = 330, onClick, cape, hat }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const flatCanvas = useRef<HTMLCanvasElement>(null)
  const [flat, setFlat] = useState(false)
  const lastSkin = useRef<PlayerSkin | null>(null)
  const cosmetics = useRef({ cape, hat })
  cosmetics.current = { cape, hat }

  /** Cape (celle d'Aloria choisie, sinon celle du compte) et chapeau */
  const dress = async (v: Viewer) => {
    const { cape: aloriaCape, hat: hatId } = cosmetics.current
    const capeTexture = aloriaCape !== undefined ? aloriaCape : lastSkin.current?.cape
    if (capeTexture) await v.loadCape(capeTexture)
    else v.resetCape()
    const head = v.playerObject.skin.head
    head.getObjectByName('aloria-hat')?.removeFromParent()
    const model = hatId ? buildHat(hatId) : null
    if (model) head.add(model)
    // Un chapeau dépasse de la tête : un peu plus de recul pour qu'il reste dans le cadre
    v.zoom = model ? 0.72 : 0.85
  }

  const show = async (s: PlayerSkin | null) => {
    lastSkin.current = s
    if (flatCanvas.current && s) return drawFlatHead(flatCanvas.current, s.texture).catch(() => {})
    const v = viewer.current
    if (!v || !s) return
    await v.loadSkin(s.texture, { model: s.slim ? 'slim' : 'default' })
    await dress(v)
    if (canvas.current) canvas.current.style.opacity = '1'
  }

  useEffect(() => {
    if (!canvas.current || flat) return
    let v: Viewer
    try {
      v = new Viewer({ canvas: canvas.current, width, height })
    } catch (err) {
      console.warn('[skin] 3D indisponible, tête à plat', err)
      setFlat(true)
      return
    }
    viewer.current = v
    v.animation = new IdleAnimation()
    v.autoRotate = true
    v.autoRotateSpeed = 0.6
    v.controls.enableZoom = false
    v.controls.enablePan = false
    v.zoom = 0.85
    v.fov = 45
    // Légère vue de trois quarts au départ
    v.playerObject.rotation.y = 0.5
    canvas.current.style.opacity = '0'

    // La rotation automatique s'arrête quand on fait pivoter le perso, et reprend après
    let resume: ReturnType<typeof setTimeout> | undefined
    const grab = () => {
      v.autoRotate = false
      clearTimeout(resume)
    }
    const release = () => {
      resume = setTimeout(() => (v.autoRotate = true), 2500)
    }
    v.controls.addEventListener('start', grab)
    v.controls.addEventListener('end', release)

    return () => {
      clearTimeout(resume)
      viewer.current = null
      v.dispose()
    }
  }, [width, height, flat])

  // Passage à plat : le skin déjà reçu s'affiche tout de suite
  useEffect(() => {
    if (flat) show(lastSkin.current)
  }, [flat])

  // Cosmétiques essayés ou équipés
  useEffect(() => {
    if (viewer.current && lastSkin.current) dress(viewer.current)
  }, [cape, hat])

  // Skin donné directement
  useEffect(() => {
    if (skin !== undefined) show(skin)
  }, [skin])

  // Skin du compte, puis ses changements
  useEffect(() => {
    if (!uuid || skin !== undefined) return
    let alive = true
    window.aloria.accounts.skin(uuid).then((s) => {
      if (alive) show(s)
    })
    const changed = (e: Event) => {
      const detail = (e as CustomEvent<{ uuid: string; skin: PlayerSkin | null }>).detail
      if (detail.uuid === uuid) show(detail.skin)
    }
    window.addEventListener('aloria:skin-changed', changed)
    return () => {
      alive = false
      window.removeEventListener('aloria:skin-changed', changed)
    }
  }, [uuid, skin === undefined])

  return (
    <div className={`skin-viewer ${onClick ? 'clickable' : ''}`} style={{ width, height }} onDoubleClick={onClick}>
      {flat ? <canvas ref={flatCanvas} width={width} height={height} /> : <canvas ref={canvas} />}
    </div>
  )
}
