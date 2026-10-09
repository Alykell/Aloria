import { BrowserWindow, session } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { MS_AUTHORITY, MS_CLIENT_ID, MS_REDIRECT_URI, MS_SCOPES } from '../config'
import { AuthError } from './errors'
import { tm } from '../i18n'

export interface MicrosoftTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Ouvre une fenêtre de connexion Microsoft (OAuth2 code + PKCE) et renvoie le code
 * d'autorisation intercepté sur l'URI de redirection.
 */
function requestAuthCode(parent: BrowserWindow | null, verifier: string): Promise<string> {
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MS_REDIRECT_URI,
    scope: MS_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 680,
      parent: parent ?? undefined,
      modal: !!parent,
      title: tm('auth.windowTitle'),
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        // Session propre à chaque connexion : permet de choisir un autre compte
        session: session.fromPartition(`aloria-login-${Date.now()}`),
        contextIsolation: true,
        sandbox: true
      }
    })

    let settled = false
    const handleUrl = (event: Electron.Event, url: string) => {
      if (!url.startsWith(MS_REDIRECT_URI)) return
      event.preventDefault()
      const query = new URL(url).searchParams
      settled = true
      win.destroy()
      const code = query.get('code')
      if (code) resolve(code)
      else reject(new AuthError('microsoft', query.get('error_description') ?? tm('auth.refused')))
    }

    win.webContents.on('will-redirect', handleUrl)
    win.webContents.on('will-navigate', handleUrl)
    win.on('closed', () => {
      if (!settled) reject(new AuthError('cancelled', tm('auth.cancelled')))
    })

    win.loadURL(`${MS_AUTHORITY}/authorize?${params}`)
  })
}

async function tokenRequest(body: Record<string, string>): Promise<MicrosoftTokens> {
  const res = await fetch(`${MS_AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID, scope: MS_SCOPES, ...body })
  })
  const json = (await res.json()) as Record<string, string>
  if (!res.ok) {
    throw new AuthError('microsoft', json.error_description ?? tm('auth.microsoftError', { status: res.status }))
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token }
}

export async function loginMicrosoft(parent: BrowserWindow | null): Promise<MicrosoftTokens> {
  const verifier = randomBytes(32).toString('base64url')
  const code = await requestAuthCode(parent, verifier)
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: MS_REDIRECT_URI,
    code_verifier: verifier
  })
}

export function refreshMicrosoft(refreshToken: string): Promise<MicrosoftTokens> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}
