import { useEffect, useRef, useState } from 'react'
import Select from './Select'
import { describeProfile } from '../hooks/useVersions'
import { canvas, crop, loadImage, packFiles, packIcon, resize, SIZES, vanillaElements, type BaseImages } from '../packImages'
import type { ProfilesState } from '../hooks/useProfiles'
import type { PackElement, PackInfo, PackVanilla } from '../../../shared/types'

interface Props {
  pack: PackInfo
  profiles: ProfilesState
  onBack: () => void
  onChanged: (pack: PackInfo) => void
  onError: (message: string) => void
}

type Tab = 'crosshair' | 'hotbar' | 'health' | 'totem'

/** Éléments de chaque onglet (pastille « modifié ») */
const TAB_ELEMENTS: Record<Tab, PackElement[]> = {
  crosshair: ['crosshair'],
  hotbar: ['hotbar', 'hotbar_selection'],
  health: ['heart_full', 'heart_half', 'armor_full', 'armor_half', 'food_full', 'food_half'],
  totem: ['totem']
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'crosshair', label: '🎯 Viseur' },
  { id: 'hotbar', label: '🧰 Hotbar' },
  { id: 'health', label: '❤️ Vie' },
  { id: 'totem', label: '🗿 Totem' }
]

/** Éditeur d'un pack : aperçu en jeu à gauche, outils de l'élément choisi à droite, installation dans un profil */
export default function PackEditor({ pack, profiles, onBack, onChanged, onError }: Props) {
  const [tab, setTab] = useState<Tab>('crosshair')
  const [target, setTarget] = useState(profiles.selected?.id ?? profiles.profiles[0]?.id ?? '')
  const [vanilla, setVanilla] = useState<PackVanilla | null>(null)
  const [base, setBase] = useState<BaseImages>({})
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
          <HudPreview image={image} base={base} />
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
                {TAB_ELEMENTS[t.id].some((el) => pack.images[el]) && <span className="dot" />}
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
          {tab === 'health' && <HealthTool base={base} pack={pack} image={image} onChange={update} />}
          {tab === 'totem' && (
            <TotemTool value={image('totem')} custom={!!pack.images.totem} available={!vanilla || !!vanilla.totemPath} onChange={(v) => update('totem', v)} />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Petit décor de jeu à l'échelle ×2 : hotbar en bas, cœurs et armure à gauche au-dessus, faim à droite
 * (9 pleins + 1 moitié, comme en jeu), viseur au centre ×3, inversé selon le fond comme dans Minecraft.
 */
function HudPreview({ image, base }: { image: (el: PackElement) => string | undefined; base: BaseImages }) {
  const row = (full: PackElement, half: PackElement, empty: string, right: boolean) =>
    Array.from({ length: 10 }, (_, i) => {
      const img = i === 9 ? image(half) : image(full)
      return (
        <span key={i} className="hud-preview__icon" style={right ? { right: i * 16 } : { left: i * 16 }}>
          {base[empty] && <img className="pixel" src={base[empty]} alt="" />}
          {img && <img className="pixel" src={img} alt="" />}
        </span>
      )
    })
  const crosshair = image('crosshair')
  return (
    <div className="hud-preview">
      {crosshair && <img className="hud-preview__crosshair pixel" src={crosshair} alt="" />}
      <div className="hud-preview__hotbar">
        <div className="hud-preview__row armor">{row('armor_full', 'armor_half', 'armor_empty', false)}</div>
        <div className="hud-preview__row health">{row('heart_full', 'heart_half', 'heart_container', false)}</div>
        <div className="hud-preview__row food">{row('food_full', 'food_half', 'food_empty', true)}</div>
        {image('hotbar') && <img className="pixel" src={image('hotbar')} alt="" />}
        {image('hotbar_selection') && <img className="hud-preview__selection pixel" src={image('hotbar_selection')} alt="" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- éditeur de pixels (viseur, cœur)

type Pixels = Uint8ClampedArray
/** quad : symétrie sur les deux axes (viseur) ; horizontal : gauche/droite (cœur, totem) */
type Mirror = 'quad' | 'horizontal'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Grille de pixels : clic gauche dessine, clic droit efface, Alt + clic prend la couleur (pipette), avec symétrie ;
 * « presets » = formes toutes faites
 */
function PixelEditor({
  size,
  value,
  custom,
  onChange,
  mirror: mirrorMode,
  mirrorDefault = true,
  defaultColor,
  cell,
  presets,
  clearLabel = 'Vide',
  resetLabel = 'Celui du jeu',
  extra
}: {
  size: number
  value?: string
  custom: boolean
  onChange: (v: string | null) => void
  mirror: Mirror
  mirrorDefault?: boolean
  defaultColor: string
  cell: number
  presets?: { id: string; label: string; pixels: (x: number, y: number) => boolean }[]
  clearLabel?: string
  resetLabel?: string
  extra?: React.ReactNode
}) {
  const [pixels, setPixels] = useState<Pixels>(() => new Uint8ClampedArray(size * size * 4))
  const [color, setColor] = useState(defaultColor)
  const [mirror, setMirror] = useState(mirrorDefault)
  const painting = useRef<'paint' | 'erase' | null>(null)
  const latest = useRef(pixels)
  const center = (size - 1) / 2

  // Pixels de l'image actuelle (au chargement et quand on revient à l'image du jeu)
  useEffect(() => {
    if (!value) return
    loadImage(value).then((img) => {
      const [, g] = canvas(size, size)
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, size, size).data
      latest.current = data
      setPixels(data)
    })
  }, [value === undefined ? '' : custom ? 'custom' : value])

  const commit = (data: Pixels) => {
    const [c, g] = canvas(size, size)
    g.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0)
    onChange(c.toDataURL('image/png'))
  }

  const paint = (x: number, y: number, mode: 'paint' | 'erase') => {
    const data = new Uint8ClampedArray(latest.current)
    const [r, g, b] = hexToRgb(color)
    const last = size - 1
    const points = !mirror
      ? [[x, y]]
      : mirrorMode === 'quad'
        ? [[x, y], [last - x, y], [x, last - y], [last - x, last - y]]
        : [[x, y], [last - x, y]]
    for (const [px, py] of points) {
      const i = (py * size + px) * 4
      if (mode === 'paint') data.set([r, g, b, 255], i)
      else data.set([0, 0, 0, 0], i)
    }
    latest.current = data
    setPixels(data)
  }

  const applyPreset = (fn: (x: number, y: number) => boolean) => {
    const [r, g, b] = hexToRgb(color)
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn(x, y)) data.set([r, g, b, 255], (y * size + x) * 4)
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
      <div
        className="pixel-grid"
        style={{ gridTemplateColumns: `repeat(${size}, ${cell}px)`, gridTemplateRows: `repeat(${size}, ${cell}px)`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `0 0, ${cell / 2}px ${cell / 2}px` }}
        onMouseLeave={end}
        onMouseUp={end}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const x = i % size
          const y = Math.floor(i / size)
          const a = pixels[i * 4 + 3]
          return (
            <div
              key={i}
              className={`pixel-grid__cell ${x === center && y === center ? 'center' : ''}`}
              style={a ? { background: `rgba(${pixels[i * 4]}, ${pixels[i * 4 + 1]}, ${pixels[i * 4 + 2]}, ${a / 255})` } : undefined}
              onMouseDown={(e) => {
                // Pipette : la couleur du pixel devient la couleur de dessin
                if (e.altKey) {
                  if (a) setColor('#' + [0, 1, 2].map((k) => pixels[i * 4 + k].toString(16).padStart(2, '0')).join(''))
                  return
                }
                painting.current = e.button === 2 ? 'erase' : 'paint'
                paint(x, y, painting.current)
              }}
              onMouseEnter={() => painting.current && paint(x, y, painting.current)}
            />
          )
        })}
      </div>
      <small className="muted">Clic gauche : dessiner · clic droit : effacer · Alt + clic : pipette</small>
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
        {presets?.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.pixels)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => applyPreset(() => false)}>{clearLabel}</button>
        <button disabled={!custom} onClick={() => onChange(null)}>
          {resetLabel}
        </button>
      </div>
      {extra}
    </div>
  )
}

// ---------------------------------------------------------------- viseur

const C = 7
const ring = (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy))
const CROSSHAIRS: { id: string; label: string; pixels: (x: number, y: number) => boolean }[] = [
  { id: 'point', label: 'Point', pixels: (x, y) => ring(x - C, y - C) <= 1 },
  {
    id: 'cross',
    label: 'Croix fine',
    pixels: (x, y) => (x === C && Math.abs(y - C) >= 2 && Math.abs(y - C) <= 5) || (y === C && Math.abs(x - C) >= 2 && Math.abs(x - C) <= 5)
  },
  {
    id: 'crossdot',
    label: 'Croix + point',
    pixels: (x, y) =>
      (x === C && y === C) || (x === C && Math.abs(y - C) >= 3 && Math.abs(y - C) <= 6) || (y === C && Math.abs(x - C) >= 3 && Math.abs(x - C) <= 6)
  },
  { id: 'plus', label: 'Plus', pixels: (x, y) => (x === C && Math.abs(y - C) <= 4) || (y === C && Math.abs(x - C) <= 4) },
  { id: 'circle', label: 'Cercle', pixels: (x, y) => Math.abs(Math.hypot(x - C, y - C) - 4.5) < 0.6 },
  { id: 'square', label: 'Carré', pixels: (x, y) => ring(x - C, y - C) === 4 },
  { id: 'x', label: 'X', pixels: (x, y) => Math.abs(x - C) === Math.abs(y - C) && ring(x - C, y - C) >= 2 && ring(x - C, y - C) <= 5 }
]

function CrosshairTool({ value, custom, onChange }: { value?: string; custom: boolean; onChange: (v: string | null) => void }) {
  return (
    <PixelEditor
      size={15}
      cell={20}
      value={value}
      custom={custom}
      onChange={onChange}
      mirror="quad"
      defaultColor="#ffffff"
      presets={CROSSHAIRS}
      extra={
        <small className="muted">
          En jeu, le viseur s'inverse selon le décor derrière lui (comme celui de Minecraft) : le blanc donne le résultat le plus net.
        </small>
      }
    />
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

/** Hotbar entière (182 × 22) à partir d'une case de 22 × 22 répétée tous les 20 pixels, comme celle du jeu */
async function tileHotbar(slot: string): Promise<string> {
  const img = await loadImage(slot)
  const [c, g] = canvas(182, 22)
  for (let i = 0; i < 9; i++) g.drawImage(img, i * 20, 0)
  return c.toDataURL('image/png')
}

type HotbarMode = 'tint' | 'slot' | 'selection' | 'import'

const HOTBAR_MODES: { id: HotbarMode; label: string }[] = [
  { id: 'tint', label: 'Teinte' },
  { id: 'slot', label: 'Dessiner une case' },
  { id: 'selection', label: 'Dessiner la sélection' },
  { id: 'import', label: 'Importer' }
]

function HotbarTool({
  base,
  pack,
  onChange
}: {
  base: BaseImages
  pack: PackInfo
  onChange: (el: PackElement, v: string | null) => void
}) {
  const [mode, setMode] = useState<HotbarMode>('tint')
  const [color, setColor] = useState('#5cc8e0')
  const [strength, setStrength] = useState(60)
  const [selectionToo, setSelectionToo] = useState(true)
  const file = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState<PackElement>('hotbar')
  const [slot, setSlot] = useState<string | undefined>()

  // Case de départ de l'éditeur : la première case de la hotbar actuelle (la tienne, sinon celle du jeu)
  const hotbar = pack.images.hotbar ?? base.hotbar
  useEffect(() => {
    if (hotbar) crop(hotbar, 0, 0, 22, 22).then(setSlot)
  }, [hotbar === undefined ? '' : pack.images.hotbar ? 'custom' : hotbar])

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
      <div className="segmented small">
        {HOTBAR_MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'tint' && (
        <>
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
        </>
      )}

      {mode === 'slot' && (
        <PixelEditor
          size={22}
          cell={13}
          value={slot}
          custom={!!pack.images.hotbar}
          mirror="quad"
          defaultColor="#5cc8e0"
          clearLabel="Effacer"
          resetLabel="Celle du jeu"
          onChange={async (v) => onChange('hotbar', v ? await tileHotbar(v) : null)}
          extra={<small className="muted">Ta case est répétée sur les 9 emplacements de la hotbar.</small>}
        />
      )}

      {mode === 'selection' && (
        <PixelEditor
          size={24}
          cell={12}
          value={pack.images.hotbar_selection ?? base.hotbar_selection}
          custom={!!pack.images.hotbar_selection}
          mirror="quad"
          defaultColor="#ffffff"
          clearLabel="Effacer"
          resetLabel="Celle du jeu"
          onChange={(v) => onChange('hotbar_selection', v)}
          extra={<small className="muted">Le cadre qui entoure l'objet tenu en main.</small>}
        />
      )}

      {mode === 'import' && (
        <>
          <small className="muted">PNG redimensionné sans flou : hotbar 182 × 22, case sélectionnée 24 × 24 (ou une taille multiple).</small>
          <div className="tool__presets">
            <button onClick={() => pick('hotbar')}>Importer la hotbar…</button>
            <button onClick={() => pick('hotbar_selection')}>Importer la sélection…</button>
          </div>
        </>
      )}

      <div className="tool__presets">
        <button
          disabled={!pack.images.hotbar && !pack.images.hotbar_selection}
          onClick={() => {
            onChange('hotbar', null)
            onChange('hotbar_selection', null)
          }}
        >
          Tout remettre comme dans le jeu
        </button>
      </div>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}

// ---------------------------------------------------------------- vie, armure, faim

/** Moitié gauche d'une icône 9×9 (le cœur à moitié du jeu garde les 5 colonnes de gauche) */
async function leftHalf(src: string, rightFrom?: string): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(9, 9)
  // Armure : la partie droite d'une demi-armure est celle de l'armure vide (le jeu ne dessine rien dessous)
  if (rightFrom) g.drawImage(await loadImage(rightFrom), 5, 0, 4, 9, 5, 0, 4, 9)
  g.drawImage(img, 0, 0, 5, 9, 0, 0, 5, 9)
  return c.toDataURL('image/png')
}

const HEART_SHAPE = ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........']

const HEARTS: { id: string; label: string; pixels: (x: number, y: number) => boolean }[] = [
  { id: 'heart', label: 'Cœur', pixels: (x, y) => HEART_SHAPE[y][x] === '#' },
  { id: 'diamond', label: 'Losange', pixels: (x, y) => Math.abs(x - 4) + Math.abs(y - 4) <= 4 },
  { id: 'square', label: 'Carré', pixels: (x, y) => x >= 1 && x <= 7 && y >= 1 && y <= 7 }
]

type Group = { id: 'heart' | 'armor' | 'food'; label: string; full: PackElement; half: PackElement }

const GROUPS: Group[] = [
  { id: 'heart', label: 'Cœurs', full: 'heart_full', half: 'heart_half' },
  { id: 'armor', label: 'Armure', full: 'armor_full', half: 'armor_half' },
  { id: 'food', label: 'Faim', full: 'food_full', half: 'food_half' }
]

function HealthTool({
  base,
  pack,
  image,
  onChange
}: {
  base: BaseImages
  pack: PackInfo
  image: (el: PackElement) => string | undefined
  onChange: (el: PackElement, v: string | null) => void
}) {
  const [colors, setColors] = useState({ heart: '#ff4fa3', armor: '#5cc8e0', food: '#ffb347' })
  const [strength, setStrength] = useState(80)
  const [drawing, setDrawing] = useState(false)
  const [drawGroup, setDrawGroup] = useState<Group['id']>('heart')
  const [drawHalf, setDrawHalf] = useState(false)
  const [autoHalf, setAutoHalf] = useState(true)
  const group = GROUPS.find((g) => g.id === drawGroup)!
  const el: PackElement = drawHalf ? group.half : group.full

  /** Dessin d'une icône ; la moitié suit l'icône pleine (5 colonnes de gauche) si « moitié automatique » */
  const drawn = async (v: string | null) => {
    onChange(el, v)
    if (!drawHalf && autoHalf) {
      onChange(group.half, v ? await leftHalf(v, group.id === 'armor' ? base.armor_empty : undefined) : null)
    }
  }

  const tintGroup = async (g: Group) => {
    const color = colors[g.id]
    const full = base[g.full]
    const half = base[g.half]
    if (full) onChange(g.full, await tint(full, color, strength / 100))
    if (half) onChange(g.half, await tint(half, color, strength / 100))
  }

  return (
    <div className="tool">
      <div className="slider-line">
        <span>Intensité de la teinte</span>
        <input type="range" className="slider" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
        <strong>{strength} %</strong>
      </div>
      {GROUPS.map((g) => (
        <div key={g.id} className="health-row">
          <div className="health-row__icons">
            {image(g.full) && <img className="pixel" src={image(g.full)} alt="" />}
            {image(g.half) && <img className="pixel" src={image(g.half)} alt="" />}
          </div>
          <strong>{g.label}</strong>
          <label className="color-field">
            <input type="color" value={colors[g.id]} onChange={(e) => setColors({ ...colors, [g.id]: e.target.value })} />
          </label>
          <div className="tool__presets">
            <button className="primary" onClick={() => tintGroup(g)}>
              Teinter
            </button>
            <button
              disabled={!pack.images[g.full] && !pack.images[g.half]}
              onClick={() => {
                onChange(g.full, null)
                onChange(g.half, null)
              }}
            >
              Celle du jeu
            </button>
          </div>
        </div>
      ))}

      <h4>Dessiner tes icônes</h4>
      {!drawing ? (
        <div className="tool__presets">
          <button onClick={() => setDrawing(true)}>Ouvrir l’éditeur de pixels</button>
        </div>
      ) : (
        <>
          <div className="tool__row">
            <div className="segmented small">
              {GROUPS.map((g) => (
                <button key={g.id} className={drawGroup === g.id ? 'active' : ''} onClick={() => setDrawGroup(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="segmented small">
              <button className={!drawHalf ? 'active' : ''} onClick={() => setDrawHalf(false)}>
                Plein
              </button>
              <button className={drawHalf ? 'active' : ''} onClick={() => setDrawHalf(true)}>
                Moitié
              </button>
            </div>
          </div>
          {!drawHalf && (
            <label className="toggle-line">
              <input type="checkbox" checked={autoHalf} onChange={(e) => setAutoHalf(e.target.checked)} />
              <span>Moitié automatique (la partie gauche de l’icône pleine)</span>
            </label>
          )}
          <PixelEditor
            key={el}
            size={9}
            cell={26}
            value={image(el)}
            custom={!!pack.images[el]}
            mirror="horizontal"
            mirrorDefault={drawGroup !== 'food'}
            defaultColor={colors[drawGroup]}
            presets={drawGroup === 'heart' && !drawHalf ? HEARTS : undefined}
            onChange={drawn}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- totem

function TotemTool({ value, custom, available, onChange }: { value?: string; custom: boolean; available: boolean; onChange: (v: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null)

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
      {!available && <small className="warning">Le totem n'existe pas dans la version de ce profil : il sera ignoré à l'installation.</small>}
      <PixelEditor
        size={16}
        cell={18}
        value={value}
        custom={custom}
        mirror="horizontal"
        mirrorDefault={false}
        defaultColor="#f2c14e"
        clearLabel="Effacer"
        onChange={onChange}
      />
      <div className="tool__presets">
        <button onClick={() => file.current?.click()}>Importer une image…</button>
      </div>
      <small className="muted">Image PNG carrée (16 × 16 ou multiple), redimensionnée sans flou.</small>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}
