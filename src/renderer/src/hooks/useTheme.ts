import { useEffect, useState } from 'react'
import beachDay from '../assets/beach-day.svg'
import beachNight from '../assets/beach-night.svg'
import halloweenDay from '../assets/beach-halloween-day.svg'
import halloweenNight from '../assets/beach-halloween-night.svg'
import type { ThemeChoice } from '../../../shared/types'

export type Theme = 'day' | 'night'
export type Season = 'halloween' | null

/** En automatique : plage de jour de 7 h à 20 h, plage de nuit le reste du temps */
function byHour(): Theme {
  const h = new Date().getHours()
  return h >= 7 && h < 20 ? 'day' : 'night'
}

/** Halloween : tout le mois d'octobre, jusqu'au 1er novembre inclus */
export function seasonOf(date: Date): Season {
  const m = date.getMonth()
  return m === 9 || (m === 10 && date.getDate() === 1) ? 'halloween' : null
}

const BACKDROPS = {
  none: { day: beachDay, night: beachNight },
  halloween: { day: halloweenDay, night: halloweenNight }
}

/** Applique le thème (et la saison) au document et renvoie l'illustration de fond correspondante */
export function useTheme(choice: ThemeChoice | undefined, seasonal = true) {
  const [hourTheme, setHourTheme] = useState<Theme>(byHour)
  const [date, setDate] = useState(() => new Date())

  // En automatique, on revérifie l'heure chaque minute (et le jour, pour la saison)
  useEffect(() => {
    const timer = setInterval(() => {
      setHourTheme(byHour())
      setDate(new Date())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const theme: Theme = !choice || choice === 'auto' ? hourTheme : choice
  const season = seasonal ? seasonOf(date) : null

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    if (season) document.documentElement.dataset.season = season
    else delete document.documentElement.dataset.season
  }, [theme, season])

  return { theme, season, backdrop: BACKDROPS[season ?? 'none'][theme] }
}
