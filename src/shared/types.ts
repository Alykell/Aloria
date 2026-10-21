import type { Lang } from './i18n'
export interface PublicAccount {
  uuid: string
  name: string
}

/** Éléments modifiables d'un pack créé dans Aloria (format commun à toutes les versions) */
export type PackElement =
  | 'crosshair'
  | 'hotbar'
  | 'hotbar_selection'
  | 'totem'
  | 'heart_full'
  | 'heart_half'
  | 'armor_full'
  | 'armor_half'
  | 'food_full'
  | 'food_half'
  | 'heart_container'
  | 'armor_empty'
  | 'food_empty'
  | 'xp_background'
  | 'xp_progress'

export interface PackInfo {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Résolution : 1 = celle du jeu (cœur 9×9), 2 = deux fois plus de pixels (18×18), 4… */
  scale: number
  /** Images personnalisées (data URL PNG) ; absente = celle du jeu */
  images: Partial<Record<PackElement, string>>
  /** Profils où il est installé → nom du fichier dans leur resourcepacks/ (absent : installé avant ce suivi) */
  installed?: Record<string, string>
}

/** « sprites » : une image par élément (1.20.2+) ; « atlas » : planches icons.png / widgets.png */
export type PackLayout = 'sprites' | 'atlas'

/** Ce qu'il faut pour convertir un pack vers une version du jeu (images d'origine en data URL) */
export interface PackVanilla {
  gameVersion: string
  layout: PackLayout
  format: [number, number]
  /** Chemin du totem dans cette version, ou null (pas de totem avant la 1.11) */
  totemPath: string | null
  /** Éléments, plus les fonds des icônes de vie pour l'aperçu (heart_container, armor_empty, food_empty) */
  images: Partial<Record<string, string | null>>
  atlases: { icons?: string | null; widgets?: string | null }
}

/** Recettes faites dans Aloria (« Créations ») : un format unique, écrit au format de la version visée à l'installation */
export type RecipeKind = 'shaped' | 'shapeless' | 'smelting' | 'blasting' | 'smoking' | 'campfire' | 'stonecutting'

/** Ingrédient : un item (« minecraft:stick ») ou un tag (« #minecraft:planks »), plusieurs = au choix */
export type RecipeIngredient = string[]

export interface Recipe {
  /** « minecraft:furnace » remplace la recette du jeu, « aloria:… » en ajoute une */
  id: string
  kind: RecipeKind
  /** Établi avec forme : 9 cases, ligne par ligne */
  grid?: (RecipeIngredient | null)[]
  /** Établi sans forme */
  ingredients?: RecipeIngredient[]
  /** Fours et tailleur de pierre */
  input?: RecipeIngredient | null
  result: string
  count: number
  experience?: number
  /** En ticks (20 = 1 s) */
  cookingTime?: number
  group?: string
}

/** Datapack créé dans Aloria (pour l'instant : des recettes) */
export interface DatapackCreation {
  id: string
  name: string
  /** Version du jeu dont viennent les items et les recettes de l'éditeur */
  gameVersion: string
  recipes: Recipe[]
  /** Recettes du jeu supprimées (« minecraft:piston ») */
  removed: string[]
  /** Profils où il est installé → nom du zip dans leur dossier datapacks/ (remis à jour à chaque enregistrement) */
  installed: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type ModelFace = 'up' | 'down' | 'north' | 'south' | 'east' | 'west'

/** De quoi dessiner l'icône d'un item (rendu en 3D isométrique pour les blocs, à plat sinon) */
export type ItemIcon =
  | { kind: 'flat'; layers: { tex: string; tint?: string }[] }
  | {
      kind: 'model'
      elements: {
        from: number[]
        to: number[]
        rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number }
        shade?: boolean
        faces: Partial<Record<ModelFace, { tex: string; uv?: number[]; rotation?: number; tint?: string }>>
      }[]
      gui: { rotation: number[]; translation: number[]; scale: number[] }
    }
  | { kind: 'none' }

export interface GameItem {
  id: string
  name: string
  icon: ItemIcon
}

/** Items, icônes, tags et recettes d'une version, lus dans son jar */
export interface GameData {
  gameVersion: string
  items: GameItem[]
  /** Chemin (« block/stone ») → PNG en data URL */
  textures: Record<string, string>
  /** « minecraft:planks » → items (tags imbriqués déjà dépliés) */
  tags: Record<string, string[]>
  /** Recettes du jeu modifiables dans l'éditeur (établi, fours, tailleur) */
  recipes: Recipe[]
  /** Types de recettes que connaît cette version (pas de fours ni de tailleur en 1.13) */
  kinds: RecipeKind[]
}

/** Cape du compte (les capes s'obtiennent lors d'événements Minecraft, on choisit seulement laquelle porter) */
export interface CapeInfo {
  id: string
  alias: string
  texture: string
  active: boolean
}

/** Skin enregistré dans Aloria, pour y revenir en un clic */
export interface SavedSkin {
  id: string
  name: string
  slim: boolean
  texture: string
  addedAt: number
}

/** Skin d'un joueur pour l'aperçu 3D : textures en data URL, modèle à bras fins ou non */
export interface PlayerSkin {
  texture: string
  slim: boolean
  cape: string | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; error: string }

export interface Settings {
  /** RAM par défaut, utilisée par les profils qui n'en définissent pas */
  ramMb: number
  showSnapshots: boolean
  /** Plage de jour, de nuit, ou automatique selon l'heure */
  theme: ThemeChoice
  /** Décorations de saison (Halloween en octobre) par-dessus le thème */
  seasonal: boolean
  /** Après le lancement du jeu : garder le launcher ouvert, le réduire ou le fermer */
  afterLaunch: AfterLaunch
  /** Statut « Joue à Aloria » sur Discord */
  discordPresence: boolean
  /** Ce que le statut Discord montre pendant une partie */
  discordShowProfile: boolean
  discordShowVersion: boolean
  discordShowServer: boolean
  /** Nom affiché pendant une partie : « Joue à Aloria Client » ou « Joue à Minecraft » */
  discordGameName: DiscordGameName
  /** Linux : lancer le jeu sur la carte graphique dédiée des PC qui en ont deux (portables NVIDIA / AMD) */
  dedicatedGpu: boolean
  /** Langue du launcher ; absente tant qu'elle n'a pas été choisie (premier lancement) */
  language?: Lang
  /** Parties du launcher masquées par le joueur (pour un launcher plus simple) */
  hiddenModules: AppModule[]
}

/** Parties du launcher qu'on peut masquer : pages du menu, et l'onglet Modpacks de la Bibliothèque */
export type AppModule = 'library' | 'modpacks' | 'creations' | 'servers' | 'gamesettings'

export type DiscordGameName = 'aloria' | 'minecraft'

export type AfterLaunch = 'keep' | 'minimize' | 'close'

export type ThemeChoice = 'auto' | 'day' | 'night'

export interface VersionEntry {
  id: string
  type: 'release' | 'snapshot'
}

/** Étape du lancement en cours */
export type LaunchStep =
  | { state: 'preparing'; label: string }
  | { state: 'downloading'; doneFiles: number; totalFiles: number; doneBytes: number; totalBytes: number }
  | { state: 'launching' }

export interface RunningGame {
  profileId: string
  profile: string
  /** Fermeture demandée : le bouton devient « Forcer l'arrêt » */
  stopping: boolean
}

/** Où arriver dès l'ouverture du jeu : un serveur, ou un monde solo du profil (dossier dans saves) */
export type JoinTarget = { host: string; port: number } | { world: string }

/** Monde solo d'un profil (boutons « Solo » de l'accueil) */
export interface LocalWorld {
  /** Nom du dossier dans saves, utilisé pour l'ouvrir */
  id: string
  name: string
  lastPlayed: number
  mode: 'survival' | 'creative' | 'adventure' | 'spectator' | 'hardcore'
  /** icon.png du monde en data URL */
  icon: string | null
}

/** Serveur de la liste Multijoueur du jeu (servers.dat du profil, ou liste commune) */
export interface SavedServer {
  /** Place dans la liste : sert à le retrouver pour le modifier */
  index: number
  name: string
  address: string
  icon: string | null
  /** Connexion automatique (/login) activée, avec un mot de passe enregistré */
  autoLogin: boolean
}

/** Modification d'un serveur : `password` vide = garder celui enregistré */
export interface ServerEdit {
  name: string
  address: string
  autoLogin: boolean
  password: string
}

export interface GameStatus {
  /** Lancement en cours : un seul à la fois (les téléchargements sont communs aux profils). `cancelling` : « Annuler » cliqué */
  launch: (LaunchStep & { profileId: string; profile: string; cancelling?: boolean }) | null
  /** Parties ouvertes, plusieurs possibles (une par profil) */
  running: RunningGame[]
}

export interface GameExit {
  profileId: string
  code: number | null
  /** Dernières lignes du jeu quand il s'est arrêté anormalement */
  crashLog: string | null
}

/** Mod demandé par d'autres mods du profil mais absent (identifiant du chargeur : « fabric-api », « architectury »…) */
export interface MissingMod {
  id: string
  /** Mods activés qui en ont besoin */
  requiredBy: { fileName: string; title: string }[]
  /** Réparation proposée : l'installer depuis Modrinth, réactiver le fichier désactivé, sinon rien (désactiver ceux qui le demandent) */
  fix: { kind: 'install'; projectId: string; title: string; iconUrl: string | null } | { kind: 'enable'; fileName: string; title: string } | { kind: 'none' }
}

/** Vérification des mods avant le lancement */
export interface ModCheck {
  missing: MissingMod[]
}

export type Loader = 'vanilla' | 'fabric' | 'forge' | 'neoforge'

export interface LoaderVersion {
  version: string
  /** Nom affiché, s'il diffère de version (Forge : « 11.15.1.2318 » pour « 1.8.9-11.15.1.2318-1.8.9 ») */
  label?: string
  stable: boolean
}

export interface ProfileInput {
  name: string
  icon: string
  /** Id de version Mojang, ou « latest-release » / « latest-snapshot » */
  versionId: string
  loader: Loader
  /** Version de Fabric imposée, null = dernière stable */
  loaderVersion: string | null
  /** RAM propre au profil, null = valeur des paramètres */
  ramMb: number | null
  /** Mod Aloria HUD dans les profils Fabric (absent = activé) */
  aloriaHud?: boolean
  /** Liste de serveurs commune à tous les profils (absent = oui) */
  shareServers?: boolean
  /** Jouer avec des amis : e4mc rend le monde ouvert en LAN joignable par internet (absent = non, false = retiré) */
  playWithFriends?: boolean
  /** Jeu de réglages appliqué au lancement (absent = « Mes réglages », null = réglages propres au profil) */
  settingsPreset?: string | null
  /** Modpack d'origine du profil (installé depuis Modrinth ou un fichier .mrpack) */
  modpack?: { name: string; versionNumber: string; projectId?: string; versionId?: string }
}

/** Jeu de réglages du jeu partagé entre profils (format options.txt moderne) */
export interface SettingsPreset {
  id: string
  name: string
  options: Record<string, string>
}

export interface Profile extends ProfileInput {
  id: string
  createdAt: number
  lastPlayed: number | null
  /** Dossier dans instances/, au nom du profil (absent : dossier à l'id, profils d'avant ce changement) */
  dir?: string
}

export type ContentType = 'mod' | 'resourcepack' | 'shader' | 'datapack'

export type SearchSort = 'relevance' | 'downloads' | 'newest' | 'updated'

export interface SearchQuery {
  profileId: string
  type: ContentType | 'modpack'
  query: string
  sort: SearchSort
  offset: number
}

export interface SearchHit {
  projectId: string
  slug: string
  title: string
  author: string
  description: string
  downloads: number
  iconUrl: string | null
  categories: string[]
}

/** Résultat d'un import de fichiers : type de chaque fichier ajouté, et erreurs des fichiers refusés */
export interface ImportResult {
  added: ContentType[]
  errors: string[]
  /** Modpacks (.mrpack) glissés ou choisis : ils créent un profil, après un aperçu */
  modpacks: string[]
  /** Profils complets (zip Aloria, Prism, MultiMC, CurseForge) : chacun devient un nouveau profil */
  instances: string[]
}

/** Ce qu'un export de profil emporte en plus des mods, packs et configs */
export interface ExportOptions {
  worlds: boolean
  screenshots: boolean
}

/** Modpack à afficher ou installer : une version publiée sur Modrinth, ou un fichier .mrpack du joueur */
export type ModpackSource = { kind: 'modrinth'; projectId: string; versionId: string } | { kind: 'file'; path: string }

export interface ModpackVersion {
  id: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  /** Version finale (ni bêta, ni alpha) */
  stable: boolean
  /** Installable par Aloria (Fabric, ou Forge jusqu'à la 1.12.2) */
  supported: boolean
}

/** Fichier d'un modpack (mod, resource pack, shader ou autre), avec le nom du projet Modrinth quand on le connaît */
export interface ModpackEntry {
  path: string
  type: ContentType | 'other'
  title: string
  iconUrl: string | null
  /** Le modpack le propose sans l'imposer (installé quand même) */
  optional: boolean
  size: number
}

export interface ModpackPreview {
  name: string
  summary: string
  versionNumber: string
  gameVersion: string
  loader: string
  loaderVersion: string | null
  /** Raison pour laquelle Aloria ne peut pas l'installer (chargeur ou version non gérés), sinon null */
  unsupported: string | null
  files: ModpackEntry[]
  /** Fichiers fournis directement par le modpack (configs, réglages, mondes…) */
  overrides: number
}

/**
 * Avancement de l'installation d'un modpack, étape par étape : fichier du modpack (octets), mods et fichiers
 * (octets, et nombre de fichiers), configs fournies (nombre de fichiers), puis derniers réglages
 */
export interface ModpackProgress {
  step: 'prepare' | 'pack' | 'files' | 'overrides' | 'finish'
  done: number
  total: number
  doneFiles?: number
  totalFiles?: number
}

export interface InstalledContent {
  /** Nom du fichier sans « .disabled » : sert d'identifiant */
  fileName: string
  type: ContentType
  enabled: boolean
  /** Absent pour un fichier ajouté à la main dans le dossier */
  projectId?: string
  versionId?: string
  versionNumber?: string
  title: string
  iconUrl?: string | null
  /** Installé automatiquement comme dépendance d'un autre contenu */
  auto?: boolean
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }

// ---------------------------------------------------------------- serveurs (page Serveurs)

export type ServerType = 'vanilla' | 'fabric' | 'paper' | 'forge' | 'neoforge'

/** Adresse publique sans ouvrir de ports : e4mc (mod, Fabric/Forge/NeoForge) ou playit.gg ; none = réseau local seulement */
export type ServerTunnel = 'e4mc' | 'playit' | 'none'

export interface ServerInput {
  name: string
  icon: string
  type: ServerType
  /** Version du jeu (numéro exact : un serveur ne suit pas « dernière version » tout seul) */
  gameVersion: string
  /** Version du chargeur (Fabric, Forge, NeoForge) ou build de Paper ; null = dernière stable à l'installation */
  loaderVersion: string | null
  ramMb: number
  port: number
  tunnel: ServerTunnel
}

export interface ServerInfo extends ServerInput {
  id: string
  createdAt: number
  lastStarted: number | null
  /** Dernière adresse playit.gg obtenue (fixe) : mise dans le pack pour les amis même serveur éteint */
  lastAddress?: string
  /** Profil créé pour rejoindre ce serveur (« Créer le profil du serveur ») */
  profileId?: string
  /** Sauvegarde automatique du monde toutes les N heures pendant que le serveur tourne (absent = 6, 0 = jamais) */
  backupHours?: number
  /** Nombre de sauvegardes gardées (absent = 10) */
  backupKeep?: number
  /** Version du chargeur réellement installée (pour savoir s'il faut réinstaller) */
  installed?: { gameVersion: string; loaderVersion: string | null }
}

export type ServerState = 'stopped' | 'installing' | 'starting' | 'running' | 'stopping'

export interface ServerStatus {
  id: string
  state: ServerState
  /** Étape en cours pendant l'installation */
  label?: string
  /** 0 à 1 pendant un téléchargement */
  progress?: number
  /** Adresse publique (e4mc, playit) une fois connue */
  publicAddress: string | null
  /** Joueurs connectés */
  players: string[]
  /** Dernière erreur (crash, installation ratée) */
  error?: string
  /** playit.gg : IP:port du relais, en secours si le nom de domaine ne marche pas encore chez un ami */
  fallbackAddress?: string
  /** Adresse publique impossible à obtenir (ex. compte playit.gg pas encore relié) */
  tunnelError?: string
  /** Mesures en direct pendant que le serveur tourne (TPS seulement depuis la 1.20.3) */
  stats?: { ramMb?: number; ramMaxMb?: number; cpu?: number; tps?: number; mspt?: number }
}

/** Compte playit.gg : adresses utilisées (le compte gratuit en a 4 au plus) */
export interface PlayitUsage {
  linked: boolean
  used: number
  max: number
  /** Serveurs qui ont déjà leur adresse (ou une demande en attente) */
  serverIds: string[]
}

/** Action sur un joueur (commande si le serveur est allumé, fichier sinon) */
export type ServerPlayerAction = 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'ban' | 'pardon' | 'kick'

export interface ServerPlayers {
  whitelistOn: boolean
  whitelist: string[]
  ops: string[]
  banned: string[]
}

/** Occasion d'une sauvegarde : à la main, automatique, avant un changement de version ou une restauration */
export type ServerBackupKind = 'manual' | 'auto' | 'version' | 'restore'

export interface ServerBackup {
  file: string
  kind: ServerBackupKind
  date: number
  sizeMb: number
}

/** Mod ou plugin trouvé sur Modrinth pour un serveur */
export interface ServerContentHit {
  projectId: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
  /** Mod à installer aussi chez les joueurs */
  clientRequired: boolean
}

/** Dépendance obligatoire d'un mod ou plugin, proposée avant l'installation */
export interface ServerContentDependency {
  projectId: string
  title: string
  iconUrl: string | null
}

/** Élément de l'onglet Fichiers */
export interface ServerFile {
  name: string
  dir: boolean
  size: number
  modified: number
}

/** Mod ou plugin présent dans le dossier du serveur */
export interface ServerContent {
  fileName: string
  /** Projet Modrinth (null pour un fichier mis à la main) */
  projectId: string | null
  title: string
  iconUrl: string | null
}

export interface ServerLogLine {
  id: string
  line: string
}
