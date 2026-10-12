import { installContent, listInstalled, removeContent } from '../modrinth/content'
import { friendsUsable } from '../../shared/aloriaHud'
import type { Profile } from '../../shared/types'

/** e4mc (Modrinth) : « Ouvrir au réseau local » donne une adresse joignable par internet, sans ouvrir de ports */
const E4MC = 'qANg5Jrr'

/**
 * Met e4mc dans les mods du profil si « Jouer avec des amis » est coché, ou l'en retire si le joueur l'a décoché.
 * Option jamais touchée (absente) : on laisse le dossier tel quel (e4mc a pu être ajouté à la main).
 */
export async function syncFriends(profile: Profile, gameVersion: string): Promise<void> {
  if (profile.loader === 'vanilla' || profile.playWithFriends === undefined) return
  const installed = (await listInstalled(profile.id)).filter((c) => c.projectId === E4MC)
  // Coché mais inutilisable ici (ex. 26.x sans Aloria HUD, qui évite le plantage d'e4mc) : retiré comme s'il était décoché
  if (profile.playWithFriends && friendsUsable(profile, gameVersion)) {
    if (installed.length === 0) await installContent(profile.id, E4MC, 'mod')
  } else {
    for (const c of installed) await removeContent(profile.id, 'mod', c.fileName)
  }
}
