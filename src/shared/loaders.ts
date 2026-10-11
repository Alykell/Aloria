/**
 * Chargeurs de mods proposés selon la version du jeu (partagé par l'interface et le processus principal).
 * Avant la 1.16.5, ni Sodium ni Iris : on joue avec OptiFine, donc avec Forge.
 */

/** [majeur, mineur, correctif] d'une version numérotée (« 1.20.1 », « 26.3 »), null pour un snapshot */
function parse(gameVersion: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(gameVersion)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

/** Forge installable par le launcher : toutes les versions numérotées (la liste de Forge dit lesquelles existent) */
export function forgeSupported(gameVersion: string): boolean {
  return parse(gameVersion) !== null
}

/** NeoForge existe à partir de la 1.20.2 (avant, c'était encore Forge) */
export function neoforgeSupported(gameVersion: string): boolean {
  const v = parse(gameVersion)
  if (!v) return false
  if (v[0] >= 26) return true
  return v[0] === 1 && (v[1] > 20 || (v[1] === 20 && v[2] >= 2))
}

/** Versions où Forge passe avant Fabric : 1.12.2 et avant, toutes d'avant Sodium et Iris */
export function prefersForge(gameVersion: string): boolean {
  const v = parse(gameVersion)
  return !!v && v[0] === 1 && v[1] <= 12
}
