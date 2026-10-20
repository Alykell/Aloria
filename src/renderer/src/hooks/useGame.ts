import { useEffect, useState } from 'react'
import type { GameExit, GameStatus, JoinTarget } from '../../../shared/types'

export function useGame() {
  const [status, setStatus] = useState<GameStatus>({ launch: null, running: [] })
  const [error, setError] = useState<string | null>(null)
  const [crash, setCrash] = useState<GameExit | null>(null)

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
  const play = async (profileId: string, join?: JoinTarget) => {
    setError(null)
    setCrash(null)
    const res = await window.aloria.game.play(profileId, join)
    if (!res.ok) setError(res.error)
  }

  const cancel = () => window.aloria.game.cancel()
  const stop = (profileId: string) => window.aloria.game.stop(profileId)

  return { status, error, crash, play, cancel, stop, clearError: () => setError(null), clearCrash: () => setCrash(null) }
}
