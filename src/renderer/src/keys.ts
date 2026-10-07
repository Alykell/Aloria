import { codeToName, nameToCode } from '../../shared/keyCodes'

/**
 * Touches Minecraft (« key.keyboard.w », « key.mouse.left »…) ↔ touches du clavier du navigateur.
 * Les deux désignent des positions physiques nommées d'après le clavier QWERTY américain :
 * « key.keyboard.w » est la touche Z d'un clavier AZERTY.
 */

const LABELS: Record<string, string> = {
  escape: 'Échap', backspace: 'Retour arrière', tab: 'Tab', enter: 'Entrée', space: 'Espace', 'caps.lock': 'Verr. Maj',
  'left.shift': 'Maj gauche', 'right.shift': 'Maj droite', 'left.control': 'Ctrl gauche', 'right.control': 'Ctrl droit',
  'left.alt': 'Alt', 'right.alt': 'Alt Gr', up: '↑', down: '↓', left: '←', right: '→', home: 'Début', end: 'Fin',
  'page.up': 'Page préc.', 'page.down': 'Page suiv.', insert: 'Inser', delete: 'Suppr', 'keypad.enter': 'Entrée (pavé)',
  'keypad.add': '+ (pavé)', 'keypad.subtract': '- (pavé)', 'keypad.multiply': '* (pavé)', 'keypad.divide': '/ (pavé)',
  'keypad.decimal': '. (pavé)'
}

const MOUSE_LABELS: Record<string, string> = {
  left: 'Clic gauche', right: 'Clic droit', middle: 'Clic molette', '4': 'Bouton souris 4', '5': 'Bouton souris 5'
}

/** Code du navigateur (KeyboardEvent.code) → touche Minecraft */
export function keyFromCode(code: string): string | null {
  const name = codeToName(code)
  return name ? 'key.keyboard.' + name : null
}

/** Bouton de souris (MouseEvent.button) → touche Minecraft */
export function keyFromMouse(button: number): string {
  return 'key.mouse.' + (['left', 'middle', 'right', '4', '5'][button] ?? 'left')
}

// Disposition du clavier de l'utilisateur (AZERTY…), pour afficher le vrai caractère des touches
let layout: Map<string, string> | null = null
type KeyboardWithLayout = { getLayoutMap?: () => Promise<Map<string, string>> }
const kb = (navigator as unknown as { keyboard?: KeyboardWithLayout }).keyboard
kb?.getLayoutMap?.()
  .then((map) => {
    layout = map
    // Le launcher s'en sert aussi pour convertir les touches des anciennes versions (1.8.9 : codes selon la disposition)
    window.aloria.keyboardLayout(Object.fromEntries(map))
  })
  .catch(() => {})

/** Libellé lisible d'une touche Minecraft, selon le clavier de l'utilisateur */
export function keyLabel(value: string | undefined): string {
  // Absente du jeu de réglages : le jeu garde sa touche par défaut
  if (!value) return 'Par défaut'
  if (value === 'key.keyboard.unknown') return 'Aucune'
  if (value.startsWith('key.mouse.')) return MOUSE_LABELS[value.slice(10)] ?? value
  const name = value.slice('key.keyboard.'.length)
  if (LABELS[name]) return LABELS[name]
  const code = nameToCode(name)
  const char = code ? layout?.get(code) : undefined
  if (char) return char.toUpperCase()
  return name.length === 1 ? name.toUpperCase() : name.replace('keypad.', 'Pavé ').toUpperCase()
}
