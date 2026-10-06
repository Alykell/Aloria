/**
 * Touches Minecraft (« key.keyboard.w », « key.mouse.left »…) ↔ touches du clavier du navigateur.
 * Les deux désignent des positions physiques nommées d'après le clavier QWERTY américain :
 * « key.keyboard.w » est la touche Z d'un clavier AZERTY.
 */

const SPECIAL: Record<string, string> = {
  escape: 'Escape', minus: 'Minus', equal: 'Equal', backspace: 'Backspace', tab: 'Tab',
  'left.bracket': 'BracketLeft', 'right.bracket': 'BracketRight', enter: 'Enter', 'left.control': 'ControlLeft',
  semicolon: 'Semicolon', apostrophe: 'Quote', 'grave.accent': 'Backquote', 'left.shift': 'ShiftLeft',
  backslash: 'Backslash', comma: 'Comma', period: 'Period', slash: 'Slash', 'right.shift': 'ShiftRight',
  'left.alt': 'AltLeft', space: 'Space', 'caps.lock': 'CapsLock', 'right.alt': 'AltRight', 'right.control': 'ControlRight',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', home: 'Home', end: 'End',
  'page.up': 'PageUp', 'page.down': 'PageDown', insert: 'Insert', delete: 'Delete', 'num.lock': 'NumLock',
  'scroll.lock': 'ScrollLock', pause: 'Pause', menu: 'ContextMenu', 'print.screen': 'PrintScreen', 'world.2': 'IntlBackslash',
  'keypad.add': 'NumpadAdd', 'keypad.subtract': 'NumpadSubtract', 'keypad.multiply': 'NumpadMultiply',
  'keypad.divide': 'NumpadDivide', 'keypad.decimal': 'NumpadDecimal', 'keypad.enter': 'NumpadEnter'
}
const SPECIAL_REVERSE = Object.fromEntries(Object.entries(SPECIAL).map(([k, v]) => [v, k]))

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

/** « key.keyboard.w » → « KeyW » (code du navigateur) */
function toCode(name: string): string | null {
  if (/^[a-z]$/.test(name)) return 'Key' + name.toUpperCase()
  if (/^[0-9]$/.test(name)) return 'Digit' + name
  if (/^f\d{1,2}$/.test(name)) return name.toUpperCase()
  if (/^keypad\.[0-9]$/.test(name)) return 'Numpad' + name.slice(-1)
  return SPECIAL[name] ?? null
}

/** Code du navigateur (KeyboardEvent.code) → touche Minecraft */
export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return 'key.keyboard.' + code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return 'key.keyboard.' + code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return 'key.keyboard.' + code.toLowerCase()
  if (/^Numpad[0-9]$/.test(code)) return 'key.keyboard.keypad.' + code.slice(6)
  const special = SPECIAL_REVERSE[code]
  return special ? 'key.keyboard.' + special : null
}

/** Bouton de souris (MouseEvent.button) → touche Minecraft */
export function keyFromMouse(button: number): string {
  return 'key.mouse.' + (['left', 'middle', 'right', '4', '5'][button] ?? 'left')
}

// Disposition du clavier de l'utilisateur (AZERTY…), pour afficher le vrai caractère des touches
let layout: Map<string, string> | null = null
type KeyboardWithLayout = { getLayoutMap?: () => Promise<Map<string, string>> }
const kb = (navigator as unknown as { keyboard?: KeyboardWithLayout }).keyboard
kb?.getLayoutMap?.().then((map) => (layout = map)).catch(() => {})

/** Libellé lisible d'une touche Minecraft, selon le clavier de l'utilisateur */
export function keyLabel(value: string | undefined): string {
  // Absente du jeu de réglages : le jeu garde sa touche par défaut
  if (!value) return 'Par défaut'
  if (value === 'key.keyboard.unknown') return 'Aucune'
  if (value.startsWith('key.mouse.')) return MOUSE_LABELS[value.slice(10)] ?? value
  const name = value.slice('key.keyboard.'.length)
  if (LABELS[name]) return LABELS[name]
  const code = toCode(name)
  const char = code ? layout?.get(code) : undefined
  if (char) return char.toUpperCase()
  return name.length === 1 ? name.toUpperCase() : name.replace('keypad.', 'Pavé ').toUpperCase()
}
