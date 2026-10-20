import { app, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { paths } from './game/paths'
import type { Profile, ProfileInput } from '../shared/types'
import { tm } from './i18n'

interface Store {
  selectedId: string
  profiles: Profile[]
}

const file = join(paths.root, 'profiles.json')

// Le premier profil réutilise le dossier « default » créé en phase 2
function defaultStore(): Store {
  const profile: Profile = {
    id: 'default',
    name: 'Vanilla',
    icon: '🏝️',
    versionId: 'latest-release',
    loader: 'vanilla',
    loaderVersion: null,
    ramMb: null,
    createdAt: Date.now(),
    lastPlayed: null
  }
  return { selectedId: profile.id, profiles: [profile] }
}

function load(): Store {
  if (!existsSync(file)) return defaultStore()
  try {
    const store = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as Store
    return store.profiles.length > 0 ? store : defaultStore()
  } catch {
    return defaultStore()
  }
}

function save(store: Store): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(store, null, 2))
}

/** Dossier du profil : à son nom (« Lostgard »), ou à son id pour un profil inconnu ou pas encore renommé */
export function gameDirOf(id: string): string {
  const profile = load().profiles.find((p) => p.id === id)
  return join(paths.instances, profile?.dir ?? id)
}

/** Nom de dossier tiré du nom du profil : sans les caractères interdits par Windows, ni noms réservés (CON, NUL…) */
function dirBase(name: string): string {
  let base = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 60)
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base += '_'
  return base || 'Profil'
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Le dossier correspond déjà au nom (« Lostgard », ou « Lostgard (2) » si le nom était pris) */
const dirMatches = (dir: string, name: string) => new RegExp(`^${escapeRegExp(dirBase(name))}( \\(\\d+\\))?$`, 'i').test(dir)

/** Premier nom libre : « Lostgard », « Lostgard (2) »… (Windows ne distingue pas majuscules et minuscules) */
function freeDir(name: string, store: Store, selfId: string): string {
  const taken = new Set(store.profiles.filter((p) => p.id !== selfId).map((p) => (p.dir ?? p.id).toLowerCase()))
  const base = dirBase(name)
  for (let n = 1; ; n++) {
    const dir = n === 1 ? base : `${base} (${n})`
    if (!taken.has(dir.toLowerCase()) && !existsSync(join(paths.instances, dir))) return dir
  }
}

/**
 * Renomme le dossier du profil d'après son nom. Dossier verrouillé (jeu ouvert) : il garde son nom, nouvel essai au
 * prochain démarrage du launcher. Les profils de test gardent leur dossier (les tests s'en servent). Renvoie si `profile` a changé.
 */
function syncDir(profile: Profile, store: Store): boolean {
  if (profile.id.startsWith(TEST_PROFILE)) return false
  const current = profile.dir ?? profile.id
  if (dirMatches(current, profile.name)) {
    if (profile.dir) return false
    profile.dir = current
    return true
  }
  const target = freeDir(profile.name, store, profile.id)
  const from = join(paths.instances, current)
  try {
    if (existsSync(from)) renameSync(from, join(paths.instances, target))
  } catch {
    return false
  }
  profile.dir = target
  return true
}

/** Au démarrage : dossiers des profils au nom de leur profil (anciens dossiers à l'id, renommages en attente) */
export function migrateProfileDirs(): void {
  // En développement, seulement sur un .aloria de test : le launcher installé (version d'avant) partage le vrai
  if (!app.isPackaged && !process.env.ALORIA_ROOT) return
  if (!existsSync(file)) return
  const store = load()
  let changed = false
  for (const profile of store.profiles) changed = syncDir(profile, store) || changed
  if (changed) save(store)
}

/** Profils réservés aux tests automatiques en développement (selftest, selftest262…), masqués dans la version installée */
const TEST_PROFILE = 'selftest'

export function listProfiles(): Store {
  const store = load()
  if (!app.isPackaged) return store
  const profiles = store.profiles.filter((p) => !p.id.startsWith(TEST_PROFILE))
  const selectedId = store.selectedId.startsWith(TEST_PROFILE) ? profiles[0]?.id ?? store.selectedId : store.selectedId
  return { selectedId, profiles }
}

export function getProfile(id: string): Profile {
  const profile = load().profiles.find((p) => p.id === id)
  if (!profile) throw new Error(tm('err.profileMissing'))
  return profile
}

export function createProfile(input: ProfileInput): Profile {
  const store = load()
  const id = randomUUID().slice(0, 8)
  const profile: Profile = { ...input, id, dir: freeDir(input.name, store, id), createdAt: Date.now(), lastPlayed: null }
  store.profiles.push(profile)
  store.selectedId = profile.id
  save(store)
  return profile
}

export function updateProfile(id: string, patch: Partial<ProfileInput>): Profile {
  const store = load()
  const profile = store.profiles.find((p) => p.id === id)
  if (!profile) throw new Error(tm('err.profileMissing'))
  const renamed = patch.name !== undefined && patch.name !== profile.name
  Object.assign(profile, patch)
  // Nouveau nom : le dossier suit (s'il est libre ; sinon au prochain démarrage)
  if (renamed) syncDir(profile, store)
  save(store)
  return profile
}

export function selectProfile(id: string): void {
  const store = load()
  if (store.profiles.some((p) => p.id === id)) {
    store.selectedId = id
    save(store)
  }
}

export function markPlayed(id: string): void {
  const store = load()
  const profile = store.profiles.find((p) => p.id === id)
  if (profile) {
    profile.lastPlayed = Date.now()
    save(store)
  }
}

/** Supprime le profil ; son dossier (mondes, mods…) part dans la corbeille si demandé. */
export async function deleteProfile(id: string, deleteFiles: boolean): Promise<void> {
  if (load().profiles.length <= 1) throw new Error(tm('err.lastProfile'))
  // Les fichiers d'abord : s'ils ne partent pas (jeu ouvert, fichier verrouillé), le profil reste, sans dossier orphelin
  if (deleteFiles && existsSync(gameDirOf(id))) {
    await shell.trashItem(gameDirOf(id)).catch(() => {
      throw new Error(tm('err.profileFilesBusy'))
    })
  }
  const store = load()
  store.profiles = store.profiles.filter((p) => p.id !== id)
  if (store.selectedId === id) store.selectedId = store.profiles[0].id
  save(store)
}

export async function openProfileFolder(id: string): Promise<void> {
  await mkdir(gameDirOf(id), { recursive: true })
  await shell.openPath(gameDirOf(id))
}
