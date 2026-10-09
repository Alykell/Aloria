/** Versions de Minecraft compatibles avec le mod Aloria HUD (voir mod/src/main/resources/fabric.mod.json) */
export const ALORIA_HUD_MC_VERSIONS = ['1.8.9', '1.20.1', '1.20.4', '1.21.1', '1.21.4', '1.21.8', '1.21.11', '26.2', '26.3']

/** Versions où Aloria HUD existe sous Forge (mod-forge : le code du mod 1.8.9, converti pour Forge) */
export const ALORIA_HUD_FORGE_VERSIONS = ['1.8.9']

/** Aloria HUD existe-t-il pour ce chargeur et cette version ? */
export function hudAvailable(loader: string, gameVersion: string): boolean {
  if (loader === 'forge') return ALORIA_HUD_FORGE_VERSIONS.includes(gameVersion)
  return loader === 'fabric' && ALORIA_HUD_MC_VERSIONS.includes(gameVersion)
}

/** Versions proposées pour ce chargeur, en toutes lettres (« 1.8.9, 1.20.1… et 26.3 ») ; `and` est le « et » de la langue voulue */
export function hudVersionsLabel(loader: string, and: string): string {
  if (loader === 'forge') return ALORIA_HUD_FORGE_VERSIONS.join(', ')
  return `${ALORIA_HUD_MC_VERSIONS.slice(0, -1).join(', ')} ${and} ${ALORIA_HUD_MC_VERSIONS.at(-1)}`
}
