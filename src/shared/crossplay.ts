/**
 * Crossplay : des joueurs Bedrock (console, mobile, Windows) rejoignent un serveur Java grâce à Geyser (traduction des
 * deux protocoles) et Floodgate (connexion sans compte Java). Geyser joue en Java GEYSER_JAVA : un serveur Paper plus
 * ancien reçoit aussi ViaVersion. En dessous de la 1.20.5, Geyser ne tourne plus sur Paper (Java 21 obligatoire).
 */
export const GEYSER_JAVA = '26.3'

/** Port Bedrock par défaut (UDP) ; les serveurs suivants prennent les ports d'après */
export const BEDROCK_PORT = 19132

const parts = (v: string) => v.split('.').map((n) => Number(n) || 0)

/** a < b, en comparant les numéros un à un (« 1.20.4 » < « 1.20.5 » < « 26.3 ») */
export function versionBefore(a: string, b: string): boolean {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  return false
}

export function crossplaySupported(type: string, gameVersion: string): boolean {
  return type === 'paper' && !versionBefore(gameVersion, '1.20.5')
}

/** ViaVersion utile : serveur plus ancien que la version jouée par Geyser */
export const crossplayNeedsVia = (gameVersion: string) => versionBefore(gameVersion, GEYSER_JAVA)
