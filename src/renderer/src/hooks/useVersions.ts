import { useEffect, useState } from 'react'
import type { Profile, VersionEntry } from '../../../shared/types'

export function useVersions(showSnapshots: boolean) {
  const [versions, setVersions] = useState<VersionEntry[]>([])

  useEffect(() => {
    window.aloria.game.versions(showSnapshots).then((res) => {
      if (res.ok) setVersions(res.value)
    })
  }, [showSnapshots])

  return {
    versions,
    latestRelease: versions.find((v) => v.type === 'release')?.id ?? null,
    latestSnapshot: versions.find((v) => v.type === 'snapshot')?.id ?? null
  }
}

/** « Fabric 26.3 », « Dernière version », etc. */
export function describeProfile(p: Pick<Profile, 'versionId' | 'loader'>): string {
  const version =
    p.versionId === 'latest-release' ? 'Dernière version' : p.versionId === 'latest-snapshot' ? 'Dernier snapshot' : p.versionId
  return p.loader === 'fabric' ? `Fabric · ${version}` : version
}
