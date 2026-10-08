import { useEffect, useRef } from 'react'
import { IdleAnimation, SkinViewer as Viewer } from 'skinview3d'

interface Props {
  uuid: string
}

/**
 * Skin du joueur en 3D (skinview3d) : il respire, tourne doucement, et se fait pivoter à la souris.
 * Le skin vient du profil Mojang (via le processus principal) ; rien ne s'affiche s'il est introuvable.
 */
export default function SkinViewer({ uuid }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvas.current) return
    const viewer = new Viewer({
      canvas: canvas.current,
      width: 240,
      height: 330
    })
    viewer.animation = new IdleAnimation()
    viewer.autoRotate = true
    viewer.autoRotateSpeed = 0.6
    viewer.controls.enableZoom = false
    viewer.controls.enablePan = false
    viewer.zoom = 0.85
    viewer.fov = 45
    // Légère vue de trois quarts au départ
    viewer.playerObject.rotation.y = 0.5
    canvas.current.style.opacity = '0'

    let alive = true
    window.aloria.accounts.skin(uuid).then(async (skin) => {
      if (!alive || !skin) return
      await viewer.loadSkin(skin.texture, {
        model: skin.slim ? 'slim' : 'default'
      })
      if (skin.cape) await viewer.loadCape(skin.cape)
      if (alive && canvas.current) canvas.current.style.opacity = '1'
    })

    // La rotation automatique s'arrête quand on fait pivoter le perso, et reprend après
    let resume: ReturnType<typeof setTimeout> | undefined
    const grab = () => {
      viewer.autoRotate = false
      clearTimeout(resume)
    }
    const release = () => {
      resume = setTimeout(() => (viewer.autoRotate = true), 2500)
    }
    viewer.controls.addEventListener('start', grab)
    viewer.controls.addEventListener('end', release)

    return () => {
      alive = false
      clearTimeout(resume)
      viewer.dispose()
    }
  }, [uuid])

  return (
    <div className="skin-viewer">
      <canvas ref={canvas} />
    </div>
  )
}
