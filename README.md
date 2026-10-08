# 🌊 Aloria

**Aloria** est un launcher Minecraft: Java Edition personnel, au style plage et océan.
*Aloria is a personal Minecraft: Java Edition launcher with a light, ocean-themed look.*

🌐 **Site / Website : [alykell.github.io/Aloria](https://alykell.github.io/Aloria/)**

> Projet non officiel, non affilié à Mojang ou Microsoft.
> *Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.*

## Fonctionnalités / Features

| | Statut |
|---|---|
| Connexion avec un compte Microsoft (Microsoft → Xbox Live → Minecraft), plusieurs comptes | ✅ |
| Vérification que le compte possède Minecraft Java | ✅ |
| Téléchargement du jeu depuis les serveurs officiels de Mojang + Java automatique | ✅ |
| Profils (version, RAM, dossier) et support de Fabric | ✅ |
| Bibliothèque de mods, resource packs et shaders via [Modrinth](https://modrinth.com), dépendances automatiques | ✅ |
| **Aloria HUD** : FPS, CPS, coordonnées, touches, armure, effets… personnalisables en jeu (Échap ou Maj droite) | ✅ |
| Installeur Windows et mises à jour automatiques | ✅ |

## Installation

Télécharge l'installeur depuis le [site d'Aloria](https://alykell.github.io/Aloria/) (ou `Aloria-Setup-x.y.z.exe` dans les [Releases](https://github.com/Alykell/Aloria/releases/latest)) et lance-le.
L'installeur n'est pas signé : si Windows SmartScreen s'affiche, clique sur **Informations complémentaires** puis **Exécuter quand même**.
Il faut un compte Microsoft qui possède **Minecraft: Java Edition**.

## Authentification / Authentication

Aloria uses the official Microsoft sign-in flow (OAuth 2.0 authorization code + PKCE, public
client). The Microsoft token is exchanged for Xbox Live / XSTS tokens and then for a Minecraft
access token through the Minecraft Services API. Only legitimate accounts that own
Minecraft: Java Edition are supported: there is **no offline / cracked mode**.

Tokens are stored only on the user's computer, encrypted with the operating system's
keychain (Windows DPAPI via Electron `safeStorage`), and are only ever sent to Microsoft,
Xbox Live and Mojang endpoints. Game files are downloaded from Mojang's official servers.

## Confidentialité / Privacy

Aloria ne collecte aucune donnée : voir la [politique de confidentialité](https://alykell.github.io/Aloria/confidentialite.html).
*This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it, except for the automatic update check (a download request to GitHub).*

## Sécurité / Security

L'installeur n'est pas encore signé : Windows affiche un avertissement (« Informations complémentaires » → « Exécuter quand même »).
Windows builds are produced by GitHub Actions from this public repository; updates are verified by their SHA-512 hash before being installed.

- Committer and reviewer: [Alykell](https://github.com/Alykell)

## Licence / License

[MIT](LICENSE). Polices du mod sous licence SIL Open Font License (`mod/src/main/resources/licenses`).
Minecraft n'est pas inclus : il est téléchargé depuis les serveurs officiels de Mojang.

## Développement / Development

Stack : Electron, electron-vite, React, TypeScript.

```bash
npm install
npm run dev        # lancer en mode développement
npm run typecheck  # vérifier les types
npm run dist       # créer l'installeur Windows
```

## Auteur / Author

[Alykell](https://github.com/Alykell)
