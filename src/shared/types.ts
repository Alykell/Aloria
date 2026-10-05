export interface PublicAccount {
  uuid: string
  name: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; error: string }

export interface Settings {
  /** RAM par défaut, utilisée par les profils qui n'en définissent pas */
  ramMb: number
  showSnapshots: boolean
}

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
}

export interface Profile extends ProfileInput {
  id: string
  createdAt: number
  lastPlayed: number | null
}
