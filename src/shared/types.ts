export interface PublicAccount {
  uuid: string
  name: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; error: string }

export interface Settings {
  /** Id de version Mojang, ou « latest-release » / « latest-snapshot » */
  versionId: string
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
  | { state: 'running'; version: string }

export interface GameExit {
  code: number | null
  /** Dernières lignes du jeu quand il s'est arrêté anormalement */
  crashLog: string | null
}
