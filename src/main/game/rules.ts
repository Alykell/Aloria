import { release } from 'node:os'

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export type Features = Record<string, boolean>

export const OS_NAME = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'

// Noms d'architecture utilisés dans les fichiers de version Mojang
const OS_ARCH = process.arch === 'ia32' ? 'x86' : process.arch === 'arm64' ? 'arm64' : 'x64'

function matches(rule: Rule, features: Features): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false
    if (rule.os.arch && rule.os.arch !== OS_ARCH) return false
    if (rule.os.version && !new RegExp(rule.os.version).test(release())) return false
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if (!!features[key] !== value) return false
    }
  }
  return true
}

/** Applique les règles Mojang : sans règle tout est autorisé, sinon la dernière règle qui correspond l'emporte. */
export function rulesAllow(rules: Rule[] | undefined, features: Features = {}): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (matches(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}
