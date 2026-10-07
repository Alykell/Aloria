/** Versions de Minecraft compatibles avec le mod Aloria HUD (voir mod/src/main/resources/fabric.mod.json) */
export const ALORIA_HUD_MC_VERSIONS = ['1.20.1', '1.20.4', '1.21.1', '1.21.4', '1.21.8', '1.21.11', '26.2', '26.3']

/** « 1.21.8, 1.21.11, 26.2 et 26.3 » */
export const ALORIA_HUD_MC_LABEL = `${ALORIA_HUD_MC_VERSIONS.slice(0, -1).join(', ')} et ${ALORIA_HUD_MC_VERSIONS.at(-1)}`
