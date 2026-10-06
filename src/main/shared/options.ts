/**
 * Lecture / écriture d'options.txt et conversion entre le format moderne (1.13+) et l'ancien (1.12 et avant).
 * Les réglages partagés sont toujours stockés au format moderne.
 */

/** Réglages communs à toutes les versions, synchronisés entre profils (les touches s'y ajoutent) */
export const SYNCED_OPTIONS = [
  'lang',
  'fov',
  'gamma',
  'guiScale',
  'renderDistance',
  'maxFps',
  'enableVsync',
  'fullscreen',
  'viewBobbing',
  'mouseSensitivity',
  'invertYMouse',
  'autoJump',
  'toggleCrouch',
  'toggleSprint',
  'chatOpacity',
  'chatScale',
  'soundCategory_master',
  'soundCategory_music',
  'soundCategory_record',
  'soundCategory_weather',
  'soundCategory_block',
  'soundCategory_hostile',
  'soundCategory_neutral',
  'soundCategory_player',
  'soundCategory_ambient',
  'soundCategory_voice'
]

/** Touches qui existent aussi dans les anciennes versions (1.8 à 1.12) */
const LEGACY_KEYS = new Set([
  'attack', 'use', 'forward', 'left', 'back', 'right', 'jump', 'sneak', 'sprint', 'drop', 'inventory', 'chat',
  'playerlist', 'pickItem', 'command', 'screenshot', 'togglePerspective', 'smoothCamera', 'fullscreen',
  'spectatorOutlines', 'hotbar.1', 'hotbar.2', 'hotbar.3', 'hotbar.4', 'hotbar.5', 'hotbar.6', 'hotbar.7', 'hotbar.8', 'hotbar.9'
])

export const isSyncedKey = (key: string) => SYNCED_OPTIONS.includes(key) || key.startsWith('key_key.')

/** Versions d'avant la 1.13 : touches en codes numériques LWJGL 2, langue en « fr_FR » */
export function isLegacyVersion(gameVersion: string): boolean {
  const m = /^1\.(\d+)/.exec(gameVersion)
  return !!m && Number(m[1]) < 13
}

// Codes de touches LWJGL 2 (positions physiques, nommées d'après le clavier QWERTY américain)
const LWJGL2: Record<string, number> = {
  escape: 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11, minus: 12, equal: 13,
  backspace: 14, tab: 15, q: 16, w: 17, e: 18, r: 19, t: 20, y: 21, u: 22, i: 23, o: 24, p: 25, 'left.bracket': 26,
  'right.bracket': 27, enter: 28, 'left.control': 29, a: 30, s: 31, d: 32, f: 33, g: 34, h: 35, j: 36, k: 37, l: 38,
  semicolon: 39, apostrophe: 40, 'grave.accent': 41, 'left.shift': 42, backslash: 43, z: 44, x: 45, c: 46, v: 47, b: 48,
  n: 49, m: 50, comma: 51, period: 52, slash: 53, 'right.shift': 54, 'keypad.multiply': 55, 'left.alt': 56, space: 57,
  'caps.lock': 58, f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, 'num.lock': 69,
  'scroll.lock': 70, 'keypad.7': 71, 'keypad.8': 72, 'keypad.9': 73, 'keypad.subtract': 74, 'keypad.4': 75,
  'keypad.5': 76, 'keypad.6': 77, 'keypad.add': 78, 'keypad.1': 79, 'keypad.2': 80, 'keypad.3': 81, 'keypad.0': 82,
  'keypad.decimal': 83, f11: 87, f12: 88, 'keypad.enter': 156, 'right.control': 157, 'keypad.divide': 181,
  'right.alt': 184, pause: 197, home: 199, up: 200, 'page.up': 201, left: 203, right: 205, end: 207, down: 208,
  'page.down': 209, insert: 210, delete: 211
}
const LWJGL2_REVERSE = Object.fromEntries(Object.entries(LWJGL2).map(([name, code]) => [code, name]))
// Boutons de souris : codes négatifs dans l'ancien format
const MOUSE: Record<string, number> = { left: -100, right: -99, middle: -98, '4': -97, '5': -96 }
const MOUSE_REVERSE = Object.fromEntries(Object.entries(MOUSE).map(([name, code]) => [code, name]))

function keyToLegacy(value: string): string | null {
  if (value === 'key.keyboard.unknown') return '0'
  if (value.startsWith('key.mouse.')) {
    const code = MOUSE[value.slice('key.mouse.'.length)]
    return code !== undefined ? String(code) : null
  }
  if (value.startsWith('key.keyboard.')) {
    const code = LWJGL2[value.slice('key.keyboard.'.length)]
    return code !== undefined ? String(code) : null
  }
  return null
}

function keyFromLegacy(value: string): string | null {
  const code = Number(value)
  if (!Number.isFinite(code)) return null
  if (code === 0) return 'key.keyboard.unknown'
  if (code < 0) return MOUSE_REVERSE[code] ? `key.mouse.${MOUSE_REVERSE[code]}` : null
  return LWJGL2_REVERSE[code] ? `key.keyboard.${LWJGL2_REVERSE[code]}` : null
}

/** « fr_fr » → « fr_FR » */
const langToLegacy = (lang: string) => lang.replace(/_([a-z]+)$/, (_, region: string) => '_' + region.toUpperCase())

/** Réglage moderne → valeur à écrire dans une ancienne version (null = n'existe pas en ancien format) */
export function toLegacy(key: string, value: string): string | null {
  if (key === 'lang') return langToLegacy(value)
  if (key.startsWith('key_key.')) return LEGACY_KEYS.has(key.slice('key_key.'.length)) ? keyToLegacy(value) : null
  return value
}

export function fromLegacy(key: string, value: string): string | null {
  if (key === 'lang') return value.toLowerCase()
  if (key.startsWith('key_key.')) return LEGACY_KEYS.has(key.slice('key_key.'.length)) ? keyFromLegacy(value) : null
  return value
}

/** options.txt → liste ordonnée de paires clé/valeur (l'ordre et les réglages inconnus sont préservés) */
export function parseOptions(text: string): [string, string][] {
  const entries: [string, string][] = []
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) entries.push([line.slice(0, i), line.slice(i + 1)])
  }
  return entries
}

export function serializeOptions(entries: [string, string][]): string {
  return entries.map(([k, v]) => `${k}:${v}`).join('\n') + '\n'
}
