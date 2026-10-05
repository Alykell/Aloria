import { useEffect, useState } from 'react'
import type { GameExit, GameStatus } from '../../../shared/types'

export function useGame() {
  const [status, setStatus] = useState<GameStatus>({ state: 'idle' })
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

  const play = async (profileId: string) => {
    setError(null)
    setCrash(null)
    const res = await window.aloria.game.play(profileId)
    if (!res.ok) setError(res.error)
  }

  return { status, error, crash, play, clearError: () => setError(null), clearCrash: () => setCrash(null) }
}
