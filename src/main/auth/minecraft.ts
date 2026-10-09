import { AuthError } from './errors'
import { tm } from '../i18n'
import type { MessageKey } from '../../shared/i18n'

export interface MinecraftSession {
  uuid: string
  name: string
  accessToken: string
  expiresAt: number
  xuid: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

// Codes d'erreur XSTS documentés par Microsoft
const XSTS_ERRORS: Record<number, [AuthError['code'], MessageKey]> = {
  2148916227: ['xbox_banned', 'auth.banned'],
  2148916233: ['no_xbox', 'auth.noXbox'],
  2148916235: ['xbox', 'auth.country'],
  2148916236: ['xbox', 'auth.korea'],
  2148916237: ['xbox', 'auth.korea'],
  2148916238: ['child', 'auth.child']
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ res: Response; json: T }> {
  const res = await fetch(url, { method: 'POST', headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) })
  const text = await res.text()
  return { res, json: (text ? JSON.parse(text) : {}) as T }
}

async function xboxLive(msAccessToken: string): Promise<{ token: string; uhs: string }> {
  const { res, json } = await postJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }
  )
  if (!res.ok) throw new AuthError('xbox', tm('auth.xboxFailed', { status: res.status }))
  return { token: json.Token, uhs: json.DisplayClaims.xui[0].uhs }
}

async function xsts(xblToken: string): Promise<{ token: string; xuid: string }> {
  const { res, json } = await postJson<{ Token: string; XErr?: number; DisplayClaims?: { xui: { xid?: string }[] } }>('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  if (!res.ok) {
    const known = json.XErr ? XSTS_ERRORS[json.XErr] : undefined
    if (known) throw new AuthError(known[0], tm(known[1]))
    throw new AuthError('xbox', tm('auth.xstsFailed', { status: res.status }))
  }
  return { token: json.Token, xuid: json.DisplayClaims?.xui[0]?.xid ?? '0' }
}

async function minecraftLogin(uhs: string, xstsToken: string): Promise<{ token: string; expiresIn: number }> {
  const { res, json } = await postJson<{ access_token: string; expires_in: number; errorMessage?: string }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${uhs};${xstsToken}` }
  )
  if (res.status === 403) {
    throw new AuthError(
      'app_not_approved',
      tm('auth.notApproved')
    )
  }
  if (!res.ok) throw new AuthError('minecraft', json.errorMessage ?? tm('auth.minecraftFailed', { status: res.status }))
  return { token: json.access_token, expiresIn: json.expires_in }
}

async function getJson<T>(url: string, token: string): Promise<{ res: Response; json: T }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  const text = await res.text()
  return { res, json: (text ? JSON.parse(text) : {}) as T }
}

/** Chaîne complète : jeton Microsoft → Xbox Live → XSTS → Minecraft → vérification du jeu et du profil. */
export async function authenticateMinecraft(msAccessToken: string): Promise<MinecraftSession> {
  const xbl = await xboxLive(msAccessToken)
  const xstsRes = await xsts(xbl.token)
  const mc = await minecraftLogin(xbl.uhs, xstsRes.token)

  const ent = await getJson<{ items?: { name: string }[] }>('https://api.minecraftservices.com/entitlements/mcstore', mc.token)
  const owned = ent.json.items?.some((i) => i.name === 'game_minecraft' || i.name === 'product_minecraft')

  const profile = await getJson<{ id: string; name: string }>('https://api.minecraftservices.com/minecraft/profile', mc.token)
  if (profile.res.status === 404) {
    throw new AuthError(
      owned ? 'no_profile' : 'not_owned',
      owned
        ? tm('auth.noProfile')
        : tm('auth.notOwned')
    )
  }
  if (!profile.res.ok) throw new AuthError('minecraft', tm('auth.profileFailed', { status: profile.res.status }))

  // Compte tout neuf : le premier jeton peut être émis avant que Mojang y rattache le profil,
  // et les serveurs refusent alors la session (« Session non valide »). On en redemande un.
  let session = mc
  for (let attempt = 0; attempt < 3 && !tokenHasProfile(session.token); attempt++) {
    await new Promise((r) => setTimeout(r, 1500))
    session = await minecraftLogin(xbl.uhs, xstsRes.token)
  }
  if (!tokenHasProfile(session.token)) {
    throw new AuthError(
      'minecraft',
      tm('auth.profileNotReady')
    )
  }

  return {
    uuid: profile.json.id,
    name: profile.json.name,
    accessToken: session.token,
    expiresAt: Date.now() + session.expiresIn * 1000,
    xuid: xstsRes.xuid
  }
}

/** Vrai si le jeton Minecraft contient le profil du joueur (nécessaire pour le multijoueur) */
export function tokenHasProfile(token: string): boolean {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { profiles?: { mc?: string } }
    return !!claims.profiles?.mc
  } catch {
    return false
  }
}
