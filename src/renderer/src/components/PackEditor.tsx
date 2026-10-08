import { useEffect, useMemo, useRef, useState } from 'react'
import Select from './Select'
import { describeProfile } from '../hooks/useVersions'
import { canvas, loadImage, packFiles, packIcon, resize, SIZES, vanillaElements } from '../packImages'
import type { ProfilesState } from '../hooks/useProfiles'
import type { PackElement, PackInfo, PackVanilla } from '../../../shared/types'

interface Props {
  pack: PackInfo
  profiles: ProfilesState
  onBack: () => void
  onChanged: (pack: PackInfo) => void
  onError: (message: string) => void
}

type Tab = 'crosshair' | 'hotbar' | 'totem'

const TABS: { id: Tab; label: string }[] = [
  { id: 'crosshair', label: '🎯 Viseur' },
  { id: 'hotbar', label: '🧰 Hotbar' },
  { id: 'totem', label: '🗿 Totem' }
]

/** Éditeur d'un pack : aperçu en jeu à gauche, outils de l'élément choisi à droite, installation dans un profil */
export default function PackEditor({ pack, profiles, onBack, onChanged, onError }: Props) {
  const [tab, setTab] = useState<Tab>('crosshair')
  const [target, setTarget] = useState(profiles.selected?.id ?? profiles.profiles[0]?.id ?? '')
  const [vanilla, setVanilla] = useState<PackVanilla | null>(null)
  const [base, setBase] = useState<Partial<Record<PackElement, string>>>({})
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const saveTimers = useRef<Partial<Record<PackElement, ReturnType<typeof setTimeout>>>>({})

  // Images d'origine de la version du profil choisi (point de départ et aperçu)
  useEffect(() => {
    if (!target) return
    let current = true
    setVanilla(null)
    window.aloria.packs.vanilla({ profileId: target }).then(async (res) => {
      if (!current) return
      if (!res.ok) return onError(res.error)
      setVanilla(res.value)
      const els = await vanillaElements(res.value)
      if (current) setBase(els)
    })
    return () => {
      current = false
    }
  }, [target])

  const image = (el: PackElement) => pack.images[el] ?? base[el]

  // Dernière version du pack : plusieurs éléments changés coup sur coup (teinte hotbar + sélection) ne s'écrasent pas
  const latest = useRef(pack)
  latest.current = pack

  /** Change une image (null = celle du jeu) ; enregistrée un instant après la dernière modification */
  const update = (el: PackElement, value: string | null) => {
    const images = { ...latest.current.images }
    if (value) images[el] = value
    else delete images[el]
    latest.current = { ...latest.current, images, updatedAt: Date.now() }
    onChanged(latest.current)
    setDone(null)
    clearTimeout(saveTimers.current[el])
    saveTimers.current[el] = setTimeout(async () => {
      const res = await window.aloria.packs.saveImage(pack.id, el, value)
      if (!res.ok) onError(res.error)
    }, 300)
  }

  const install = async () => {
    if (!vanilla) return
    setInstalling(true)
    try {
      const files = await packFiles(pack, vanilla)
      files['pack.png'] = await packIcon(pack, base)
      const res = await window.aloria.packs.install(pack.id, target, files)
      if (!res.ok) onError(res.error)
      else setDone(res.value)
    } finally {
      setInstalling(false)
    }
  }

  const profile = profiles.profiles.find((p) => p.id === target)

  return (
    <section className="page wide pack-editor">
      <div className="pack-editor__header">
        <button className="link-back" onClick={onBack}>
          ← Créations
        </button>
        <h2>{pack.name}</h2>
      </div>

      <div className="pack-editor__body">
        <div className="pack-editor__preview card">
          <HudPreview crosshair={image('crosshair')} hotbar={image('hotbar')} selection={image('hotbar_selection')} />
          {tab === 'totem' && (
            <div className="totem-preview">
              {image('totem') ? <img src={image('totem')} alt="" className="pixel" /> : <span className="muted">Pas de totem dans cette version</span>}
            </div>
          )}
          <div className="pack-editor__install">
            <span>Installer dans</span>
            <Select
              name="pack-target"
              value={target}
              onChange={setTarget}
              options={profiles.profiles.map((p) => ({ value: p.id, label: `${p.icon} ${p.name} · ${describeProfile(p)}` }))}
            />
            <button className="primary" disabled={!vanilla || installing} onClick={install}>
              {installing ? 'Installation…' : 'Installer'}
            </button>
          </div>
          {done && (
            <small className="success">
              ✓ « {done} » installé et activé dans {profile?.name} : il sera là au prochain lancement.
            </small>
          )}
          {vanilla && (
            <small className="muted">
              Minecraft {vanilla.gameVersion} :{' '}
              {vanilla.layout === 'sprites' ? 'une image par élément' : 'planches icons.png et widgets.png recomposées'}, format {vanilla.format[0]}.
            </small>
          )}
        </div>

        <div className="pack-editor__tools card">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
                {(t.id === 'hotbar' ? pack.images.hotbar || pack.images.hotbar_selection : pack.images[t.id]) && <span className="dot" />}
              </button>
            ))}
          </div>
          {tab === 'crosshair' && (
            <CrosshairTool value={image('crosshair')} custom={!!pack.images.crosshair} onChange={(v) => update('crosshair', v)} />
          )}
          {tab === 'hotbar' && (
            <HotbarTool
              base={base}
              pack={pack}
              onChange={(el, v) => update(el, v)}
            />
          )}
          {tab === 'totem' && (
            <TotemTool value={image('totem')} custom={!!pack.images.totem} available={!vanilla || !!vanilla.totemPath} onChange={(v) => update('totem', v)} />
          )}
        </div>
      </div>
    </section>
  )
}

/** Petit décor de jeu : hotbar en bas, viseur au centre (inversé selon le fond, comme en jeu) */
function HudPreview({ crosshair, hotbar, selection }: { crosshair?: string; hotbar?: string; selection?: string }) {
  return (
    <div className="hud-preview">
      {crosshair && <img className="hud-preview__crosshair pixel" src={crosshair} alt="" />}
      <div className="hud-preview__hotbar">
        {hotbar && <img className="pixel" src={hotbar} alt="" />}
        {selection && <img className="hud-preview__selection pixel" src={selection} alt="" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- viseur

const CENTER = 7
type Pixels = Uint8ClampedArray

function presetPixels(kind: string): boolean[] {
  const on = new Array(15 * 15).fill(false)
  const set = (x: number, y: number) => x >= 0 && x < 15 && y >= 0 && y < 15 && (on[y * 15 + x] = true)
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const dx = x - CENTER
      const dy = y - CENTER
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      if (kind === 'point' && d <= 1) set(x, y)
      if (kind === 'cross' && ((dx === 0 && Math.abs(dy) >= 2 && Math.abs(dy) <= 5) || (dy === 0 && Math.abs(dx) >= 2 && Math.abs(dx) <= 5))) set(x, y)
      if (kind === 'crossdot' && ((dx === 0 && Math.abs(dy) >= 3 && Math.abs(dy) <= 6) || (dy === 0 && Math.abs(dx) >= 3 && Math.abs(dx) <= 6) || d === 0)) set(x, y)
      if (kind === 'plus' && ((dx === 0 && Math.abs(dy) <= 4) || (dy === 0 && Math.abs(dx) <= 4))) set(x, y)
      if (kind === 'circle' && Math.abs(Math.hypot(dx, dy) - 4.5) < 0.6) set(x, y)
      if (kind === 'square' && d === 4) set(x, y)
      if (kind === 'x' && Math.abs(dx) === Math.abs(dy) && d >= 2 && d <= 5) set(x, y)
    }
  }
  return on
}

const PRESETS: { id: string; label: string }[] = [
  { id: 'point', label: 'Point' },
  { id: 'cross', label: 'Croix fine' },
  { id: 'crossdot', label: 'Croix + point' },
  { id: 'plus', label: 'Plus' },
  { id: 'circle', label: 'Cercle' },
  { id: 'square', label: 'Carré' },
  { id: 'x', label: 'X' }
]

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function CrosshairTool({ value, custom, onChange }: { value?: string; custom: boolean; onChange: (v: string | null) => void }) {
  const [pixels, setPixels] = useState<Pixels>(() => new Uint8ClampedArray(15 * 15 * 4))
  const [color, setColor] = useState('#ffffff')
  const [mirror, setMirror] = useState(true)
  const painting = useRef<'paint' | 'erase' | null>(null)
  const latest = useRef(pixels)

  // Pixels de l'image actuelle (au chargement et quand on revient au viseur du jeu)
  useEffect(() => {
    if (!value) return
    loadImage(value).then((img) => {
      const [, g] = canvas(15, 15)
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, 15, 15).data
      latest.current = data
      setPixels(data)
    })
  }, [value === undefined ? '' : custom ? 'custom' : value])

  const commit = (data: Pixels) => {
    const [c, g] = canvas(15, 15)
    g.putImageData(new ImageData(new Uint8ClampedArray(data), 15, 15), 0, 0)
    onChange(c.toDataURL('image/png'))
  }

  const paint = (x: number, y: number, mode: 'paint' | 'erase') => {
    const data = new Uint8ClampedArray(latest.current)
    const [r, g, b] = hexToRgb(color)
    const points = mirror ? [[x, y], [14 - x, y], [x, 14 - y], [14 - x, 14 - y]] : [[x, y]]
    for (const [px, py] of points) {
      const i = (py * 15 + px) * 4
      if (mode === 'paint') data.set([r, g, b, 255], i)
      else data.set([0, 0, 0, 0], i)
    }
    latest.current = data
    setPixels(data)
  }

  const applyPreset = (kind: string) => {
    const on = presetPixels(kind)
    const [r, g, b] = hexToRgb(color)
    const data = new Uint8ClampedArray(15 * 15 * 4)
    on.forEach((v, i) => v && data.set([r, g, b, 255], i * 4))
    latest.current = data
    setPixels(data)
    commit(data)
  }

  const end = () => {
    if (painting.current) commit(latest.current)
    painting.current = null
  }

  return (
    <div className="tool">
      <div className="pixel-grid" onMouseLeave={end} onMouseUp={end} onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: 225 }, (_, i) => {
          const x = i % 15
          const y = Math.floor(i / 15)
          const a = pixels[i * 4 + 3]
          return (
            <div
              key={i}
              className={`pixel-grid__cell ${x === CENTER && y === CENTER ? 'center' : ''}`}
              style={a ? { background: `rgba(${pixels[i * 4]}, ${pixels[i * 4 + 1]}, ${pixels[i * 4 + 2]}, ${a / 255})` } : undefined}
              onMouseDown={(e) => {
                painting.current = e.button === 2 ? 'erase' : 'paint'
                paint(x, y, painting.current)
              }}
              onMouseEnter={() => painting.current && paint(x, y, painting.current)}
            />
          )
        })}
      </div>
      <small className="muted">Clic gauche : dessiner · clic droit : effacer</small>
      <div className="tool__row">
        <label className="color-field">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          Couleur
        </label>
        <label className="toggle-line">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
          <span>Symétrie</span>
        </label>
      </div>
      <div className="tool__presets">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => applyPreset('none')}>Vide</button>
        <button disabled={!custom} onClick={() => onChange(null)}>
          Celui du jeu
        </button>
      </div>
      <small className="muted">
        En jeu, le viseur s'inverse selon le décor derrière lui (comme celui de Minecraft) : le blanc donne le résultat le plus net.
      </small>
    </div>
  )
}

// ---------------------------------------------------------------- hotbar

/** Recolore une image en gardant ses ombres : chaque pixel prend la teinte, plus ou moins fort */
async function tint(src: string, hex: string, strength: number): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, img.width, img.height)
  const [tr, tg, tb] = hexToRgb(hex)
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue
    const lum = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255
    const k = Math.min(1.6, lum * 1.6)
    d.data[i] = d.data[i] * (1 - strength) + Math.min(255, tr * k) * strength
    d.data[i + 1] = d.data[i + 1] * (1 - strength) + Math.min(255, tg * k) * strength
    d.data[i + 2] = d.data[i + 2] * (1 - strength) + Math.min(255, tb * k) * strength
  }
  g.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}

function HotbarTool({
  base,
  pack,
  onChange
}: {
  base: Partial<Record<PackElement, string>>
  pack: PackInfo
  onChange: (el: PackElement, v: string | null) => void
}) {
  const [color, setColor] = useState('#5cc8e0')
  const [strength, setStrength] = useState(60)
  const [selectionToo, setSelectionToo] = useState(true)
  const file = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState<PackElement>('hotbar')

  const applyTint = async () => {
    if (base.hotbar) onChange('hotbar', await tint(base.hotbar, color, strength / 100))
    if (selectionToo && base.hotbar_selection) onChange('hotbar_selection', await tint(base.hotbar_selection, color, strength / 100))
  }

  const pick = (el: PackElement) => {
    setImporting(el)
    file.current?.click()
  }

  const imported = async (f: File | undefined) => {
    if (!f) return
    const url = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.readAsDataURL(f)
    })
    const [w, h] = SIZES[importing]
    onChange(importing, await resize(url, w, h))
  }

  return (
    <div className="tool">
      <h4>Teinte</h4>
      <div className="tool__row">
        <label className="color-field">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          Couleur
        </label>
        <div className="slider-line">
          <input type="range" className="slider" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
          <strong>{strength} %</strong>
        </div>
      </div>
      <label className="toggle-line">
        <input type="checkbox" checked={selectionToo} onChange={(e) => setSelectionToo(e.target.checked)} />
        <span>Teinter aussi la case sélectionnée</span>
      </label>
      <div className="tool__presets">
        <button className="primary" disabled={!base.hotbar} onClick={applyTint}>
          Appliquer la teinte
        </button>
      </div>

      <h4>Ta propre image</h4>
      <small className="muted">PNG redimensionné sans flou : hotbar 182 × 22, case sélectionnée 24 × 24 (ou une taille multiple).</small>
      <div className="tool__presets">
        <button onClick={() => pick('hotbar')}>Importer la hotbar…</button>
        <button onClick={() => pick('hotbar_selection')}>Importer la sélection…</button>
        <button
          disabled={!pack.images.hotbar && !pack.images.hotbar_selection}
          onClick={() => {
            onChange('hotbar', null)
            onChange('hotbar_selection', null)
          }}
        >
          Celle du jeu
        </button>
      </div>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}

// ---------------------------------------------------------------- totem

function TotemTool({ value, custom, available, onChange }: { value?: string; custom: boolean; available: boolean; onChange: (v: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => value, [value])

  const imported = async (f: File | undefined) => {
    if (!f) return
    const url = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.readAsDataURL(f)
    })
    onChange(await resize(url, 16, 16))
  }

  return (
    <div className="tool">
      <div className="totem-tool">
        {preview ? <img src={preview} alt="" className="pixel" /> : <span className="muted">—</span>}
      </div>
      {!available && <small className="warning">Le totem n'existe pas dans la version de ce profil : il sera ignoré à l'installation.</small>}
      <small className="muted">Une image PNG carrée (16 × 16 ou multiple), redimensionnée sans flou.</small>
      <div className="tool__presets">
        <button className="primary" onClick={() => file.current?.click()}>
          Importer une image…
        </button>
        <button disabled={!custom} onClick={() => onChange(null)}>
          Celui du jeu
        </button>
      </div>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}
