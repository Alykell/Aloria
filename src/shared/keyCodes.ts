/**
 * Touches Minecraft modernes (« key.keyboard.w ») ↔ codes de touches du navigateur (KeyboardEvent.code, « KeyW »).
 * Les deux désignent des positions physiques nommées d'après le clavier QWERTY américain :
 * « key.keyboard.w » est la touche Z d'un clavier AZERTY. Partagé par l'interface et le processus principal.
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

/** « w » (de key.keyboard.w) → « KeyW » */
export function nameToCode(name: string): string | null {
  if (/^[a-z]$/.test(name)) return 'Key' + name.toUpperCase()
  if (/^[0-9]$/.test(name)) return 'Digit' + name
  if (/^f\d{1,2}$/.test(name)) return name.toUpperCase()
  if (/^keypad\.[0-9]$/.test(name)) return 'Numpad' + name.slice(-1)
  return SPECIAL[name] ?? null
}

/** « KeyW » → « w » (à préfixer par key.keyboard.) */
export function codeToName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase()
  if (/^Numpad[0-9]$/.test(code)) return 'keypad.' + code.slice(6)
  return SPECIAL_REVERSE[code] ?? null
}

/** Disposition du clavier : code physique (« KeyW ») → caractère tapé (« z » en AZERTY) */
export type KeyboardLayout = Record<string, string>
