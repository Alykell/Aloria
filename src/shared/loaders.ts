/**
 * Chargeurs de mods proposés selon la version du jeu (partagé par l'interface et le processus principal).
 * Avant la 1.16.5, ni Sodium ni Iris : on joue avec OptiFine, donc avec Forge.
 */

/** Forge installable par le launcher : 1.12.2 et avant (après, son installeur recompile le jeu) */
export function forgeSupported(gameVersion: string): boolean {
  const m = /^1\.(\d+)(?:\.|$)/.exec(gameVersion)
  return !!m && Number(m[1]) <= 12
}

/** Versions où Forge passe avant Fabric : celles qu'il gère, toutes d'avant Sodium et Iris */
export const prefersForge = forgeSupported
