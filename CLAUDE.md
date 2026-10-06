# Aloria — notes pour Claude

Launcher Minecraft perso d'Alykell (« Aloria Client »), répondre **en français**.
Electron 44 + electron-vite + React 19 + TypeScript (`src/`), mod Fabric **Aloria HUD** en Java 25 (`mod/`).
Données du jeu : `%APPDATA%\.aloria` (profils, instances, `shared/` = serveurs et jeux de réglages communs).

## Publication
- Changer `version` dans `package.json`, commit, `git tag vX.Y.Z`, push du tag → GitHub Actions
  (`.github/workflows/release.yml`) compile le mod pour 26.3 **et** 26.2, construit l'installeur, publie
  (brouillon créé avant l'envoi des fichiers, sinon doublons). `npm run dist` en local échoue (Windows bloque l'exe non signé).
- Le launcher installé se met à jour seul (electron-updater, GitHub Releases).

## Pièges Minecraft 26.x (non obfusqué, noms Mojang)
- Rendu : `GuiGraphicsExtractor`, `extractRenderState` ; écrans : `mc.gui.setScreen(...)`.
- Touches = scancodes SDL ; souris : **gauche = 1, droit = 3** (`InputConstants.MOUSE_BUTTON_*`).
- `RenderPipeline` a changé de package entre 26.2 et 26.3 → un jar par version
  (`./gradlew build -Pminecraft_version=26.2 -Pfabric_api_version=0.161.0+26.2`). Liste : `src/shared/aloriaHud.ts`.
- Pas d'`ItemStack` sans monde chargé (« Components not bound »).

## Tests (mode développement, sans compte)
- Auto-test du HUD en jeu : profils `selftest` (26.3, monde `Demo_World`) et `selftest262` (menu seul) ;
  variables : `ALORIA_USER_DATA=<dossier temp>` (isole du launcher installé), `ALORIA_AUTOPLAY=1`,
  `ALORIA_TEST_DEMO=1`, `ALORIA_AUTOPLAY_PROFILE=selftest`, `ALORIA_DEBUG=1`,
  `ALORIA_EXTRA_JVM_ARGS="-Daloriahud.selftest=<dossier captures> [-Daloriahud.selftest.menu=1]"`,
  `ALORIA_EXTRA_GAME_ARGS="--quickPlaySingleplayer Demo_World"`, puis `npm run dev` ; résultats dans `logs/latest.log` (`[selftest]`).
- Captures du launcher jour/nuit : `ALORIA_CAPTURE=<dossier>` + `npm run dev`.
- Ne jamais toucher aux profils de l'utilisateur (`hudtest`, `2a1705be` « thereturn » en 26.2) pendant les tests.
