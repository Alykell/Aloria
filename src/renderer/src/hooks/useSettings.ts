import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [systemRamMb, setSystemRamMb] = useState(8192)

  useEffect(() => {
    window.aloria.settings.get().then((res) => {
      setSettings(res.settings)
      setSystemRamMb(res.systemRamMb)
    })
  }, [])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    setSettings(await window.aloria.settings.update(patch))
  }, [])

  return { settings, systemRamMb, update }
}

export type SettingsState = ReturnType<typeof useSettings>
