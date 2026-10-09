# Aloria — notes pour Claude

Launcher Minecraft perso d'Alykell (« Aloria Client »), répondre **en français**.
Electron 44 + electron-vite + React 19 + TypeScript (`src/`), mod Fabric **Aloria HUD** (`mod/`) de la 1.20.1 à la 26.3, et en 1.8.9 (`mod-legacy/`, Legacy Fabric ; `mod-forge/`, même code pour Forge).
Données du jeu : `%APPDATA%\.aloria` (profils, instances, `shared/` = serveurs et jeux de réglages communs).

## Langues (launcher)
- Textes dans `src/shared/i18n/fr.ts` (référence) et `en.ts` (mêmes clés, sinon la compilation échoue). Interface : `t('clé', { param })`
  de `src/renderer/src/i18n.ts` ; processus principal (erreurs, statut, Discord) : `tm()` de `src/main/i18n.ts`.
- `Settings.language` absent = premier lancement (choix de la langue, celle de Windows présélectionnée) ; un `settings.json` déjà
  là sans langue = français (joueurs d'avant). Le premier choix règle aussi `lang` de « Mes réglages » s'il n'en a pas.
- Captures en anglais : `ALORIA_CAPTURE_LANG=en` (remet la langue et le thème d'avant à la fin : `.aloria` n'est pas isolé par `ALORIA_USER_DATA`).

## Publication
- Changer `version` dans `package.json`, commit, `git tag vX.Y.Z`, push du tag → GitHub Actions
  (`.github/workflows/release.yml`) compile le mod pour chaque version, construit l'installeur, publie
  (brouillon créé avant l'envoi des fichiers, sinon doublons). `npm run dist` en local échoue (Windows bloque l'exe non signé).
- Le commit de version s'écrit « vX.Y.Z : nouveauté, autre nouveauté » : la CI en tire l'annonce postée dans #annonces
  du Discord d'Aloria (secret `DISCORD_WEBHOOK_URL` ; bot et webhook : `%USERPROFILE%\.aloria-discord-token\`).
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

## Mod 1.8.9 (`mod-legacy/`)
- Projet séparé : Legacy Fabric (meta.legacyfabric.net, même format que Fabric ; le launcher l'utilise avant 1.14),
  Java 8, noms **Yarn** (`MinecraftClient`, `DrawableHelper`…), pas de Fabric API (tout en mixins). `./gradlew build` dans `mod-legacy`.
- Mêmes modules, menus et réglages que le mod moderne ; `ModuleSettings`/`GlobalSettings`/`VisualSettings` sont copiés depuis
  `mod/` à la construction (même fichier JSON). Dessin via `G` (mêmes noms que l'API moderne). Pas de polices TTF ni d'écran Visuel.
- Auto-test : profil `selftest189f` (Legacy Fabric 1.8.9, lance la démo) ; captures dans `<dossier>/screenshots`.

## Mod 1.8.9 sous Forge (`mod-forge/`)
- **Pas de code à lui** hormis les mixins (`mod-forge/src/main/java/.../mixin`, noms MCP, Mixin 0.7 embarqué dans le jar)
  et `aloriahud.mixins.json` : `buildSrc/RemapSourcesTask` reprend `mod-legacy/src/main/java` (sans ses mixins) à chaque
  compilation, active les blocs `//#if FORGE` (code Forge en `//$$`, le `//#else` = Fabric) puis convertit Yarn → MCP
  avec Mercury. Toute modif du mod 1.8.9 se fait donc dans `mod-legacy` ; un nouveau mixin s'écrit dans les deux projets.
- Outils : `gg.essential.loom` (Forge 1.8.9.2318, MCP stable_22). `mod-legacy` doit avoir été compilé avant (cache Yarn).
- Forge remplace le HUD du jeu par `GuiIngameForge` ; Mixin 0.7 n'injecte dans un constructeur qu'au `RETURN`.
- Auto-test : profil `selftest189forge` (OptiFine M5 dans ses mods, pour vérifier la compatibilité) ; `selftest1122forge` = Forge seul.

## Forge dans le launcher
- `src/main/game/forge.ts` : jusqu'à la 1.12.2 (installeur sans « processors ») ; JSON de version + jar de Forge extrait
  de l'installeur, id `forge-<version maven>`. Proposé en premier avant Sodium/Iris (`src/shared/loaders.ts`).
- OptiFine n'est pas redistribuable : le joueur le télécharge, « Ajouter OptiFine » (bibliothèque) le range dans `mods`.

## Créations (packs de textures, page « Créations »)
- Packs dans `%APPDATA%\.aloria\packs\<id>` (pack.json + PNG au format commun : viseur 15×15, hotbar 182×22, sélection
  24×24, totem 16×16). `src/main/packs.ts` (stockage, jar du jeu, zip, activation dans options.txt) ;
  `src/renderer/src/packImages.ts` (conversion : sprites/hud depuis la 1.20.2, sinon icons.png/widgets.png recomposés).
- Test : `ALORIA_CAPTURE=… ALORIA_CAPTURE_PACK="Test Aloria"` crée un pack et l'installe dans selftest et selftest189f
  (penser à supprimer ensuite `%APPDATA%\.aloria\packs` et le pack des profils de test).

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
