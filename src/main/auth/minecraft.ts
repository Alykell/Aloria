import { AuthError } from './errors'

export interface MinecraftSession {
  uuid: string
  name: string
  accessToken: string
  expiresAt: number
  xuid: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

// Codes d'erreur XSTS documentés par Microsoft
const XSTS_ERRORS: Record<number, [AuthError['code'], string]> = {
  2148916227: ['xbox_banned', 'Ce compte est banni du Xbox Live.'],
  2148916233: ['no_xbox', "Ce compte Microsoft n'a pas de profil Xbox. Connecte-toi une fois sur minecraft.net pour le créer."],
  2148916235: ['xbox', "Le Xbox Live n'est pas disponible dans ton pays."],
  2148916236: ['xbox', 'Ce compte doit être vérifié (Corée du Sud).'],
  2148916237: ['xbox', 'Ce compte doit être vérifié (Corée du Sud).'],
  2148916238: ['child', "Compte mineur : un adulte doit l'ajouter à une famille Microsoft."]
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
  if (!res.ok) throw new AuthError('xbox', `Échec de la connexion Xbox Live (${res.status}).`)
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
    if (known) throw new AuthError(known[0], known[1])
    throw new AuthError('xbox', `Échec de l'autorisation Xbox (${res.status}).`)
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
      "Mojang n'a pas encore autorisé l'application Aloria à utiliser l'API Minecraft."
    )
  }
  if (!res.ok) throw new AuthError('minecraft', json.errorMessage ?? `Échec de la connexion Minecraft (${res.status}).`)
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
        ? "Tu possèdes Minecraft mais n'as pas encore choisi de pseudo. Crée-le sur minecraft.net."
        : 'Ce compte ne possède pas Minecraft Java Edition.'
    )
  }
  if (!profile.res.ok) throw new AuthError('minecraft', `Impossible de récupérer le profil (${profile.res.status}).`)

  return {
    uuid: profile.json.id,
    name: profile.json.name,
    accessToken: mc.token,
    expiresAt: Date.now() + mc.expiresIn * 1000,
    xuid: xstsRes.xuid
  }
}
