import { app, BrowserWindow, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loginMicrosoft, refreshMicrosoft } from './microsoft'
import { authenticateMinecraft, tokenHasProfile } from './minecraft'
import type { PublicAccount } from '../../shared/types'

interface StoredAccount extends PublicAccount {
  msRefreshToken: string
  mcAccessToken: string
  mcExpiresAt: number
  xuid?: string
}

interface Store {
  activeUuid: string | null
  accounts: StoredAccount[]
}

const storePath = () => join(app.getPath('userData'), 'accounts.dat')

// Les jetons sont chiffrés avec le coffre de Windows (DPAPI) quand il est disponible
function load(): Store {
  const empty: Store = { activeUuid: null, accounts: [] }
  if (!existsSync(storePath())) return empty
  try {
    const raw = readFileSync(storePath())
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
    return JSON.parse(text) as Store
  } catch {
    return empty
  }
}

function save(store: Store): void {
  const text = JSON.stringify(store)
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  writeFileSync(storePath(), data)
}

const toPublic = ({ uuid, name }: StoredAccount): PublicAccount => ({ uuid, name })

export function listAccounts(): { active: string | null; accounts: PublicAccount[] } {
  const store = load()
  return { active: store.activeUuid, accounts: store.accounts.map(toPublic) }
}

export async function addAccount(parent: BrowserWindow | null): Promise<PublicAccount> {
  const ms = await loginMicrosoft(parent)
  const mc = await authenticateMinecraft(ms.accessToken)
  const account: StoredAccount = {
    uuid: mc.uuid,
    name: mc.name,
    msRefreshToken: ms.refreshToken,
    mcAccessToken: mc.accessToken,
    mcExpiresAt: mc.expiresAt,
    xuid: mc.xuid
  }
  const store = load()
  store.accounts = [...store.accounts.filter((a) => a.uuid !== account.uuid), account]
  store.activeUuid = account.uuid
  save(store)
  return toPublic(account)
}

export function selectAccount(uuid: string): void {
  const store = load()
  if (store.accounts.some((a) => a.uuid === uuid)) {
    store.activeUuid = uuid
    save(store)
  }
}

export function removeAccount(uuid: string): void {
  const store = load()
  store.accounts = store.accounts.filter((a) => a.uuid !== uuid)
  if (store.activeUuid === uuid) store.activeUuid = store.accounts[0]?.uuid ?? null
  save(store)
}

/** Renvoie un jeton Minecraft valide pour le compte, en le rafraîchissant si besoin (utilisé au lancement du jeu). */
export async function getValidSession(uuid: string): Promise<{ uuid: string; name: string; accessToken: string; xuid: string }> {
  const store = load()
  const account = store.accounts.find((a) => a.uuid === uuid)
  if (!account) throw new Error('Compte introuvable.')

  // Jeton bientôt expiré, ou jeton sans profil (émis trop tôt pour un compte neuf) : on le renouvelle
  if (account.mcExpiresAt - Date.now() < 5 * 60_000 || !tokenHasProfile(account.mcAccessToken)) {
    const ms = await refreshMicrosoft(account.msRefreshToken)
    const mc = await authenticateMinecraft(ms.accessToken)
    Object.assign(account, {
      name: mc.name,
      msRefreshToken: ms.refreshToken ?? account.msRefreshToken,
      mcAccessToken: mc.accessToken,
      mcExpiresAt: mc.expiresAt,
      xuid: mc.xuid
    })
    save(store)
  }
  return { uuid: account.uuid, name: account.name, accessToken: account.mcAccessToken, xuid: account.xuid ?? '0' }
}
