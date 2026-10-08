import { useEffect, useRef, useState } from 'react'
import SkinViewer, { announceSkin } from './SkinViewer'
import { canvas, loadImage } from '../packImages'
import type { CapeInfo, PlayerSkin, SavedSkin } from '../../../shared/types'

interface Props {
  uuid: string
  onClose: () => void
  onError: (message: string) => void
}

/** Tête de face (visage + couche du chapeau) d'une texture de skin, pour les vignettes */
function useHead(texture: string): string | null {
  const [head, setHead] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadImage(texture).then((img) => {
      const [c, g] = canvas(8, 8)
      g.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8)
      g.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8)
      if (alive) setHead(c.toDataURL('image/png'))
    })
    return () => {
      alive = false
    }
  }, [texture])
  return head
}

function Head({ texture }: { texture: string }) {
  const head = useHead(texture)
  return head ? <img className="pixel" src={head} alt="" /> : <span />
}

/** Dos de la cape (zone 10×16 de sa texture), pour les vignettes */
function CapeThumb({ texture }: { texture: string }) {
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    loadImage(texture).then((im) => {
      // Les capes HD gardent les mêmes proportions (64 × 32 de base)
      const k = im.width / 64
      const [c, g] = canvas(10, 16)
      g.drawImage(im, 1 * k, 1 * k, 10 * k, 16 * k, 0, 0, 10, 16)
      setImg(c.toDataURL('image/png'))
    })
  }, [texture])
  return img ? <img className="pixel" src={img} alt="" /> : <span />
}

/**
 * « Mon skin » : aperçu 3D, import d'un PNG (64 × 64 ou 64 × 32), modèle classique ou bras fins, skins enregistrés,
 * cape portée. Le changement est envoyé à Minecraft (comme sur minecraft.net) : il vaut en jeu, sur tous les launchers.
 */
export default function SkinDialog({ uuid, onClose, onError }: Props) {
  const [current, setCurrent] = useState<PlayerSkin | null>(null)
  const [preview, setPreview] = useState<{ texture: string; slim: boolean; name: string } | null>(null)
  const [saved, setSaved] = useState<SavedSkin[]>([])
  const [capes, setCapes] = useState<CapeInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const refreshSaved = () => window.aloria.skins.saved().then((r) => r.ok && setSaved(r.value))

  useEffect(() => {
    window.aloria.accounts.skin(uuid).then(setCurrent)
    refreshSaved()
    window.aloria.skins.capes().then((r) => setCapes(r.ok ? r.value : []))
  }, [uuid])

  const shown: PlayerSkin | null = preview ? { texture: preview.texture, slim: preview.slim, cape: current?.cape ?? null } : current

  const changed = (skin: PlayerSkin | null, text: string) => {
    if (skin) {
      setCurrent(skin)
      announceSkin(uuid, skin)
    }
    setPreview(null)
    setMessage(text)
    refreshSaved()
  }

  const run = async (action: () => Promise<{ ok: true; value: PlayerSkin | null } | { ok: false; error: string }>, text: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await action()
      if (res.ok) changed(res.value, text)
      else onError(res.error)
    } finally {
      setBusy(false)
    }
  }

  const imported = async (f: File | undefined) => {
    if (!f) return
    const url = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.readAsDataURL(f)
    })
    const img = await loadImage(url).catch(() => null)
    if (!img || img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      onError('Un skin Minecraft est une image PNG de 64 × 64 (ou 64 × 32 pour les anciens).')
      return
    }
    setPreview({ texture: url, slim: false, name: f.name.replace(/\.png$/i, '') })
    setMessage(null)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog skin-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Mon skin</h3>
        <div className="skin-dialog__body">
          <div className="skin-dialog__preview">
            <SkinViewer skin={shown} width={220} height={300} />
            {preview && (
              <div className="segmented">
                <button className={!preview.slim ? 'active' : ''} onClick={() => setPreview({ ...preview, slim: false })}>
                  Classique
                </button>
                <button className={preview.slim ? 'active' : ''} onClick={() => setPreview({ ...preview, slim: true })}>
                  Bras fins
                </button>
              </div>
            )}
            {preview ? (
              <div className="skin-dialog__actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(() => window.aloria.skins.upload(preview.texture, preview.slim, preview.name), 'Skin changé ! Il sera visible en jeu à ta prochaine connexion à un serveur.')
                  }
                >
                  {busy ? 'Envoi…' : 'Mettre ce skin'}
                </button>
                <button disabled={busy} onClick={() => setPreview(null)}>
                  Annuler
                </button>
              </div>
            ) : (
              <small className="muted">{current ? (current.slim ? 'Ton skin actuel · bras fins' : 'Ton skin actuel · classique') : 'Chargement…'}</small>
            )}
            {message && <small className="success">✓ {message}</small>}
          </div>

          <div className="skin-dialog__side">
            <div className="skin-dialog__buttons">
              <button className="primary" onClick={() => file.current?.click()}>
                Importer un skin…
              </button>
              <a href="https://namemc.com/minecraft-skins" target="_blank" rel="noreferrer">
                Trouver des skins sur NameMC
              </a>
            </div>
            <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />

            <h4>Mes skins</h4>
            {saved.length === 0 ? (
              <small className="muted">Les skins que tu mets depuis Aloria sont gardés ici, pour y revenir en un clic.</small>
            ) : (
              <div className="skin-grid">
                {saved.map((s) => (
                  <div
                    key={s.id}
                    className={`skin-grid__item ${preview?.texture === s.texture ? 'active' : ''}`}
                    title={s.name}
                    onClick={() => setPreview({ texture: s.texture, slim: s.slim, name: s.name })}
                  >
                    <Head texture={s.texture} />
                    <small>{s.name}</small>
                    <button
                      className="skin-grid__delete"
                      title="Retirer de mes skins"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await window.aloria.skins.removeSaved(s.id)
                        refreshSaved()
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h4>Cape</h4>
            {capes === null ? (
              <small className="muted">Chargement…</small>
            ) : capes.length === 0 ? (
              <small className="muted">Ton compte n'a pas de cape (elles s'obtiennent lors d'événements Minecraft).</small>
            ) : (
              <div className="skin-grid capes">
                <div
                  className={`skin-grid__item ${!capes.some((c) => c.active) ? 'active' : ''}`}
                  onClick={() =>
                    !busy &&
                    run(async () => {
                      const r = await window.aloria.skins.setCape(null)
                      if (r.ok) setCapes(capes.map((c) => ({ ...c, active: false })))
                      return r
                    }, 'Cape retirée.')
                  }
                >
                  <span className="skin-grid__none">∅</span>
                  <small>Aucune</small>
                </div>
                {capes.map((c) => (
                  <div
                    key={c.id}
                    className={`skin-grid__item ${c.active ? 'active' : ''}`}
                    title={c.alias}
                    onClick={() =>
                      !busy &&
                      run(async () => {
                        const r = await window.aloria.skins.setCape(c.id)
                        if (r.ok) setCapes(capes.map((x) => ({ ...x, active: x.id === c.id })))
                        return r
                      }, `Cape « ${c.alias} » portée.`)
                    }
                  >
                    <CapeThumb texture={c.texture} />
                    <small>{c.alias}</small>
                  </div>
                ))}
              </div>
            )}

            <div className="skin-dialog__footer">
              <button
                className="link-danger"
                disabled={busy}
                onClick={() => {
                  if (confirm('Revenir au skin par défaut de Minecraft ? Ton skin actuel reste dans « Mes skins ».'))
                    run(() => window.aloria.skins.reset(), 'Skin par défaut remis.')
                }}
              >
                Skin par défaut
              </button>
              <button onClick={onClose}>Fermer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
