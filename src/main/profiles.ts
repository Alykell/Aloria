import { app, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { paths } from './game/paths'
import type { Profile, ProfileInput } from '../shared/types'

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

export const gameDirOf = (id: string) => join(paths.instances, id)

/** Profil réservé aux tests automatiques en développement, masqué dans la version installée */
const TEST_PROFILE = 'selftest'

export function listProfiles(): Store {
  const store = load()
  if (!app.isPackaged) return store
  const profiles = store.profiles.filter((p) => p.id !== TEST_PROFILE)
  const selectedId = store.selectedId === TEST_PROFILE ? profiles[0]?.id ?? store.selectedId : store.selectedId
  return { selectedId, profiles }
}

export function getProfile(id: string): Profile {
  const profile = load().profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Profil introuvable.')
  return profile
}

export function createProfile(input: ProfileInput): Profile {
  const store = load()
  const profile: Profile = { ...input, id: randomUUID().slice(0, 8), createdAt: Date.now(), lastPlayed: null }
  store.profiles.push(profile)
  store.selectedId = profile.id
  save(store)
  return profile
}

export function updateProfile(id: string, patch: Partial<ProfileInput>): Profile {
  const store = load()
  const profile = store.profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Profil introuvable.')
  Object.assign(profile, patch)
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
  const store = load()
  if (store.profiles.length <= 1) throw new Error('Il faut garder au moins un profil.')
  store.profiles = store.profiles.filter((p) => p.id !== id)
  if (store.selectedId === id) store.selectedId = store.profiles[0].id
  save(store)
  if (deleteFiles && existsSync(gameDirOf(id))) await shell.trashItem(gameDirOf(id))
}

export async function openProfileFolder(id: string): Promise<void> {
  await mkdir(gameDirOf(id), { recursive: true })
  await shell.openPath(gameDirOf(id))
}
