import { useEffect, useRef, useState } from 'react'
import Select from './Select'
import { describeProfile } from '../hooks/useVersions'
import { canvas, crop, loadImage, packFiles, packIcon, resize, sizeOf, vanillaElements, type BaseImages } from '../packImages'
import type { ProfilesState } from '../hooks/useProfiles'
import type { PackElement, PackInfo, PackVanilla } from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { t } from '../i18n'

interface Props {
  pack: PackInfo
  profiles: ProfilesState
  onBack: () => void
  onChanged: (pack: PackInfo) => void
  onError: (message: string) => void
}

type Tab = 'crosshair' | 'hotbar' | 'health' | 'xp' | 'totem'

/** Éléments de chaque onglet (pastille « modifié ») */
const TAB_ELEMENTS: Record<Tab, PackElement[]> = {
  crosshair: ['crosshair'],
  hotbar: ['hotbar', 'hotbar_selection'],
  health: ['heart_full', 'heart_half', 'heart_container', 'armor_full', 'armor_half', 'armor_empty', 'food_full', 'food_half', 'food_empty'],
  xp: ['xp_background', 'xp_progress'],
  totem: ['totem']
}

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'crosshair', label: 'pe.tab.crosshair' },
  { id: 'hotbar', label: 'pe.tab.hotbar' },
  { id: 'health', label: 'pe.tab.health' },
  { id: 'xp', label: 'pe.tab.xp' },
  { id: 'totem', label: 'pe.tab.totem' }
]

const SCALES: { value: number; label: string; hint: MessageKey }[] = [
  { value: 1, label: '×1', hint: 'pe.scale1' },
  { value: 2, label: '×2', hint: 'pe.scale2' },
  { value: 4, label: '×4', hint: 'pe.scale4' }
]

/** Taille des cases de la grille de dessin : la grille fait environ 300 px quelle que soit la résolution */
const cellFor = (size: number) => Math.max(3, Math.min(26, Math.floor(300 / size)))

/** Éditeur d'un pack : aperçu en jeu à gauche, outils de l'élément choisi à droite, installation dans un profil */
export default function PackEditor({ pack, profiles, onBack, onChanged, onError }: Props) {
  const [tab, setTab] = useState<Tab>('crosshair')
  const [target, setTarget] = useState(profiles.selected?.id ?? profiles.profiles[0]?.id ?? '')
  const [vanilla, setVanilla] = useState<PackVanilla | null>(null)
  const [base, setBase] = useState<BaseImages>({})
  const [installing, setInstalling] = useState(false)
  const [rescaling, setRescaling] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const saveTimers = useRef<Partial<Record<PackElement, ReturnType<typeof setTimeout>>>>({})
  const scale = pack.scale ?? 1

  // Images d'origine de la version du profil choisi (point de départ et aperçu)
  useEffect(() => {
    if (!target) return
    let current = true
    setVanilla(null)
    window.aloria.packs.vanilla({ profileId: target }).then((res) => {
      if (!current) return
      if (!res.ok) return onError(res.error)
      setVanilla(res.value)
    })
    return () => {
      current = false
    }
  }, [target])

  // … à la résolution du pack
  useEffect(() => {
    if (!vanilla) return
    let current = true
    vanillaElements(vanilla, scale).then((els) => current && setBase(els))
    return () => {
      current = false
    }
  }, [vanilla, scale])

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

  /** Nouvelle résolution : les images déjà faites sont redimensionnées (sans flou) */
  const changeScale = async (next: number) => {
    if (next === scale) return
    if (next < scale && Object.keys(pack.images).length && !confirm(t('pe.confirmScale'))) return
    setRescaling(true)
    try {
      for (const [el, img] of Object.entries(latest.current.images) as [PackElement, string][]) {
        const [w, h] = sizeOf(el, next)
        update(el, await resize(img, w, h))
      }
      const res = await window.aloria.packs.setScale(pack.id, next)
      if (!res.ok) onError(res.error)
      latest.current = { ...latest.current, scale: next }
      onChanged(latest.current)
    } finally {
      setRescaling(false)
    }
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
          ← {t('nav.creations')}
        </button>
        <h2>{pack.name}</h2>
        <div className="pack-editor__scale">
          <span>{t('pe.resolution')}</span>
          <div className="segmented small">
            {SCALES.map((s) => (
              <button key={s.value} className={scale === s.value ? 'active' : ''} disabled={rescaling} title={t(s.hint)} onClick={() => changeScale(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pack-editor__body">
        <div className="pack-editor__preview card">
          <HudPreview image={image} />
          {tab === 'totem' && (
            <div className="totem-preview">
              {image('totem') ? <img src={image('totem')} alt="" className="pixel" /> : <span className="muted">{t('pe.noTotem')}</span>}
            </div>
          )}
          <div className="pack-editor__install">
            <span>{t('pe.installIn')}</span>
            <Select
              name="pack-target"
              value={target}
              onChange={setTarget}
              options={profiles.profiles.map((p) => ({ value: p.id, label: `${p.icon} ${p.name} · ${describeProfile(p)}` }))}
            />
            <button className="primary" disabled={!vanilla || installing || rescaling} onClick={install}>
              {installing ? t('library.installing') : t('library.install')}
            </button>
          </div>
          {done && (
            <small className="success">
              ✓ {t('pe.installed', { name: done, profile: profile?.name ?? '' })}
            </small>
          )}
          {vanilla && (
            <small className="muted">
              {t(vanilla.layout === 'sprites' ? 'pe.formatSprites' : 'pe.formatSheets', { version: vanilla.gameVersion, format: vanilla.format[0] })}
              {scale > 1 ? t('pe.formatScale', { scale }) : ''}.
            </small>
          )}
        </div>

        <div className="pack-editor__tools card">
          <div className="tabs">
            {TABS.map((it) => (
              <button key={it.id} className={tab === it.id ? 'active' : ''} onClick={() => setTab(it.id)}>
                {t(it.label)}
                {TAB_ELEMENTS[it.id].some((el) => pack.images[el]) && <span className="dot" />}
              </button>
            ))}
          </div>
          {tab === 'crosshair' && (
            <CrosshairTool
              key={scale}
              scale={scale}
              value={image('crosshair')}
              custom={!!pack.images.crosshair}
              onChange={(v) => update('crosshair', v)}
            />
          )}
          {tab === 'hotbar' && <HotbarTool key={scale} scale={scale} base={base} pack={pack} onChange={update} />}
          {tab === 'health' && <HealthTool key={scale} scale={scale} base={base} pack={pack} image={image} onChange={update} />}
          {tab === 'xp' && <XpTool base={base} pack={pack} onChange={update} />}
          {tab === 'totem' && (
            <TotemTool
              key={scale}
              scale={scale}
              value={image('totem')}
              custom={!!pack.images.totem}
              available={!vanilla || !!vanilla.totemPath}
              onChange={(v) => update('totem', v)}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Petit décor de jeu à l'échelle ×2 : hotbar en bas, barre d'XP au-dessus, cœurs et armure à gauche, faim à droite
 * (9 pleins + 1 moitié, comme en jeu), viseur au centre ×3, inversé selon le fond comme dans Minecraft.
 */
function HudPreview({ image }: { image: (el: PackElement) => string | undefined }) {
  const row = (full: PackElement, half: PackElement, empty: PackElement, right: boolean, behind: boolean) =>
    Array.from({ length: 10 }, (_, i) => {
      const img = i === 9 ? image(half) : image(full)
      return (
        <span key={i} className="hud-preview__icon" style={right ? { right: i * 16 } : { left: i * 16 }}>
          {behind && image(empty) && <img className="pixel" src={image(empty)} alt="" />}
          {img && <img className="pixel" src={img} alt="" />}
        </span>
      )
    })
  const crosshair = image('crosshair')
  return (
    <div className="hud-preview">
      {crosshair && <img className="hud-preview__crosshair pixel" src={crosshair} alt="" />}
      <div className="hud-preview__hotbar">
        {/* L'armure n'a pas de fond : l'armure vide n'apparaît qu'à la place des pièces manquantes */}
        <div className="hud-preview__row armor">{row('armor_full', 'armor_half', 'armor_empty', false, false)}</div>
        <div className="hud-preview__row health">{row('heart_full', 'heart_half', 'heart_container', false, true)}</div>
        <div className="hud-preview__row food">{row('food_full', 'food_half', 'food_empty', true, true)}</div>
        <div className="hud-preview__xp">
          {image('xp_background') && <img className="pixel" src={image('xp_background')} alt="" />}
          {image('xp_progress') && (
            <div className="hud-preview__xp-progress">
              <img className="pixel" src={image('xp_progress')} alt="" />
            </div>
          )}
        </div>
        {image('hotbar') && <img className="pixel" src={image('hotbar')} alt="" />}
        {image('hotbar_selection') && <img className="hud-preview__selection pixel" src={image('hotbar_selection')} alt="" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- outils de couleur

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

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
    // Les pixels sombres remontent un peu, sinon une image presque noire (fond de la barre d'XP) ne changerait pas
    const k = Math.min(1.6, 0.25 + lum * 1.4)
    d.data[i] = d.data[i] * (1 - strength) + Math.min(255, tr * k) * strength
    d.data[i + 1] = d.data[i + 1] * (1 - strength) + Math.min(255, tg * k) * strength
    d.data[i + 2] = d.data[i + 2] * (1 - strength) + Math.min(255, tb * k) * strength
  }
  g.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}

/** Contour : les pixels très sombres (le trait noir autour des icônes) prennent la couleur choisie */
async function recolorOutline(src: string, hex: string): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, img.width, img.height)
  const [r, gr, b] = hexToRgb(hex)
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue
    const lum = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255
    if (lum < 0.18) d.data.set([r, gr, b], i)
  }
  g.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------- éditeur de pixels

type Pixels = Uint8ClampedArray
/** quad : symétrie sur les deux axes (viseur) ; horizontal : gauche/droite (cœur, totem) */
type Mirror = 'quad' | 'horizontal'
type Preset = { id: string; label: MessageKey; pixels: (x: number, y: number) => boolean }

/**
 * Grille de pixels : clic gauche dessine, clic droit efface, Alt + clic prend la couleur (pipette), avec symétrie ;
 * « presets » = formes toutes faites, dessinées à la taille du jeu puis agrandies (presetScale)
 */
function PixelEditor({
  size,
  value,
  custom,
  onChange,
  mirror: mirrorMode,
  mirrorDefault = true,
  defaultColor,
  presets,
  presetScale = 1,
  clearLabel = t('pe.empty'),
  resetLabel = t('pe.resetMasc'),
  extra
}: {
  size: number
  value?: string
  custom: boolean
  onChange: (v: string | null) => void
  mirror: Mirror
  mirrorDefault?: boolean
  defaultColor: string
  presets?: Preset[]
  presetScale?: number
  clearLabel?: string
  resetLabel?: string
  extra?: React.ReactNode
}) {
  const [pixels, setPixels] = useState<Pixels>(() => new Uint8ClampedArray(size * size * 4))
  const [color, setColor] = useState(defaultColor)
  const [mirror, setMirror] = useState(mirrorDefault)
  const painting = useRef<'paint' | 'erase' | null>(null)
  const latest = useRef(pixels)
  const cell = cellFor(size)

  // Pixels de l'image actuelle (au chargement et quand on revient à l'image du jeu)
  useEffect(() => {
    if (!value) return
    loadImage(value).then((img) => {
      const [, g] = canvas(size, size)
      g.drawImage(img, 0, 0, size, size)
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
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (fn(Math.floor(x / presetScale), Math.floor(y / presetScale))) data.set([r, g, b, 255], (y * size + x) * 4)
      }
    }
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
        style={{
          gridTemplateColumns: `repeat(${size}, ${cell}px)`,
          gridTemplateRows: `repeat(${size}, ${cell}px)`,
          backgroundSize: `${cell * 2}px ${cell * 2}px`,
          backgroundPosition: `0 0, ${cell}px ${cell}px`
        }}
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
              className={`pixel-grid__cell ${cell < 8 ? 'fine' : ''}`}
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
      <small className="muted">
        {t('pe.pixelHelp', { size })}
      </small>
      <div className="tool__row">
        <label className="color-field">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          {t('pe.color')}
        </label>
        <label className="toggle-line">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
          <span>{t('pe.mirror')}</span>
        </label>
      </div>
      <div className="tool__presets">
        {presets?.map((p) => (
          <button key={p.id} onClick={() => applyPreset(p.pixels)}>
            {t(p.label)}
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

async function readFile(f: File): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.readAsDataURL(f)
  })
}

// ---------------------------------------------------------------- viseur

const C = 7
const ring = (dx: number, dy: number) => Math.max(Math.abs(dx), Math.abs(dy))
const CROSSHAIRS: Preset[] = [
  { id: 'point', label: 'pe.shape.point', pixels: (x, y) => ring(x - C, y - C) <= 1 },
  {
    id: 'cross',
    label: 'pe.shape.cross',
    pixels: (x, y) => (x === C && Math.abs(y - C) >= 2 && Math.abs(y - C) <= 5) || (y === C && Math.abs(x - C) >= 2 && Math.abs(x - C) <= 5)
  },
  {
    id: 'crossdot',
    label: 'pe.shape.crossdot',
    pixels: (x, y) =>
      (x === C && y === C) || (x === C && Math.abs(y - C) >= 3 && Math.abs(y - C) <= 6) || (y === C && Math.abs(x - C) >= 3 && Math.abs(x - C) <= 6)
  },
  { id: 'plus', label: 'pe.shape.plus', pixels: (x, y) => (x === C && Math.abs(y - C) <= 4) || (y === C && Math.abs(x - C) <= 4) },
  { id: 'circle', label: 'pe.shape.circle', pixels: (x, y) => Math.abs(Math.hypot(x - C, y - C) - 4.5) < 0.6 },
  { id: 'square', label: 'pe.shape.square', pixels: (x, y) => ring(x - C, y - C) === 4 },
  { id: 'x', label: 'pe.shape.x', pixels: (x, y) => Math.abs(x - C) === Math.abs(y - C) && ring(x - C, y - C) >= 2 && ring(x - C, y - C) <= 5 }
]

function CrosshairTool({ scale, value, custom, onChange }: { scale: number; value?: string; custom: boolean; onChange: (v: string | null) => void }) {
  return (
    <PixelEditor
      size={15 * scale}
      value={value}
      custom={custom}
      onChange={onChange}
      mirror="quad"
      defaultColor="#ffffff"
      presets={CROSSHAIRS}
      presetScale={scale}
      extra={
        <small className="muted">
          {t('pe.crosshairHint')}
        </small>
      }
    />
  )
}

// ---------------------------------------------------------------- hotbar

/** Hotbar entière à partir d'une case (22 × 22 à la taille du jeu) répétée tous les 20 pixels, comme celle du jeu */
async function tileHotbar(slot: string, scale: number): Promise<string> {
  const img = await loadImage(slot)
  const [c, g] = canvas(182 * scale, 22 * scale)
  for (let i = 0; i < 9; i++) g.drawImage(img, i * 20 * scale, 0)
  return c.toDataURL('image/png')
}

type HotbarMode = 'tint' | 'slot' | 'selection' | 'import'

const HOTBAR_MODES: { id: HotbarMode; label: MessageKey }[] = [
  { id: 'tint', label: 'pe.mode.tint' },
  { id: 'slot', label: 'pe.mode.slot' },
  { id: 'selection', label: 'pe.mode.selection' },
  { id: 'import', label: 'pe.mode.import' }
]

function HotbarTool({
  scale,
  base,
  pack,
  onChange
}: {
  scale: number
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
    if (hotbar) crop(hotbar, 0, 0, 22 * scale, 22 * scale).then(setSlot)
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
    const [w, h] = sizeOf(importing, scale)
    onChange(importing, await resize(await readFile(f), w, h))
  }

  return (
    <div className="tool">
      <div className="segmented small">
        {HOTBAR_MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
            {t(m.label)}
          </button>
        ))}
      </div>

      {mode === 'tint' && (
        <>
          <div className="tool__row">
            <label className="color-field">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              {t('pe.color')}
            </label>
            <div className="slider-line">
              <input type="range" className="slider" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
              <strong>{t('gs.percent', { n: strength })}</strong>
            </div>
          </div>
          <label className="toggle-line">
            <input type="checkbox" checked={selectionToo} onChange={(e) => setSelectionToo(e.target.checked)} />
            <span>{t('pe.tintSelection')}</span>
          </label>
          <div className="tool__presets">
            <button className="primary" disabled={!base.hotbar} onClick={applyTint}>
              {t('pe.applyTint')}
            </button>
          </div>
        </>
      )}

      {mode === 'slot' && (
        <PixelEditor
          size={22 * scale}
          value={slot}
          custom={!!pack.images.hotbar}
          mirror="quad"
          defaultColor="#5cc8e0"
          clearLabel={t('pe.erase')}
          resetLabel={t('pe.resetFem')}
          onChange={async (v) => onChange('hotbar', v ? await tileHotbar(v, scale) : null)}
          extra={<small className="muted">{t('pe.slotHint')}</small>}
        />
      )}

      {mode === 'selection' && (
        <PixelEditor
          size={24 * scale}
          value={pack.images.hotbar_selection ?? base.hotbar_selection}
          custom={!!pack.images.hotbar_selection}
          mirror="quad"
          defaultColor="#ffffff"
          clearLabel={t('pe.erase')}
          resetLabel={t('pe.resetFem')}
          onChange={(v) => onChange('hotbar_selection', v)}
          extra={<small className="muted">{t('pe.selectionHint')}</small>}
        />
      )}

      {mode === 'import' && (
        <>
          <small className="muted">
            {t('pe.importHint', { hw: 182 * scale, hh: 22 * scale, s: 24 * scale })}
          </small>
          <div className="tool__presets">
            <button onClick={() => pick('hotbar')}>{t('pe.importHotbar')}</button>
            <button onClick={() => pick('hotbar_selection')}>{t('pe.importSelection')}</button>
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
          {t('pe.resetAll')}
        </button>
      </div>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}

// ---------------------------------------------------------------- vie, armure, faim

/** Moitié gauche d'une icône (5 colonnes sur 9, à la résolution du pack) ; l'armure garde la droite de l'armure vide */
async function leftHalf(src: string, scale: number, rightFrom?: string): Promise<string> {
  const img = await loadImage(src)
  const [c, g] = canvas(9 * scale, 9 * scale)
  if (rightFrom) g.drawImage(await loadImage(rightFrom), 5 * scale, 0, 4 * scale, 9 * scale, 5 * scale, 0, 4 * scale, 9 * scale)
  g.drawImage(img, 0, 0, 5 * scale, 9 * scale, 0, 0, 5 * scale, 9 * scale)
  return c.toDataURL('image/png')
}

const HEART_SHAPE = ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........']

const HEARTS: Preset[] = [
  { id: 'heart', label: 'pe.shape.heart', pixels: (x, y) => HEART_SHAPE[y]?.[x] === '#' },
  { id: 'diamond', label: 'pe.shape.diamond', pixels: (x, y) => Math.abs(x - 4) + Math.abs(y - 4) <= 4 },
  { id: 'square', label: 'pe.shape.square', pixels: (x, y) => x >= 1 && x <= 7 && y >= 1 && y <= 7 }
]

type Group = { id: 'heart' | 'armor' | 'food'; label: MessageKey; full: PackElement; half: PackElement; empty: PackElement }

const GROUPS: Group[] = [
  { id: 'heart', label: 'pe.group.hearts', full: 'heart_full', half: 'heart_half', empty: 'heart_container' },
  { id: 'armor', label: 'pe.group.armor', full: 'armor_full', half: 'armor_half', empty: 'armor_empty' },
  { id: 'food', label: 'pe.group.food', full: 'food_full', half: 'food_half', empty: 'food_empty' }
]

type Part = 'full' | 'half' | 'empty'

function HealthTool({
  scale,
  base,
  pack,
  image,
  onChange
}: {
  scale: number
  base: BaseImages
  pack: PackInfo
  image: (el: PackElement) => string | undefined
  onChange: (el: PackElement, v: string | null) => void
}) {
  const [colors, setColors] = useState({ heart: '#ff4fa3', armor: '#5cc8e0', food: '#ffb347' })
  const [outline, setOutline] = useState('#0b3a52')
  const [strength, setStrength] = useState(80)
  const [drawing, setDrawing] = useState(false)
  const [drawGroup, setDrawGroup] = useState<Group['id']>('heart')
  const [part, setPart] = useState<Part>('full')
  const [autoHalf, setAutoHalf] = useState(true)
  const group = GROUPS.find((g) => g.id === drawGroup)!
  const el: PackElement = group[part]

  /** Dessin d'une icône ; la moitié suit l'icône pleine (sa partie gauche) si « moitié automatique » */
  const drawn = async (v: string | null) => {
    onChange(el, v)
    if (part === 'full' && autoHalf) {
      const armorEmpty = group.id === 'armor' ? image('armor_empty') : undefined
      onChange(group.half, v ? await leftHalf(v, scale, armorEmpty) : null)
    }
  }

  const tintGroup = async (g: Group) => {
    const color = colors[g.id]
    for (const e of [g.full, g.half]) {
      const src = base[e]
      if (src) onChange(e, await tint(src, color, strength / 100))
    }
  }

  /** Le trait noir autour des cœurs, de l'armure et de la faim (icônes pleines, moitiés et fonds) */
  const colorOutlines = async () => {
    for (const g of GROUPS) {
      for (const e of [g.full, g.half, g.empty]) {
        const src = image(e)
        if (src) onChange(e, await recolorOutline(src, outline))
      }
    }
  }

  return (
    <div className="tool">
      <div className="slider-line">
        <span>{t('pe.tintStrength')}</span>
        <input type="range" className="slider" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
        <strong>{t('gs.percent', { n: strength })}</strong>
      </div>
      {GROUPS.map((g) => (
        <div key={g.id} className="health-row">
          <div className="health-row__icons">
            {image(g.full) && <img className="pixel" src={image(g.full)} alt="" />}
            {image(g.half) && <img className="pixel" src={image(g.half)} alt="" />}
          </div>
          <strong>{t(g.label)}</strong>
          <label className="color-field">
            <input type="color" value={colors[g.id]} onChange={(e) => setColors({ ...colors, [g.id]: e.target.value })} />
          </label>
          <div className="tool__presets">
            <button className="primary" onClick={() => tintGroup(g)}>
              {t('pe.tint')}
            </button>
            <button
              disabled={!pack.images[g.full] && !pack.images[g.half] && !pack.images[g.empty]}
              onClick={() => {
                onChange(g.full, null)
                onChange(g.half, null)
                onChange(g.empty, null)
              }}
            >
              {t('pe.resetFem')}
            </button>
          </div>
        </div>
      ))}
      <div className="health-row">
        <div className="health-row__icons">
          {image('heart_container') && <img className="pixel" src={image('heart_container')} alt="" />}
          {image('food_empty') && <img className="pixel" src={image('food_empty')} alt="" />}
        </div>
        <strong>{t('pe.outlines')}</strong>
        <label className="color-field">
          <input type="color" value={outline} onChange={(e) => setOutline(e.target.value)} />
        </label>
        <div className="tool__presets">
          <button className="primary" onClick={colorOutlines}>
            {t('pe.colorize')}
          </button>
        </div>
      </div>
      <small className="muted">{t('pe.outlinesHint')}</small>

      <h4>{t('pe.drawIcons')}</h4>
      {!drawing ? (
        <div className="tool__presets">
          <button onClick={() => setDrawing(true)}>{t('pe.openPixelEditor')}</button>
        </div>
      ) : (
        <>
          <div className="tool__row">
            <div className="segmented small">
              {GROUPS.map((g) => (
                <button key={g.id} className={drawGroup === g.id ? 'active' : ''} onClick={() => setDrawGroup(g.id)}>
                  {t(g.label)}
                </button>
              ))}
            </div>
            <div className="segmented small">
              <button className={part === 'full' ? 'active' : ''} onClick={() => setPart('full')}>
                {t('pe.full')}
              </button>
              <button className={part === 'half' ? 'active' : ''} onClick={() => setPart('half')}>
                {t('pe.half')}
              </button>
              <button className={part === 'empty' ? 'active' : ''} onClick={() => setPart('empty')}>
                {t('pe.emptyIcon')}
              </button>
            </div>
          </div>
          {part === 'full' && (
            <label className="toggle-line">
              <input type="checkbox" checked={autoHalf} onChange={(e) => setAutoHalf(e.target.checked)} />
              <span>{t('pe.autoHalf')}</span>
            </label>
          )}
          {part === 'empty' && (
            <small className="muted">
              {drawGroup === 'armor'
                ? t('pe.armorEmptyHint')
                : t('pe.emptyHint')}
            </small>
          )}
          <PixelEditor
            key={el}
            size={9 * scale}
            value={image(el)}
            custom={!!pack.images[el]}
            mirror="horizontal"
            mirrorDefault={drawGroup !== 'food'}
            defaultColor={part === 'empty' ? outline : colors[drawGroup]}
            presets={drawGroup === 'heart' && part !== 'half' ? HEARTS : undefined}
            presetScale={scale}
            onChange={drawn}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- barre d'expérience

function XpTool({ base, pack, onChange }: { base: BaseImages; pack: PackInfo; onChange: (el: PackElement, v: string | null) => void }) {
  const [colors, setColors] = useState({ xp_progress: '#7ce84f', xp_background: '#1d3a2a' })
  const [strength, setStrength] = useState(90)
  const rows: { el: 'xp_progress' | 'xp_background'; label: MessageKey }[] = [
    { el: 'xp_progress', label: 'pe.xpFill' },
    { el: 'xp_background', label: 'pe.xpBackground' }
  ]
  return (
    <div className="tool">
      <div className="slider-line">
        <span>{t('pe.tintStrength')}</span>
        <input type="range" className="slider" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
        <strong>{t('gs.percent', { n: strength })}</strong>
      </div>
      {rows.map((r) => (
        <div key={r.el} className="xp-row">
          <strong>{t(r.label)}</strong>
          <label className="color-field">
            <input type="color" value={colors[r.el]} onChange={(e) => setColors({ ...colors, [r.el]: e.target.value })} />
          </label>
          <div className="tool__presets">
            <button className="primary" disabled={!base[r.el]} onClick={async () => onChange(r.el, await tint(base[r.el]!, colors[r.el], strength / 100))}>
              {t('pe.tint')}
            </button>
            <button disabled={!pack.images[r.el]} onClick={() => onChange(r.el, null)}>
              {t('pe.resetFem')}
            </button>
          </div>
          <div className="xp-row__bar">{(pack.images[r.el] ?? base[r.el]) && <img className="pixel" src={pack.images[r.el] ?? base[r.el]} alt="" />}</div>
        </div>
      ))}
      <small className="muted">{t('pe.xpHint')}</small>
    </div>
  )
}

// ---------------------------------------------------------------- totem

function TotemTool({
  scale,
  value,
  custom,
  available,
  onChange
}: {
  scale: number
  value?: string
  custom: boolean
  available: boolean
  onChange: (v: string | null) => void
}) {
  const file = useRef<HTMLInputElement>(null)

  const imported = async (f: File | undefined) => {
    if (!f) return
    onChange(await resize(await readFile(f), 16 * scale, 16 * scale))
  }

  return (
    <div className="tool">
      {!available && <small className="warning">{t('pe.totemMissing')}</small>}
      <PixelEditor
        size={16 * scale}
        value={value}
        custom={custom}
        mirror="horizontal"
        mirrorDefault={false}
        defaultColor="#f2c14e"
        clearLabel={t('pe.erase')}
        onChange={onChange}
      />
      <div className="tool__presets">
        <button onClick={() => file.current?.click()}>{t('pe.importImage')}</button>
      </div>
      <small className="muted">
        {t('pe.totemImportHint', { n: 16 * scale })}
      </small>
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => imported(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </div>
  )
}
