# Aloria — notes pour Claude

Launcher Minecraft perso d'Alykell (« Aloria Client »), répondre **en français**.
Electron 44 + electron-vite + React 19 + TypeScript (`src/`), mod Fabric **Aloria HUD** (`mod/`) pour 26.3, 26.2, 1.21.11, 1.21.8, 1.21.4, 1.21.1, 1.20.4 et 1.20.1.
Données du jeu : `%APPDATA%\.aloria` (profils, instances, `shared/` = serveurs et jeux de réglages communs).

## Publication
- Changer `version` dans `package.json`, commit, `git tag vX.Y.Z`, push du tag → GitHub Actions
  (`.github/workflows/release.yml`) compile le mod pour chaque version, construit l'installeur, publie
  (brouillon créé avant l'envoi des fichiers, sinon doublons). `npm run dist` en local échoue (Windows bloque l'exe non signé).
- Le launcher installé se met à jour seul. Windows (contrôle intelligent des applications) bloque l'installeur non signé :
  mise à jour **légère** d'abord (`src/main/lightUpdate.ts` : app.asar + jars de `aloria-light.json`, remplacés par
  Aloria.exe en mode Node), l'installeur complet (electron-updater) seulement si Electron change.

## Mod multi-version (`mod/`)
- Code écrit pour **26.3** (référence). `./gradlew build -Pminecraft_version=1.21.11` : `buildSrc/PreprocessTask` copie le code
  dans `build/preprocessed/<version>` en activant les blocs `//#if MC >= 12109` … `//#else` / `//$$ code` … `//#endif`
  (1.21.11 = 12111, 26.3 = 260300), puis applique les renommages de `build.gradle` (`renameSteps` : chaque liste vaut pour
  toutes les versions sous son seuil, ex. `GuiGraphicsExtractor => GuiGraphics`). Dessin 2D qui diffère : classe `Gfx`.
- Code compatible Java 17 (1.20.x) : pas de `Math.clamp` (→ `Mth.clamp`), ni `getFirst/addFirst/removeLast` sur les listes.
- Avant 1.21 les polices TTF passent par STB : `processResources` agrandit leur `size` (rapport hhea).
- Versions, Fabric API et Java : table `targets` de `mod/build.gradle` ; liste côté launcher : `src/shared/aloriaHud.ts`.
- 1.21.x obfusqué (plugin `fabric-loom-remap`, noms Mojang au build) : pas de réflexion par nom à l'exécution → invokers mixin.
- Sources décompilées : `./gradlew genSources -Pminecraft_version=X` (jar `-sources` dans `.gradle/loom-cache/minecraftMaven`).

## Pièges Minecraft 26.x (non obfusqué, noms Mojang)
- Rendu : `GuiGraphicsExtractor`, `extractRenderState` ; écrans : `mc.gui.setScreen(...)`.
- Touches = scancodes SDL ; souris : **gauche = 1, droit = 3** (`InputConstants.MOUSE_BUTTON_*`).
- `RenderPipeline` a changé de package entre 26.2 et 26.3 → un jar par version.
- Pas d'`ItemStack` sans monde chargé (« Components not bound »).

## Tests (mode développement, sans compte)
- Auto-test du HUD en jeu : profils `selftest` (26.3, monde `Demo_World`), `selftest<version sans points>` (12111, 1218, 1214…)
  (sans `--quickPlay` : l'auto-test passe l'écran d'accessibilité et clique « Jouer la démo ») et `selftest262` (menu seul) ;
  variables : `ALORIA_USER_DATA=<dossier temp>` (isole du launcher installé), `ALORIA_AUTOPLAY=1`,
  `ALORIA_TEST_DEMO=1`, `ALORIA_AUTOPLAY_PROFILE=selftest`, `ALORIA_DEBUG=1`,
  `ALORIA_EXTRA_JVM_ARGS="-Daloriahud.selftest=<dossier captures> [-Daloriahud.selftest.menu=1]"`,
  `ALORIA_EXTRA_GAME_ARGS="--quickPlaySingleplayer Demo_World"`, puis `npm run dev` ; résultats dans `logs/latest.log` (`[selftest]`).
- Captures du launcher jour/nuit : `ALORIA_CAPTURE=<dossier>` + `npm run dev`.
- Ne jamais toucher aux profils de l'utilisateur (`hudtest`, `2a1705be` « thereturn » en 26.2) pendant les tests.
