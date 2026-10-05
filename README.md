# 🌊 Aloria

**Aloria** est un launcher Minecraft: Java Edition personnel, au style plage et océan.
*Aloria is a personal Minecraft: Java Edition launcher with a light, ocean-themed look.*

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

Télécharge `Aloria-Setup-x.y.z.exe` dans les [Releases](https://github.com/Alykell/Aloria/releases/latest) et lance-le.
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
