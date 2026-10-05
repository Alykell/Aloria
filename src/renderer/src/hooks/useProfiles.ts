import { useCallback, useEffect, useState } from 'react'
import type { Profile, ProfileInput } from '../../../shared/types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.aloria.profiles.list()
    setProfiles(res.profiles)
    setSelectedId(res.selectedId)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const run = async <T>(action: Promise<T>): Promise<T> => {
    const value = await action
    await refresh()
    return value
  }

  return {
    profiles,
    selected: profiles.find((p) => p.id === selectedId) ?? null,
    refresh,
    create: (input: ProfileInput) => run(window.aloria.profiles.create(input)),
    update: (id: string, patch: Partial<ProfileInput>) => run(window.aloria.profiles.update(id, patch)),
    select: (id: string) => run(window.aloria.profiles.select(id)),
    remove: (id: string, deleteFiles: boolean) => run(window.aloria.profiles.remove(id, deleteFiles))
  }
}

export type ProfilesState = ReturnType<typeof useProfiles>
