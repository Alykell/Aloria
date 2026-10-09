import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getValidSession } from './accounts'
import { paths } from '../game/paths'
import type { CapeInfo, PlayerSkin, SavedSkin } from '../../shared/types'
import { tm } from '../i18n'

/**
 * Skin d'un joueur, pour l'aperçu 3D de l'accueil : la texture (en data URL, pour que le rendu WebGL de l'interface
 * n'ait pas de problème d'origine) et le modèle (« slim » = bras fins). Profil public de Mojang, sans connexion.
 */
const cache = new Map<string, { at: number; skin: PlayerSkin }>()
const TEN_MINUTES = 10 * 60 * 1000

export async function getSkin(uuid: string): Promise<PlayerSkin | null> {
  const hit = cache.get(uuid)
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.skin

  const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`)
  if (!res.ok) return null
  const profile = (await res.json()) as { properties?: { name: string; value: string }[] }
  const encoded = profile.properties?.find((p) => p.name === 'textures')?.value
  if (!encoded) return null
  const textures = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as {
    textures?: { SKIN?: { url: string; metadata?: { model?: string } }; CAPE?: { url: string } }
  }
  const skinInfo = textures.textures?.SKIN
  if (!skinInfo) return null

  const image = async (url: string) => {
    const r = await fetch(url.replace(/^http:/, 'https:'))
    return r.ok ? `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null
  }
  const texture = await image(skinInfo.url)
  if (!texture) return null
  const skin: PlayerSkin = {
    texture,
    slim: skinInfo.metadata?.model === 'slim',
    cape: textures.textures?.CAPE ? await image(textures.textures.CAPE.url) : null
  }
  cache.set(uuid, { at: Date.now(), skin })
  return skin
}

// ---------------------------------------------------------------- changement de skin (compte connecté)

const SERVICES = 'https://api.minecraftservices.com/minecraft/profile'

interface ServicesProfile {
  id: string
  skins: { id: string; state: string; url: string; variant: string }[]
  capes: { id: string; state: string; url: string; alias: string }[]
}

async function services(uuid: string, path = '', init: RequestInit = {}): Promise<ServicesProfile> {
  const { accessToken } = await getValidSession(uuid)
  const res = await fetch(SERVICES + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` } })
  if (res.status === 429) throw new Error(tm('err.skinRateLimit'))
  if (!res.ok) throw new Error(tm('err.skinRefused', { status: res.status }))
  return (await res.json()) as ServicesProfile
}

async function asDataUrl(url: string): Promise<string | null> {
  const r = await fetch(url.replace(/^http:/, 'https:'))
  return r.ok ? `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null
}

/** Met le skin du profil en cache tel que Minecraft vient de le renvoyer (le profil public met un moment à suivre) */
async function remember(uuid: string, profile: ServicesProfile): Promise<PlayerSkin | null> {
  const active = profile.skins.find((s) => s.state === 'ACTIVE')
  const texture = active ? await asDataUrl(active.url) : null
  if (!active || !texture) return null
  const cape = profile.capes.find((c) => c.state === 'ACTIVE')
  const skin: PlayerSkin = { texture, slim: active.variant === 'SLIM', cape: cape ? await asDataUrl(cape.url) : null }
  cache.set(uuid, { at: Date.now(), skin })
  return skin
}

/** Envoie un skin (PNG en data URL) sur le compte ; le précédent est d'abord gardé dans la bibliothèque */
export async function uploadSkin(uuid: string, texture: string, slim: boolean, name: string): Promise<PlayerSkin | null> {
  const previous = await getSkin(uuid).catch(() => null)
  if (previous) await addSavedSkin(previous.texture, previous.slim, tm('skin.previous'))
  await addSavedSkin(texture, slim, name)
  const form = new FormData()
  form.append('variant', slim ? 'slim' : 'classic')
  form.append('file', new Blob([Buffer.from(texture.split(',')[1], 'base64')], { type: 'image/png' }), 'skin.png')
  return remember(uuid, await services(uuid, '/skins', { method: 'POST', body: form }))
}

/** Revient au skin par défaut de Minecraft */
export async function resetSkin(uuid: string): Promise<PlayerSkin | null> {
  const previous = await getSkin(uuid).catch(() => null)
  if (previous) await addSavedSkin(previous.texture, previous.slim, tm('skin.previous'))
  await services(uuid, '/skins/active', { method: 'DELETE' })
  cache.delete(uuid)
  return remember(uuid, await services(uuid))
}

export async function listCapes(uuid: string): Promise<CapeInfo[]> {
  const profile = await services(uuid)
  const capes: CapeInfo[] = []
  for (const c of profile.capes) {
    const texture = await asDataUrl(c.url)
    if (texture) capes.push({ id: c.id, alias: c.alias, texture, active: c.state === 'ACTIVE' })
  }
  return capes
}

/** Porte une cape (null : aucune) */
export async function setCape(uuid: string, capeId: string | null): Promise<PlayerSkin | null> {
  const profile = capeId
    ? await services(uuid, '/capes/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId }) })
    : await services(uuid, '/capes/active', { method: 'DELETE' })
  return remember(uuid, profile)
}

// ---------------------------------------------------------------- bibliothèque de skins (%APPDATA%\.aloria\skins)

const SKINS = join(paths.root, 'skins')
const indexFile = join(SKINS, 'skins.json')

type SavedMeta = Omit<SavedSkin, 'texture'> & { hash: string }

async function readIndex(): Promise<SavedMeta[]> {
  try {
    return JSON.parse(await readFile(indexFile, 'utf8')) as SavedMeta[]
  } catch {
    return []
  }
}

export async function listSavedSkins(): Promise<SavedSkin[]> {
  const out: SavedSkin[] = []
  for (const meta of await readIndex()) {
    const file = join(SKINS, `${meta.id}.png`)
    if (!existsSync(file)) continue
    const { hash: _hash, ...rest } = meta
    out.push({ ...rest, texture: `data:image/png;base64,${(await readFile(file)).toString('base64')}` })
  }
  return out.sort((a, b) => b.addedAt - a.addedAt)
}

/** Ajoute un skin à la bibliothèque (déjà présent : seulement remonté en tête de liste) */
export async function addSavedSkin(texture: string, slim: boolean, name: string): Promise<void> {
  const data = Buffer.from(texture.split(',')[1], 'base64')
  const hash = createHash('sha1').update(data).digest('hex')
  const index = await readIndex()
  const existing = index.find((s) => s.hash === hash)
  if (existing) {
    existing.addedAt = Date.now()
    existing.slim = slim
  } else {
    const id = hash.slice(0, 12)
    await mkdir(SKINS, { recursive: true })
    await writeFile(join(SKINS, `${id}.png`), data)
    index.push({ id, name: name.trim() || 'Skin', slim, addedAt: Date.now(), hash })
  }
  await mkdir(SKINS, { recursive: true })
  await writeFile(indexFile, JSON.stringify(index, null, 2))
}

export async function removeSavedSkin(id: string): Promise<void> {
  const index = (await readIndex()).filter((s) => s.id !== id)
  await rm(join(SKINS, `${id}.png`), { force: true })
  await writeFile(indexFile, JSON.stringify(index, null, 2))
}
