import { useEffect, useState } from 'react'
import type { GameExit, GameStatus, JoinTarget, ModCheck } from '../../../shared/types'

export function useGame() {
  const [status, setStatus] = useState<GameStatus>({ launch: null, running: [] })
  const [error, setError] = useState<string | null>(null)
  // « expired » : session Microsoft à renouveler (bouton Se reconnecter)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [crash, setCrash] = useState<GameExit | null>(null)
  // Mods manquants trouvés avant un lancement (la partie attend le choix du joueur), vérification en cours
  const [modCheck, setModCheck] = useState<{ profileId: string; join?: JoinTarget; check: ModCheck } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.aloria.game.status().then(setStatus)
    const offStatus = window.aloria.game.onStatus(setStatus)
    const offExit = window.aloria.game.onExit((exit) => {
      if (exit.code !== 0) setCrash(exit)
    })
    return () => {
      offStatus()
      offExit()
    }
  }, [])

  /** `join` : monde ou serveur à ouvrir dès l'ouverture du jeu (boutons Solo / Multijoueur) */
  const play = async (profileId: string, join?: JoinTarget, skipCheck = false) => {
    setError(null)
    setErrorCode(null)
    setCrash(null)
    if (!skipCheck) {
      setChecking(true)
      const checked = await window.aloria.game.checkMods(profileId)
      setChecking(false)
      // Vérification impossible (jar illisible…) : on lance quand même, le jeu dira ce qui ne va pas
      if (checked.ok && checked.value) return setModCheck({ profileId, join, check: checked.value })
    }
    const res = await window.aloria.game.play(profileId, join)
    if (!res.ok) {
      setError(res.error)
      setErrorCode(res.code)
    }
  }

  /** Choix du joueur dans la fenêtre des mods manquants ; après une réparation, nouvelle vérification avant de lancer */
  const resolveMods = async (action: 'fix' | 'disable' | 'ignore') => {
    if (!modCheck) return
    const { profileId, join, check } = modCheck
    if (action !== 'ignore') {
      const res = await window.aloria.game.fixMods(profileId, check, action === 'disable')
      if (!res.ok) {
        setModCheck(null)
        return setError(res.error)
      }
    }
    setModCheck(null)
    await play(profileId, join, action === 'ignore')
  }

  const cancel = () => window.aloria.game.cancel()
  const stop = (profileId: string) => window.aloria.game.stop(profileId)

  return { status, error, errorCode, crash, play, checking, modCheck, resolveMods, closeModCheck: () => setModCheck(null), cancel, stop, clearError: () => {
      setError(null)
      setErrorCode(null)
    },
    clearCrash: () => setCrash(null) }
}
