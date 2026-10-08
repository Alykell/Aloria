import type { PlayerSkin } from '../../shared/types'

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
