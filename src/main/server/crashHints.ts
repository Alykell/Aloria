import { tm } from '../i18n'

/**
 * Crashs de serveur fréquents, reconnus dans la console : une explication simple remplace « regarde la console ».
 * Chaque cas lit les lignes du démarrage (les plus précis d'abord) et rend le message, ou null s'il ne s'applique pas.
 */
type Hint = (text: string, port: number) => string | null

const first = (text: string, re: RegExp) => re.exec(text)?.slice(1).find(Boolean) ?? null
const unique = (items: string[]) => [...new Set(items)]

const HINTS: Hint[] = [
  // LibLoader (TickProfiler…) télécharge ses bibliothèques sur jcenter, fermé depuis 2021
  (text) => (/LibLoader/.test(text) && /jcenter\.bintray\.com|FileNotFoundException: https?:\/\//.test(text) ? tm('hint.jcenter') : null),
  // Mod d'affichage sur un serveur : il cherche les classes du jeu côté joueur (net/minecraft/client), absentes ici
  (text) => {
    if (!/net[/.]minecraft[/.]client|invalid dist DEDICATED_SERVER|Environment type SERVER is invalid/.test(text)) return null
    const mod =
      first(text, /Mod File: .*?([^/\\]+\.jar)/) ??
      first(text, /Caught exception from (.+?) \(/) ??
      first(text, /provided by '([^']+)'/)
    return mod ? tm('hint.clientMod', { mod }) : tm('hint.clientModUnknown')
  },
  // Dépendances absentes : Fabric (« requires … of X, which is missing »), Forge 1.13+ (« Mod ID: 'x' »), Forge 1.12 (« requires [x@ »)
  (text) => {
    const missing = unique([
      ...[...text.matchAll(/requires [^\n]*? of '?([\w.-]+)'?, which is missing/g)].map((m) => m[1]),
      ...(/Missing or unsupported mandatory dependencies/.test(text) ? [...text.matchAll(/Mod ID: '([^']+)'/g)].map((m) => m[1]) : []),
      ...[...text.matchAll(/MissingModsException.*?requires \[([^@\]]+)/g)].map((m) => m[1])
    ])
    return missing.length > 0 ? tm('hint.missingMods', { mods: missing.join(', ') }) : null
  },
  (text) => (/UnsupportedClassVersionError/.test(text) ? tm('hint.javaVersion') : null),
  (text) => (/java\.lang\.OutOfMemoryError/.test(text) ? tm('hint.memory') : null),
  (text, port) => (/FAILED TO BIND TO PORT|Address already in use/i.test(text) ? tm('hint.port', { port: String(port) }) : null),
  (text) => {
    const mod = first(text, /Mixin apply for mod ([\w-]+) failed|from mod ([\w-]+)\] failed/)
    return mod ? tm('hint.mixin', { mod }) : null
  }
]

/** Explication d'un crash d'après la console du démarrage, ou null si aucun cas connu ne correspond */
export function crashHint(lines: string[], port: number): string | null {
  const text = lines.join('\n')
  for (const hint of HINTS) {
    const message = hint(text, port)
    if (message) return message
  }
  return null
}
