import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Clé de l'API CurseForge : secret de la CI, jamais dans le dépôt (vide : fichier ~/.aloria-curseforge-key)
    define: { __CURSEFORGE_KEY__: JSON.stringify(process.env.CURSEFORGE_API_KEY ?? '') }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
