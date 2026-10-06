import { useEffect, useState } from 'react'
import beachDay from '../assets/beach-day.svg'
import beachNight from '../assets/beach-night.svg'
import type { ThemeChoice } from '../../../shared/types'

export type Theme = 'day' | 'night'

/** En automatique : plage de jour de 7 h à 20 h, plage de nuit le reste du temps */
function byHour(): Theme {
  const h = new Date().getHours()
  return h >= 7 && h < 20 ? 'day' : 'night'
}

/** Applique le thème au document et renvoie l'illustration de fond correspondante */
export function useTheme(choice: ThemeChoice | undefined) {
  const [hourTheme, setHourTheme] = useState<Theme>(byHour)

  // En automatique, on revérifie l'heure chaque minute
  useEffect(() => {
    const timer = setInterval(() => setHourTheme(byHour()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const theme: Theme = !choice || choice === 'auto' ? hourTheme : choice

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return { theme, backdrop: theme === 'night' ? beachNight : beachDay }
}
