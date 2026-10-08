import { useEffect, useRef } from 'react'
import { IdleAnimation, SkinViewer as Viewer } from 'skinview3d'
import type { PlayerSkin } from '../../../shared/types'

interface Props {
  /** Skin du compte (profil Mojang) : rechargé quand il change (événement « aloria:skin-changed ») */
  uuid?: string
  /** Ou un skin donné directement (aperçu avant de l'envoyer) */
  skin?: PlayerSkin | null
  width?: number
  height?: number
  onClick?: () => void
}

/** Prévient les vues 3D qu'un skin vient de changer (sans attendre le profil public de Mojang, qui met un moment) */
export function announceSkin(uuid: string, skin: PlayerSkin | null): void {
  window.dispatchEvent(new CustomEvent('aloria:skin-changed', { detail: { uuid, skin } }))
}

/**
 * Skin en 3D (skinview3d) : il respire, tourne doucement, et se fait pivoter à la souris.
 * Rien ne s'affiche tant que le skin n'est pas chargé.
 */
export default function SkinViewer({ uuid, skin, width = 240, height = 330, onClick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<Viewer | null>(null)

  const show = async (s: PlayerSkin | null) => {
    const v = viewer.current
    if (!v || !s) return
    await v.loadSkin(s.texture, { model: s.slim ? 'slim' : 'default' })
    if (s.cape) await v.loadCape(s.cape)
    else v.resetCape()
    if (canvas.current) canvas.current.style.opacity = '1'
  }

  useEffect(() => {
    if (!canvas.current) return
    const v = new Viewer({ canvas: canvas.current, width, height })
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
  }, [width, height])

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
      <canvas ref={canvas} />
    </div>
  )
}
