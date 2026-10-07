import { useCallback, useEffect, useState } from 'react'
import { keyFromCode, keyFromMouse, keyLabel } from '../keys'
import type { SettingsPreset } from '../../../shared/types'

const LANGUAGES: [string, string][] = [
  ['fr_fr', 'Français'], ['en_us', 'English (US)'], ['en_gb', 'English (UK)'], ['es_es', 'Español'],
  ['de_de', 'Deutsch'], ['it_it', 'Italiano'], ['pt_br', 'Português (Brasil)'], ['pt_pt', 'Português (Portugal)'],
  ['nl_nl', 'Nederlands'], ['pl_pl', 'Polski'], ['ru_ru', 'Русский'], ['tr_tr', 'Türkçe'], ['ja_jp', '日本語'],
  ['ko_kr', '한국어'], ['zh_cn', '简体中文']
]

const SOUNDS: [string, string][] = [
  ['master', 'Volume général'], ['music', 'Musique'], ['record', 'Juke-box'], ['weather', 'Météo'],
  ['block', 'Blocs'], ['hostile', 'Créatures hostiles'], ['neutral', 'Créatures amicales'], ['player', 'Joueurs'],
  ['ambient', 'Ambiance'], ['voice', 'Voix']
]

const KEY_GROUPS: [string, [string, string][]][] = [
  ['Déplacement', [['forward', 'Avancer'], ['back', 'Reculer'], ['left', 'Aller à gauche'], ['right', 'Aller à droite'],
    ['jump', 'Sauter'], ['sneak', "S'accroupir"], ['sprint', 'Courir']]],
  ['Actions', [['attack', 'Attaquer / détruire'], ['use', 'Utiliser / placer'], ['pickItem', 'Choisir le bloc'],
    ['drop', "Jeter l'objet"], ['swapOffhand', 'Échanger de main']]],
  ['Inventaire', [['inventory', 'Inventaire'], ...Array.from({ length: 9 }, (_, i): [string, string] => [`hotbar.${i + 1}`, `Emplacement ${i + 1}`])]],
  ['Multijoueur', [['chat', 'Ouvrir le chat'], ['command', 'Taper une commande'], ['playerlist', 'Liste des joueurs']]],
  ['Divers', [['screenshot', "Capture d'écran"], ['togglePerspective', 'Changer de vue'], ['fullscreen', 'Plein écran'],
    ['aloriahud.editor', 'Aloria HUD (menu)']]]
]

type Patch = Record<string, string | null>

export default function GameSettingsPage({ onError }: { onError: (message: string) => void }) {
  const [presets, setPresets] = useState<SettingsPreset[]>([])
  const [currentId, setCurrentId] = useState('main')
  const [newName, setNewName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [capturing, setCapturing] = useState<string | null>(null)

  const refresh = useCallback(async () => setPresets(await window.aloria.presets.list()), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const preset = presets.find((p) => p.id === currentId) ?? presets[0]
  const o = preset?.options ?? {}

  const set = async (patch: Patch) => {
    if (!preset) return
    // Mise à jour immédiate à l'écran, puis enregistrement
    setPresets((list) =>
      list.map((p) => {
        if (p.id !== preset.id) return p
        const options = { ...p.options }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete options[k]
          else options[k] = v
        }
        return { ...p, options }
      })
    )
    await window.aloria.presets.update(preset.id, patch)
  }

  // Capture d'une touche : prochaine touche du clavier ou clic de souris (Échap annule)
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      const key = e.code === 'Escape' ? null : keyFromCode(e.code)
      if (key) set({ [`key_key.${capturing}`]: key })
      setCapturing(null)
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      set({ [`key_key.${capturing}`]: keyFromMouse(e.button) })
      setCapturing(null)
    }
    // Le clic qui a ouvert la capture ne doit pas être pris pour la nouvelle touche
    const timer = setTimeout(() => window.addEventListener('mousedown', onMouse, { once: true }), 50)
    window.addEventListener('keydown', onKey, { once: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse)
    }
  }, [capturing])

  if (!preset) return null

  const num = (key: string, fallback: number) => (o[key] !== undefined ? Number(o[key]) : fallback)
  const bool = (key: string, fallback = false) => (o[key] !== undefined ? o[key] === 'true' : fallback)
  const percent = (key: string, fallback: number) => Math.round(num(key, fallback) * 100)
  const offOrPercent = (v: number) => (v === 0 ? 'Désactivé' : `${v} %`)
  const fov = Math.round(70 + num('fov', 0) * 40)
  const maxFps = num('maxFps', 120)

  const create = async () => {
    if (!newName?.trim()) return
    const created = await window.aloria.presets.create(newName.trim(), preset.id)
    setNewName(null)
    await refresh()
    setCurrentId(created.id)
  }

  return (
    <section className="page wide game-settings">
      <h2>Réglages du jeu</h2>
      <p className="muted">
        Appliqués au lancement de chaque profil qui utilise ce jeu de réglages, y compris en 1.8 (touches et langue
        converties). Ce que tu changes en jeu y est enregistré à la fermeture.
      </p>

      <div className="preset-bar">
        {presets.map((p) =>
          renaming === p.id ? (
            <input
              key={p.id}
              className="preset-input"
              autoFocus
              defaultValue={p.name}
              maxLength={24}
              onBlur={async (e) => {
                if (e.target.value.trim()) await window.aloria.presets.rename(p.id, e.target.value.trim())
                setRenaming(null)
                refresh()
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button
              key={p.id}
              className={'preset-chip' + (p.id === preset.id ? ' active' : '')}
              onClick={() => {
                setCurrentId(p.id)
                setConfirmDelete(false)
              }}
              onDoubleClick={() => p.id !== 'main' && setRenaming(p.id)}
              title={p.id !== 'main' ? 'Double-clic pour renommer' : undefined}
            >
              {p.name}
            </button>
          )
        )}
        {newName === null ? (
          <button className="preset-chip add" onClick={() => setNewName('')}>
            ＋ Nouveau
          </button>
        ) : (
          <input
            className="preset-input"
            autoFocus
            placeholder="Nom (ex. PvP 1.8)"
            maxLength={24}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
              if (e.key === 'Escape') setNewName(null)
            }}
            onBlur={() => (newName.trim() ? create() : setNewName(null))}
          />
        )}
        {preset.id !== 'main' &&
          (confirmDelete ? (
            <button
              className="danger-btn small"
              onClick={async () => {
                const res = await window.aloria.presets.remove(preset.id)
                if (!res.ok) onError(res.error)
                setConfirmDelete(false)
                setCurrentId('main')
                refresh()
              }}
            >
              Confirmer la suppression
            </button>
          ) : (
            <button className="link-danger" onClick={() => setConfirmDelete(true)}>
              Supprimer « {preset.name} »
            </button>
          ))}
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>Général</h3>
          <Row label="Langue">
            <select value={o.lang ?? 'fr_fr'} onChange={(e) => set({ lang: e.target.value })}>
              {LANGUAGES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Row>
          <Slider label="Champ de vision" value={fov} min={30} max={110} display={(v) => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : `${v}°`)}
            onChange={(v) => set({ fov: String((v - 70) / 40) })} />
          <Slider label="Luminosité" value={Math.round(num('gamma', 0.5) * 100)} min={0} max={100} display={(v) => (v === 0 ? 'Sombre' : v === 100 ? 'Lumineux' : `${v} %`)}
            onChange={(v) => set({ gamma: String(v / 100) })} />
          <Slider label="Distance de rendu" value={num('renderDistance', 12)} min={2} max={32} display={(v) => `${v} tronçons`}
            onChange={(v) => set({ renderDistance: String(v) })} />
          <Row label="Taille de l'interface">
            <select value={o.guiScale ?? '0'} onChange={(e) => set({ guiScale: e.target.value })}>
              <option value="0">Auto</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </Row>
          <Slider label="FPS maximum" value={maxFps} min={10} max={260} step={10} display={(v) => (v >= 260 ? 'Illimité' : `${v} FPS`)}
            onChange={(v) => set({ maxFps: String(v) })} />
          <Toggle label="Synchronisation verticale" value={bool('enableVsync', true)} onChange={(v) => set({ enableVsync: String(v) })} />
          <Toggle label="Plein écran" value={bool('fullscreen')} onChange={(v) => set({ fullscreen: String(v) })} />
        </div>

        <div className="card">
          <h3>Souris et contrôles</h3>
          <Slider label="Sensibilité" value={Math.round(num('mouseSensitivity', 0.5) * 200)} min={0} max={200} display={(v) => `${v} %`}
            onChange={(v) => set({ mouseSensitivity: String(v / 200) })} />
          <Toggle label="Entrée brute (sans accélération Windows)" value={bool('rawMouseInput', true)} onChange={(v) => set({ rawMouseInput: String(v) })} />
          <Toggle label="Inverser la souris" value={bool('invertYMouse')} onChange={(v) => set({ invertYMouse: String(v) })} />
          <Toggle label="Saut automatique" value={bool('autoJump')} onChange={(v) => set({ autoJump: String(v) })} />
          <Toggle label="S'accroupir : basculer" value={bool('toggleCrouch')} onChange={(v) => set({ toggleCrouch: String(v) })} />
          <Toggle label="Courir : basculer" value={bool('toggleSprint')} onChange={(v) => set({ toggleSprint: String(v) })} />
          <Slider label="Opacité du chat" value={Math.round(num('chatOpacity', 1) * 100)} min={10} max={100} display={(v) => `${v} %`}
            onChange={(v) => set({ chatOpacity: String(v / 100) })} />

          <h3 className="spaced">Son</h3>
          {SOUNDS.map(([id, label]) => (
            <Slider key={id} label={label} value={Math.round(num(`soundCategory_${id}`, 1) * 100)} min={0} max={100}
              display={(v) => (v === 0 ? 'Coupé' : `${v} %`)} onChange={(v) => set({ [`soundCategory_${id}`]: String(v / 100) })} />
          ))}
        </div>

        <div className="card">
          <h3>Accessibilité</h3>
          <p className="muted small">Mouvements de caméra et effets visuels. Certains n'existent pas dans les anciennes versions.</p>
          <Toggle label="Balancement de la vue" value={bool('viewBobbing', true)} onChange={(v) => set({ viewBobbing: String(v) })} />
          <Slider label="Inclinaison aux dégâts" value={percent('damageTiltStrength', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ damageTiltStrength: String(v / 100) })} />
          <Slider label="FOV dynamique" value={percent('fovEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ fovEffectScale: String(v / 100) })} />
          <Slider label="Distorsion (nausée, portail)" value={percent('screenEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ screenEffectScale: String(v / 100) })} />
          <Slider label="Pulsation de l'obscurité" value={percent('darknessEffectScale', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ darknessEffectScale: String(v / 100) })} />
          <Toggle label="Masquer les flashs d'éclair" value={bool('hideLightningFlashes')} onChange={(v) => set({ hideLightningFlashes: String(v) })} />
          <Toggle label="Tourner avec le wagonnet" value={bool('rotateWithMinecart')} onChange={(v) => set({ rotateWithMinecart: String(v) })} />
          <Slider label="Scintillement : vitesse" value={percent('glintSpeed', 0.5)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ glintSpeed: String(v / 100) })} />
          <Slider label="Scintillement : intensité" value={percent('glintStrength', 0.75)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ glintStrength: String(v / 100) })} />
          <Slider label="Flou des menus" value={num('menuBackgroundBlurriness', 5)} min={0} max={10} display={(v) => (v === 0 ? 'Désactivé' : String(v))}
            onChange={(v) => set({ menuBackgroundBlurriness: String(v) })} />
          <Slider label="Vitesse du panorama" value={percent('panoramaScrollSpeed', 1)} min={0} max={100} display={offOrPercent}
            onChange={(v) => set({ panoramaScrollSpeed: String(v / 100) })} />
          <Toggle label="Logo de chargement noir" value={bool('darkMojangStudiosBackground')} onChange={(v) => set({ darkMojangStudiosBackground: String(v) })} />
          <Toggle label="Masquer les textes du menu" value={bool('hideSplashTexts')} onChange={(v) => set({ hideSplashTexts: String(v) })} />

          <h3 className="spaced">Texte et chat</h3>
          <Toggle label="Sous-titres" value={bool('showSubtitles')} onChange={(v) => set({ showSubtitles: String(v) })} />
          <Row label="Narrateur">
            <select value={o.narrator ?? '0'} onChange={(e) => set({ narrator: e.target.value })}>
              <option value="0">Désactivé</option>
              <option value="1">Tout</option>
              <option value="2">Chat</option>
              <option value="3">Système</option>
            </select>
          </Row>
          <Slider label="Fond du texte" value={percent('textBackgroundOpacity', 0.5)} min={0} max={100} display={(v) => `${v} %`}
            onChange={(v) => set({ textBackgroundOpacity: String(v / 100) })} />
          <Toggle label="Fond pour le chat seulement" value={bool('backgroundForChatOnly', true)} onChange={(v) => set({ backgroundForChatOnly: String(v) })} />
          <Slider label="Interligne du chat" value={percent('chatLineSpacing', 0)} min={0} max={100} display={(v) => `${v} %`}
            onChange={(v) => set({ chatLineSpacing: String(v / 100) })} />
          <Slider label="Durée des notifications" value={Math.round(num('notificationDisplayTime', 1) * 10)} min={5} max={100}
            display={(v) => `×${(v / 10).toFixed(1)}`} onChange={(v) => set({ notificationDisplayTime: String(v / 10) })} />
          <Toggle label="Contour de bloc contrasté" value={bool('highContrastBlockOutline')} onChange={(v) => set({ highContrastBlockOutline: String(v) })} />
        </div>

        <div className="card keys">
          <h3>Touches</h3>
          <p className="muted small">Clique sur une touche, puis appuie sur la nouvelle (ou clique avec la souris). Échap annule.</p>
          {KEY_GROUPS.map(([group, keys]) => (
            <div key={group} className="key-group">
              <span className="key-group__title">{group}</span>
              {keys.map(([id, label]) => (
                <div key={id} className="key-row">
                  <span>{label}</span>
                  <button className={'key-btn' + (capturing === id ? ' capturing' : '')} onClick={() => setCapturing(capturing === id ? null : id)}>
                    {capturing === id ? 'Appuie sur une touche…' : keyLabel(o[`key_key.${id}`])}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string | ((v: number) => string)
  onChange: (v: number) => void
}

/** Curseur : affichage en direct pendant le glisser, enregistrement au relâchement */
function Slider({ label, value, min, max, step = 1, display, onChange }: SliderProps) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  const text = typeof display === 'function' ? display(local) : display
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="slider-line">
        <input
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={local}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onChange(local)}
          onKeyUp={() => onChange(local)}
        />
        <strong>{text}</strong>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </label>
    </div>
  )
}
