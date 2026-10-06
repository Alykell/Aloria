export interface PublicAccount {
  uuid: string
  name: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; error: string }

export interface Settings {
  /** RAM par défaut, utilisée par les profils qui n'en définissent pas */
  ramMb: number
  showSnapshots: boolean
  /** Plage de jour, de nuit, ou automatique selon l'heure */
  theme: ThemeChoice
  /** Après le lancement du jeu : garder le launcher ouvert, le réduire ou le fermer */
  afterLaunch: AfterLaunch
  /** Statut « Joue à Aloria » sur Discord */
  discordPresence: boolean
  /** Ce que le statut Discord montre pendant une partie */
  discordShowProfile: boolean
  discordShowVersion: boolean
  discordShowServer: boolean
}

export type AfterLaunch = 'keep' | 'minimize' | 'close'

export type ThemeChoice = 'auto' | 'day' | 'night'

export interface VersionEntry {
  id: string
  type: 'release' | 'snapshot'
}

export type GameStatus =
  | { state: 'idle' }
  | { state: 'preparing'; label: string }
  | { state: 'downloading'; doneFiles: number; totalFiles: number; doneBytes: number; totalBytes: number }
  | { state: 'launching' }
  | { state: 'running'; profile: string }

export interface GameExit {
  code: number | null
  /** Dernières lignes du jeu quand il s'est arrêté anormalement */
  crashLog: string | null
}

export type Loader = 'vanilla' | 'fabric'

export interface LoaderVersion {
  version: string
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
  /** Jeu de réglages appliqué au lancement (absent = « Mes réglages », null = réglages propres au profil) */
  settingsPreset?: string | null
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
}

export type ContentType = 'mod' | 'resourcepack' | 'shader'

export type SearchSort = 'relevance' | 'downloads' | 'newest' | 'updated'

export interface SearchQuery {
  profileId: string
  type: ContentType
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
