import { codeToName, nameToCode } from '../../shared/keyCodes'
import type { Lang } from '../../shared/i18n'
import { getLang, t } from './i18n'

/**
 * Touches Minecraft (« key.keyboard.w », « key.mouse.left »…) ↔ touches du clavier du navigateur.
 * Les deux désignent des positions physiques nommées d'après le clavier QWERTY américain :
 * « key.keyboard.w » est la touche Z d'un clavier AZERTY.
 */

const LABELS: Record<Lang, Record<string, string>> = {
  fr: {
    escape: 'Échap', backspace: 'Retour arrière', tab: 'Tab', enter: 'Entrée', space: 'Espace', 'caps.lock': 'Verr. Maj',
    'left.shift': 'Maj gauche', 'right.shift': 'Maj droite', 'left.control': 'Ctrl gauche', 'right.control': 'Ctrl droit',
    'left.alt': 'Alt', 'right.alt': 'Alt Gr', up: '↑', down: '↓', left: '←', right: '→', home: 'Début', end: 'Fin',
    'page.up': 'Page préc.', 'page.down': 'Page suiv.', insert: 'Inser', delete: 'Suppr', 'keypad.enter': 'Entrée (pavé)',
    'keypad.add': '+ (pavé)', 'keypad.subtract': '- (pavé)', 'keypad.multiply': '* (pavé)', 'keypad.divide': '/ (pavé)',
    'keypad.decimal': '. (pavé)'
  },
  en: {
    escape: 'Esc', backspace: 'Backspace', tab: 'Tab', enter: 'Enter', space: 'Space', 'caps.lock': 'Caps Lock',
    'left.shift': 'Left Shift', 'right.shift': 'Right Shift', 'left.control': 'Left Ctrl', 'right.control': 'Right Ctrl',
    'left.alt': 'Left Alt', 'right.alt': 'Right Alt', up: '↑', down: '↓', left: '←', right: '→', home: 'Home', end: 'End',
    'page.up': 'Page Up', 'page.down': 'Page Down', insert: 'Insert', delete: 'Delete', 'keypad.enter': 'Keypad Enter',
    'keypad.add': 'Keypad +', 'keypad.subtract': 'Keypad -', 'keypad.multiply': 'Keypad *', 'keypad.divide': 'Keypad /',
    'keypad.decimal': 'Keypad .'
  }
}

const MOUSE_LABELS: Record<Lang, Record<string, string>> = {
  fr: { left: 'Clic gauche', right: 'Clic droit', middle: 'Clic molette', '4': 'Bouton souris 4', '5': 'Bouton souris 5' },
  en: { left: 'Left Click', right: 'Right Click', middle: 'Middle Click', '4': 'Mouse Button 4', '5': 'Mouse Button 5' }
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
  if (!value) return t('keys.default')
  if (value === 'key.keyboard.unknown') return t('keys.none')
  if (value.startsWith('key.mouse.')) return MOUSE_LABELS[getLang()][value.slice(10)] ?? value
  const name = value.slice('key.keyboard.'.length)
  if (LABELS[getLang()][name]) return LABELS[getLang()][name]
  const code = nameToCode(name)
  const char = code ? layout?.get(code) : undefined
  if (char) return char.toUpperCase()
  return name.length === 1 ? name.toUpperCase() : name.replace('keypad.', t('keys.keypad')).toUpperCase()
}
